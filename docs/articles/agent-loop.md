# Pi 的 Agent Loop 实现剖析：从用户输入到模型输出

## 1. 全景：四个 package 的分工

Pi 的代码仓库按职责拆成几个 package，理解 agent loop 只需要关注这四个：

| Package | 职责 | 关键文件 |
| --- | --- | --- |
| `packages/ai` | 模型与 Provider 抽象。统一不同厂商 API（OpenAI、Anthropic、Google...）的流式调用接口 | `src/models.ts`、`src/utils/event-stream.ts`、`src/utils/validation.ts`、`src/api/*` |
| `packages/agent` | 核心 agent loop。与 UI、具体产品无关的"思考-行动循环"引擎 | `src/agent-loop.ts`、`src/agent.ts`、`src/types.ts`、`src/harness/` |
| `packages/coding-agent` | 应用层。把核心 loop 组装成真正可用的编码 agent：系统提示词、工具集、会话持久化、自动重试/压缩 | `src/core/agent-session.ts` |
| `packages/vscode-extension` | UI 层。负责 Webview 输入输出、把 agent 事件渲染成聊天界面 | `src/pi-agent-service.ts`、`src/chat-view-provider.ts` |

依赖方向是单向的：

```
vscode-extension ──> coding-agent ──> agent ──> ai
      (UI)              (应用)         (引擎)     (模型)
```

一个重要的设计原则是 **agent 引擎不知道外面是什么 UI**。`packages/agent` 只定义"事件"和"队列"这类抽象，由上层（coding-agent / vscode-extension）订阅事件做自己的事。

## 2. 一次请求的生命周期

先看整体时序，后面每一节再展开：

```
用户输入框打字
   │
   ▼
PiAgentService.prompt(text)                    [vscode-extension]
   │
   ▼
AgentSession.prompt(text)                      [coding-agent]
   │  校验模型/API key、展开 prompt 模板、预检工具
   ▼
Agent.prompt(message)                          [agent]
   │  创建 AbortController、标记 isStreaming
   ▼
runAgentLoop(prompts, context, config)         [agent-loop.ts]
   │  发射 agent_start / turn_start / message_start
   ▼
┌─────────────────────────────────────────────┐
│ runLoop 内层循环：                            │
│   ① streamAssistantResponse：调 LLM，流式收  │
│   ② 有 toolCall？→ 执行工具 → 结果回填 → 回到①│
│   ③ 没有 toolCall → 本轮 turn 结束            │
└─────────────────────────────────────────────┘
   │  每轮 turn_end 后检查 steering / follow-up 队列
   │  队列空 → agent_end
   ▼
事件流 (AgentEvent) 广播给订阅者
   ├─ AgentSession：把 message_end 持久化到会话存储
   ├─ AgentSession：检查是否需要自动重试 / 压缩
   └─ PiAgentService：把事件翻译成 webview 消息（append/replace）
   ▼
Webview 聊天界面渲染出完整回复
```

## 3. 核心概念

在深入循环之前，需要先理解三个贯穿全文的概念。

### 3.1 AgentMessage：内部消息模型

Pi 的循环内部不用 AI SDK 的原始消息类型，而是定义了自己的 `AgentMessage`（`packages/agent/src/types.ts`）：

```ts
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
```

它 = 标准 LLM 消息（`user` / `assistant` / `toolResult`）+ 应用自定义消息。编码 agent 用声明合并加了四种自定义角色（`packages/agent/src/harness/messages.ts`）：

- `bashExecution`：bash 命令执行记录（命令、输出、退出码）
- `custom`：扩展自定义消息
- `branchSummary`：分支切换摘要
- `compactionSummary`：上下文压缩摘要

**为什么要这样设计？** 这些"消息"**不该发给模型，但必须出现在会话历史里**（UI 要展示、用户要看到执行过程）。如果只保留标准消息，就会丢失 bash 执行的原始输出；如果全部发给模型，会浪费 token。所以 Pi 用一个宽类型承载所有历史，在真正调用 LLM 的边界再做裁剪。

### 3.2 convertToLlm：LLM 调用边界的转换

`AgentLoopConfig.convertToLlm` 负责把 `AgentMessage[]` 转换成 LLM 认识的 `Message[]`。编码 agent 的实现（`harness/messages.ts` 的 `convertToLlm`）：

- `bashExecution` → 转成 `user` 消息（格式化命令+输出）；`excludeFromContext` 时直接过滤
- `custom` / `branchSummary` / `compactionSummary` → 转成 `user` 消息
- 标准消息 → 原样透传
- 无法转换的 → 过滤掉

这个函数**在每个 LLM 调用前都会执行一次**（不是只执行一次），所以 `agent-loop.ts` 的注释强调：

> `convertToLlm` is only called once per turn.

`convertToLlm` 之上还有一层 `transformContext`，它作用在 `AgentMessage` 层面，用来做上下文窗口管理（剪掉旧消息、注入外部上下文）。两者的分工是：**transformContext 管"哪些历史保留"，convertToLlm 管"保留的历史怎么变成模型能读的格式"**。

### 3.3 EventStream：事件流工具

`packages/ai/src/utils/event-stream.ts` 实现了一个简单的 `EventStream<T, R>`：

```ts
export class EventStream<T, R = T> implements AsyncIterable<T> {
    push(event: T): void;                       // 生产者推入事件
    end(result?: R): void;                      // 生产者结束流并给出最终结果
    async *[Symbol.asyncIterator]();            // 消费者 for await 迭代
    result(): Promise<R>;                       // 拿到最终结果（异步）
}
```

内部机制：

- 生产者 `push` 时，如果有等待中的消费者（`waiting` 队列），直接把事件交给它；否则放进内部 `queue`。
- 消费者迭代时，先消费 `queue`，队列空了就挂起，把 resolve 放进 `waiting`，等下一个 `push`。
- `isComplete` 判断哪个事件代表结束；`extractResult` 从结束事件提取最终结果。`end()` 通知所有等待者结束。

`AssistantMessageEventStream` 继承它：以 `done` / `error` 事件为结束，从中提取最终的 `AssistantMessage`。

这个工具是整个流式架构的地基：**LLM 响应是事件流，agent loop 的输出也是事件流**，异步生产、异步消费，天然支持流式打字效果。

## 4. 输入层：从 UI 到引擎

### 4.1 vscode-extension 层

用户在 Webview 输入框回车 → `PiAgentService.prompt(text, streamingBehavior)`（`pi-agent-service.ts`）→ 调用 `session.prompt(text, ...)`。

### 4.2 AgentSession.prompt

`AgentSession.prompt`（`coding-agent/src/core/agent-session.ts`，约 3300 行，是应用层最复杂的类）在真正发请求前做了几件事：

1. **校验**：确认已选模型、API key 可用（`_getRequiredRequestAuth`）
2. **展开 prompt 模板**：`/foo arg1 arg2` 这类模板会被展开成完整指令
3. **预检**：确认工具存在、参数合法
4. 最终调用 `this.agent.prompt(messages)`，然后循环：

```ts
await this.agent.prompt(messages);
while (await this._handlePostAgentRun()) {
    await this.agent.continue();   // 重试 / 压缩后继续
}
```

### 4.3 Agent.prompt → runAgentLoop

`Agent`（`packages/agent/src/agent.ts`）是引擎的"有状态包装器"：它持有当前 transcript、系统提示词、工具列表，对外暴露 `prompt` / `steer` / `followUp` / `abort` / `subscribe`。

`prompt` 做了三件事：

1. 把输入规范成 `AgentMessage[]`（字符串 → `user` 消息，可附带图片，见 `normalizePromptInput`）
2. 通过 `runWithLifecycle` 创建 `AbortController`、置 `isStreaming = true`
3. 调用 `runAgentLoop(...)`（`createContextSnapshot` 传上下文快照，`createLoopConfig` 传配置）

注意 `createContextSnapshot` 里 `messages: this._state.messages.slice()`、`tools: this._state.tools.slice()`——**传进去的是拷贝**，避免 loop 运行期间外部改状态数组导致数据竞争。

## 5. Agent Loop 引擎（代码走读）

这一节是全文核心。建议打开 `packages/agent/src/agent-loop.ts` 对照阅读。

### 5.1 四个入口函数

文件暴露两对函数：

| 函数 | 用途 | 返回 |
| --- | --- | --- |
| `agentLoop(prompts, context, config, signal, streamFn)` | 带新提示词启动 loop | `EventStream<AgentEvent, AgentMessage[]>` |
| `agentLoopContinue(context, config, signal, streamFn)` | 不新增消息，从当前上下文继续（重试用） | 同上 |
| `runAgentLoop(...)` | `agentLoop` 的底层 async 实现 | `Promise<AgentMessage[]>` |
| `runAgentLoopContinue(...)` | `agentLoopContinue` 的底层 async 实现 | `Promise<AgentMessage[]>` |

`agentLoop` 只是把 `runAgentLoop` 包进一个 `EventStream`：内部创建一个流，把 `runAgentLoop` 的每个事件 `push` 进去，结束时 `end(messages)`。这样调用方既能 `for await` 事件，也能 `await stream.result()` 拿最终消息数组。

`createAgentStream` 定义了流的边界：

```ts
return new EventStream<AgentEvent, AgentMessage[]>(
    (event) => event.type === "agent_end",     // agent_end 是结束事件
    (event) => (event.type === "agent_end" ? event.messages : []),  // 最终结果 = 本轮新增消息
);
```

### 5.2 runAgentLoop 的启动序列

```ts
const newMessages: AgentMessage[] = [...prompts];          // 返回值 = 本轮新增的消息
const currentContext: AgentContext = {
    ...context,
    messages: [...context.messages, ...prompts],           // 上下文 = 旧历史 + 新提示词
};

await emit({ type: "agent_start" });
await emit({ type: "turn_start" });
for (const prompt of prompts) {
    await emit({ type: "message_start", message: prompt });
    await emit({ type: "message_end", message: prompt });
}

await runLoop(currentContext, newMessages, config, signal, emit, streamFn ?? getDefaultStreamFn());
return newMessages;
```

要点：

- **发射顺序固定**：`agent_start` → `turn_start` → 每个 prompt 的 `message_start`/`message_end` → 进入 `runLoop`。
- 返回的 `newMessages` 只包含**本次运行新增**的消息（提示词 + assistant 响应 + 工具结果），不包含旧历史。`agent_end` 事件里带的也是它。
- `runAgentLoopContinue` 有两条前置校验：上下文不能为空、最后一条消息不能是 `assistant`（因为 LLM 协议要求最后一条是 user 或 toolResult，否则 provider 会拒绝请求）。它的 `newMessages` 是空数组。

### 5.3 runLoop：双层循环状态机

```ts
async function runLoop(initialContext, newMessages, initialConfig, signal, emit, streamFunction) {
    let currentContext = initialContext;
    let config = initialConfig;
    let firstTurn = true;
    // 一开始就轮询一次 steering 队列：用户可能在 agent 启动前就打了字
    let pendingMessages = (await config.getSteeringMessages?.()) || [];

    while (true) {                                    // 外层：follow-up 循环
        let hasMoreToolCalls = true;

        while (hasMoreToolCalls || pendingMessages.length > 0) {   // 内层：工具循环
            if (!firstTurn) {
                await emit({ type: "turn_start" });
            } else {
                firstTurn = false;    // 第一个 turn 不重复发 turn_start（runAgentLoop 已发）
            }

            // ① 注入 pending 消息（steering 或 follow-up 带来的）
            if (pendingMessages.length > 0) {
                for (const message of pendingMessages) {
                    await emit({ type: "message_start", message });
                    await emit({ type: "message_end", message });
                    currentContext.messages.push(message);
                    newMessages.push(message);
                }
                pendingMessages = [];
            }

            // ② 调 LLM（详见第 6 节）
            const message = await streamAssistantResponse(currentContext, config, signal, emit, streamFunction);
            newMessages.push(message);

            // ③ error / aborted 直接收尾
            if (message.stopReason === "error" || message.stopReason === "aborted") {
                await emit({ type: "turn_end", message, toolResults: [] });
                await emit({ type: "agent_end", messages: newMessages });
                return;
            }

            // ④ 检查工具调用
            const toolCalls = message.content.filter((c) => c.type === "toolCall");
            const toolResults: ToolResultMessage[] = [];
            hasMoreToolCalls = false;
            if (toolCalls.length > 0) {
                const executedToolBatch =
                    message.stopReason === "length"
                        ? await failToolCallsFromTruncatedMessage(toolCalls, emit)   // 截断：全部失败
                        : await executeToolCalls(currentContext, message, config, signal, emit);
                toolResults.push(...executedToolBatch.messages);
                hasMoreToolCalls = !executedToolBatch.terminate;

                for (const result of toolResults) {
                    currentContext.messages.push(result);   // 工具结果进上下文
                    newMessages.push(result);
                }
            }

            // ⑤ turn 结束：发射 turn_end
            await emit({ type: "turn_end", message, toolResults });

            // ⑥ prepareNextTurn：可以替换下一轮的上下文/模型/思考级别
            const nextTurnSnapshot = await config.prepareNextTurn?.({
                message, toolResults, context: currentContext, newMessages,
            });
            if (nextTurnSnapshot) {
                currentContext = nextTurnSnapshot.context ?? currentContext;
                config = {
                    ...config,
                    model: nextTurnSnapshot.model ?? config.model,
                    reasoning: nextTurnSnapshot.thinkingLevel === undefined
                        ? config.reasoning
                        : nextTurnSnapshot.thinkingLevel === "off" ? undefined : nextTurnSnapshot.thinkingLevel,
                };
            }

            // ⑦ shouldStopAfterTurn：优雅提前停止
            if (await config.shouldStopAfterTurn?.({ message, toolResults, context: currentContext, newMessages })) {
                await emit({ type: "agent_end", messages: newMessages });
                return;
            }

            // ⑧ 轮询 steering 队列（内层循环的出口之一）
            pendingMessages = (await config.getSteeringMessages?.()) || [];
        }

        // 内层退出 = agent 本来要停了。此时才检查 follow-up 队列
        const followUpMessages = (await config.getFollowUpMessages?.()) || [];
        if (followUpMessages.length > 0) {
            pendingMessages = followUpMessages;   // 转成 pending，回到内层循环
            continue;
        }
        break;   // 真的结束了
    }

    await emit({ type: "agent_end", messages: newMessages });
}
```

#### 状态变量

| 变量 | 含义 |
| --- | --- |
| `currentContext` | 可变上下文快照。助手消息、工具结果、pending 消息都会 push 进它的 `messages`。`prepareNextTurn` 可以整体替换它 |
| `config` | 每轮配置。`prepareNextTurn` 可以替换其中的 `model` / `reasoning` |
| `newMessages` | 本轮新增消息数组，最终随 `agent_end` 返回 |
| `hasMoreToolCalls` | 内层循环是否继续：有工具结果且未被终止 → true |
| `pendingMessages` | 待注入消息：steering 注入点 ⑧、follow-up 注入点（外层）都汇到这里 |
| `firstTurn` | 第一个 turn 不重复发 `turn_start` |

#### 内层循环的三个出口

1. **③ error / aborted**：立即 `turn_end` + `agent_end` 并 return（工具结果为空）。
2. **⑦ shouldStopAfterTurn 返回 true**：发 `agent_end` 直接 return，不再轮询任何队列。
3. **⑧ steering 队列空且 `hasMoreToolCalls` 为 false**：正常退出内层，进入外层检查 follow-up。

#### 外层循环的语义

内层退出意味着"agent 这一轮没有更多动作要做"。但用户可能在 agent 快做完时排了一条 follow-up 消息（比如"完成后跑一下测试"）。外层循环给 follow-up 一个注入点：把它变成 pending 消息回到内层再跑一轮。只有两个队列都空了才真正结束。

### 5.4 stopReason 分发

`AssistantMessage.stopReason` 有五种取值（`ai/src/types.ts`），loop 对每种的处理：

| stopReason | 含义 | loop 的行为 |
| --- | --- | --- |
| `stop` | 正常结束 | 若没有 toolCall，内层正常退出 |
| `toolUse` | 模型要调用工具 | 进入 `executeToolCalls` |
| `length` | 输出被 token 上限截断 | **不执行任何工具调用**，全部标记失败（见 7.7） |
| `error` | 请求失败 | 立即收尾（③） |
| `aborted` | 被取消 | 立即收尾（③） |

注意：判断是否执行工具用的是 `message.content` 里有没有 `toolCall` 块，而不是 stopReason。`length` 截断时模型**可能**已经产出了 toolCall 块，但参数不完整——所以要用 stopReason 单独拦截。

### 5.5 钩子时机总结

| 钩子 | 调用时机 | 返回值语义 |
| --- | --- | --- |
| `transformContext` | 每次 LLM 调用前 | 裁剪后的 `AgentMessage[]` |
| `convertToLlm` | 每次 LLM 调用前（transformContext 之后） | LLM 可读的 `Message[]` |
| `getApiKey` | 每次 LLM 调用前 | API key（支持过期 token 动态刷新） |
| `getSteeringMessages` | 启动时一次 + 每个 turn 结束（⑧） | 要注入的 steering 消息 |
| `getFollowUpMessages` | 内层退出后（外层） | 要注入的 follow-up 消息 |
| `prepareNextTurn` | 每个 turn_end 之后 | 下一轮的 context/model/thinkingLevel |
| `shouldStopAfterTurn` | prepareNextTurn 之后 | 是否提前停止 |
| `beforeToolCall` | 工具执行前，参数校验后 | 是否 block |
| `afterToolCall` | 工具执行后 | 对结果的字段级 patch |

### 5.6 队列语义：steering vs follow-up

为什么分两个队列而不是一个？因为插入时机不同：

- **steering（转向）**：agent 正在干活时用户插话"先别改这个文件"。要**尽快**生效——内层每轮结束就轮询（⑧），且 `one-at-a-time` 模式每次只取一条，避免一次性注入一堆旧消息打乱 agent 当前思路。
- **follow-up（追问）**：应该在 agent 全部工作完成后再处理（"改完跑下测试"）。所以在外层才轮询。

两个队列在 `Agent` 类里用 `PendingMessageQueue` 管理，`QueueMode` 控制取消息策略：

- `"one-at-a-time"`（默认）：每次只取最老一条，其余继续排队
- `"all"`：一次全部取走

## 6. 流式响应（代码走读）

### 6.1 StreamFn 契约

agent loop 不直接依赖任何 Provider，它依赖一个接口 `StreamFn`（`types.ts`）：

```ts
export type StreamFn = (
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions,
) => AssistantMessageEventStream | Promise<AssistantMessageEventStream>;
```

契约有三条硬性要求：

1. **不许 throw**：任何请求/模型/运行时失败都要编码到返回的流里，最终给一个 `stopReason: "error"` 或 `"aborted"` 的 `AssistantMessage`
2. 必须返回 `AssistantMessageEventStream`
3. 失败通过协议事件 + 最终消息表达

这样 `streamAssistantResponse` 不需要 try/catch 包一层——**错误也是流的一部分**，用 `for await` 统一处理。这是整个架构里很重要的设计：异步失败和正常数据流走同一条通道。

`Models.streamSimple`（`ai/src/models.ts`）就是满足这个契约的标准实现：按 `model.api` 分派到对应厂商的 API 实现，先解析认证（API key / headers），再交给 `provider.streamSimple`。它用 `lazyStream` 包装——**流是惰性的**：只有消费者开始 `for await` 时，才会真正发起网络请求。这允许调用方先拿到流对象、后面再决定何时消费。

### 6.2 streamAssistantResponse 逐步走读

```ts
async function streamAssistantResponse(context, config, signal, emit, streamFunction): Promise<AssistantMessage> {
    // ① 上下文变换（AgentMessage[] → AgentMessage[]）：裁剪历史、注入外部上下文
    let messages = context.messages;
    if (config.transformContext) {
        messages = await config.transformContext(messages, signal);
    }

    // ② 转换成 LLM 消息（AgentMessage[] → Message[]）
    const llmMessages = await config.convertToLlm(messages);

    // ③ 组装 LLM 上下文
    const llmContext: Context = {
        systemPrompt: context.systemPrompt,
        messages: llmMessages,
        tools: context.tools,
    };

    // ④ 动态解析 API key（对 OAuth 短效 token 很重要，长任务中可能已过期）
    const resolvedApiKey =
        (config.getApiKey ? await config.getApiKey(config.model.provider) : undefined) || config.apiKey;

    // ⑤ 调用 StreamFn
    const response = await streamFunction(config.model, llmContext, {
        ...config,
        apiKey: resolvedApiKey,
        signal,
    });

    // ⑥ 消费事件流
    let partialMessage: AssistantMessage | null = null;
    let addedPartial = false;

    for await (const event of response) {
        switch (event.type) {
            case "start": {
                partialMessage = event.partial;
                context.messages.push(partialMessage);          // 放进上下文末尾
                addedPartial = true;
                await emit({ type: "message_start", message: { ...partialMessage } });
                break;
            }
            case "text_start": case "text_delta": case "text_end":
            case "thinking_start": case "thinking_delta": case "thinking_end":
            case "toolcall_start": case "toolcall_delta": case "toolcall_end":
                if (partialMessage) {
                    partialMessage = event.partial;
                    context.messages[context.messages.length - 1] = partialMessage;  // 原地替换
                    await emit({ type: "message_update", assistantMessageEvent: event, message: { ...partialMessage } });
                }
                break;
            case "done": case "error": {
                const finalMessage = await response.result();    // 拿最终消息
                if (addedPartial) {
                    context.messages[context.messages.length - 1] = finalMessage;
                } else {
                    context.messages.push(finalMessage);
                }
                if (!addedPartial) {
                    await emit({ type: "message_start", message: { ...finalMessage } });
                }
                await emit({ type: "message_end", message: finalMessage });
                return finalMessage;
            }
        }
    }

    // ⑦ 流没有 done/error 就结束了（异常情况）也要收尾
    const finalMessage = await response.result();
    // ... 同样的收尾逻辑
    return finalMessage;
}
```

### 6.3 partial 消息的生命周期

关键设计是**在上下文的最后一个位置维护 partial 消息**：

1. `start` 事件：partial 消息**第一次** push 进 `context.messages` 末尾，发射 `message_start`（对外是快照拷贝）。
2. 增量事件（text_delta / toolcall_delta...）：`event.partial` 携带**累积**的最新状态，直接替换上下文最后一项——上下文始终保持"最新完整状态"，不需要 diff。
3. `done` / `error`：`response.result()` 拿到最终定稿，替换最后一项，发射 `message_end`。

对外发射事件时用的是 `{ ...partialMessage }` 拷贝——订阅者（UI）拿到的是**不可变快照**，避免 UI 持有引用时被后续更新悄悄改掉。而上下文里是同一个对象持续被替换，保证下一轮 LLM 调用时看到的是最新累积结果。

### 6.4 provider 事件类型

| 事件 | 含义 | loop 的动作 |
| --- | --- | --- |
| `start` | 响应开始，携带首个 partial | push 上下文 + `message_start` |
| `text_start/delta/end` | 正文流式增量 | 替换上下文 + `message_update` |
| `thinking_start/delta/end` | 推理过程增量 | 同上 |
| `toolcall_start/delta/end` | 工具调用参数增量 | 同上 |
| `done` | 正常结束 | 定稿 + `message_end` |
| `error` | 出错 | 定稿（带 errorMessage）+ `message_end`，随后 loop 走 5.4 的 error 分支 |

## 7. 工具执行（代码走读）

### 7.1 执行策略决策

```ts
async function executeToolCalls(currentContext, assistantMessage, config, signal, emit) {
    const toolCalls = assistantMessage.content.filter((c) => c.type === "toolCall");
    const hasSequentialToolCall = toolCalls.some(
        (tc) => currentContext.tools?.find((t) => t.name === tc.name)?.executionMode === "sequential",
    );
    if (config.toolExecution === "sequential" || hasSequentialToolCall) {
        return executeToolCallsSequential(...);   // 逐个执行
    }
    return executeToolCallsParallel(...);          // 并行执行
}
```

默认 `toolExecution` 是 `"parallel"`。注意一个细节：**只要有一个工具声明自己必须串行，整批都变串行**——因为并行执行时"读-改-写"的文件操作可能互相踩踏。这是"宁可慢一点，不可出错"的体现。

### 7.2 串行执行流程

```ts
for (const toolCall of toolCalls) {
    // 1. tool_execution_start
    await emit({ type: "tool_execution_start", toolCallId, toolName, args });

    // 2. 预检：prepareToolCall → immediate（失败/被block）或 prepared
    const preparation = await prepareToolCall(currentContext, assistantMessage, toolCall, config, signal);
    let finalized;
    if (preparation.kind === "immediate") {
        finalized = { toolCall, result: preparation.result, isError: preparation.isError };
    } else {
        const executed = await executePreparedToolCall(preparation, signal, emit);
        finalized = await finalizeExecutedToolCall(currentContext, assistantMessage, preparation, executed, config, signal);
    }

    // 3. tool_execution_end（携带最终结果）
    await emitToolExecutionEnd(finalized, emit);

    // 4. 生成工具结果消息，发射 message_start/message_end，收进数组
    const toolResultMessage = createToolResultMessage(finalized);
    await emitToolResultMessage(toolResultMessage, emit);
    messages.push(toolResultMessage);

    if (signal?.aborted) break;   // 被中止就停下
}
```

串行模式下，每个工具**完整走完**（start → 执行 → end → 结果消息）才轮到下一个。事件顺序就是工具顺序。

### 7.3 并行执行流程：三阶段

并行不是简单 `Promise.all`，而是精心设计的三个阶段：

**阶段一：顺序预检（preflight）**

```ts
for (const toolCall of toolCalls) {
    await emit({ type: "tool_execution_start", ... });          // 所有工具先发 start

    const preparation = await prepareToolCall(...);              // 顺序预检
    if (preparation.kind === "immediate") {
        // 校验失败/被block：立即 finalize 并发 tool_execution_end
        const finalized = { toolCall, result, isError };
        await emitToolExecutionEnd(finalized, emit);
        finalizedCalls.push(finalized);
        continue;
    }
    // 通过预检的：暂存为"待执行"闭包（注意还没执行！）
    finalizedCalls.push(async () => {
        const executed = await executePreparedToolCall(preparation, signal, emit);
        const finalized = await finalizeExecutedToolCall(...);
        await emitToolExecutionEnd(finalized, emit);
        return finalized;
    });
}
```

**阶段二：并发执行**

```ts
const orderedFinalizedCalls = await Promise.all(
    finalizedCalls.map((entry) => (typeof entry === "function" ? entry() : Promise.resolve(entry))),
);
```

**阶段三：按原始顺序收尾**

```ts
const messages: ToolResultMessage[] = [];
for (const finalized of orderedFinalizedCalls) {
    const toolResultMessage = createToolResultMessage(finalized);
    await emitToolResultMessage(toolResultMessage, emit);   // 结果消息按 source 顺序
    messages.push(toolResultMessage);
}
```

为什么分成 `FinalizedToolCallEntry = FinalizedToolCallOutcome | (() => Promise<...>)` 这种"立即值或延迟执行闭包"的联合类型？因为 `Promise.all` 需要数组里的每一项都是值或 Promise，而立即失败的不该再执行——用闭包延迟，用 `typeof entry === "function"` 区分。

**事件顺序的关键细节**：

- `tool_execution_start`：全部**先发**（预检阶段顺序发）
- `tool_execution_end`：按**完成顺序**发（`Promise.all` 里谁先 settle 谁先发）——UI 能立刻看到先完成的工具结果
- 工具结果**消息**（进入上下文的）：按 **assistant 原始顺序**发——保证会话历史里"工具调用 → 结果"一一对应，LLM 不会混淆

### 7.4 prepareToolCall：预检三件事

```ts
async function prepareToolCall(currentContext, assistantMessage, toolCall, config, signal) {
    const tool = currentContext.tools?.find((t) => t.name === toolCall.name);
    if (!tool) {
        return { kind: "immediate", result: createErrorToolResult(`Tool ${toolCall.name} not found`), isError: true };
    }

    try {
        // ① prepareArguments：兼容层，把老模型的参数改写成符合 schema 的形状
        const preparedToolCall = prepareToolCallArguments(tool, toolCall);

        // ② validateToolArguments：TypeBox schema 校验 + 类型强制转换
        const validatedArgs = validateToolArguments(tool, preparedToolCall);

        // ③ beforeToolCall 钩子：可以 block
        if (config.beforeToolCall) {
            const beforeResult = await config.beforeToolCall(
                { assistantMessage, toolCall, args: validatedArgs, context: currentContext }, signal);
            if (beforeResult?.block) {
                return { kind: "immediate", result: createErrorToolResult(beforeResult.reason || "Tool execution was blocked"), isError: true };
            }
        }
        if (signal?.aborted) { /* immediate: Operation aborted */ }

        return { kind: "prepared", toolCall, tool, args: validatedArgs };
    } catch (error) {
        // 校验抛错（参数不合法）→ immediate 错误结果
        return { kind: "immediate", result: createErrorToolResult(...), isError: true };
    }
}
```

**validateToolArguments 的细节**（`ai/src/utils/validation.ts`）值得单独讲：

1. `structuredClone(toolCall.arguments)`：先拷贝，避免原地修改模型返回的参数对象
2. `Value.Convert(tool.parameters, args)`：TypeBox 内置的类型转换（`"123"` → `123` 等）
3. 对非 TypeBox schema（纯 JSON Schema），用自定义的 `coerceWithJsonSchema` 做深度强制转换（处理 `allOf`/`anyOf`/`oneOf` 联合、数组项、对象属性）
4. 校验失败时**不抛裸错误**，而是格式化出可读的错误消息：`Validation failed for tool "xxx":\n  - path: message\n...` + 收到的原始参数 JSON——这会让模型下一轮看到"哪里不对"，从而自我修正

校验器用 `WeakMap` 缓存编译结果（`validatorCache`），避免每个工具调用都重新编译 schema。

### 7.5 executePreparedToolCall：执行与 onUpdate

```ts
async function executePreparedToolCall(prepared, signal, emit) {
    const updateEvents: Promise<void>[] = [];
    let acceptingUpdates = true;

    try {
        const result = await prepared.tool.execute(
            prepared.toolCall.id,
            prepared.args,
            signal,
            (partialResult) => {                       // onUpdate：流式部分结果
                if (!acceptingUpdates) return;          // 执行已结束就忽略
                updateEvents.push(Promise.resolve(
                    emit({ type: "tool_execution_update", toolCallId, toolName, args, partialResult }),
                ));
            },
        );
        acceptingUpdates = false;
        await Promise.all(updateEvents);                // 等所有 update 事件发射完
        return { result, isError: false };
    } catch (error) {
        acceptingUpdates = false;
        await Promise.all(updateEvents);
        return { result: createErrorToolResult(...), isError: true };   // 抛错 → 错误结果
    } finally {
        acceptingUpdates = false;
    }
}
```

`onUpdate` 的设计：工具在长时间运行中（如 bash 命令正在输出）通过回调上报部分结果，agent 把它转成 `tool_execution_update` 事件给 UI。注意 `acceptingUpdates` 标志——工具 promise 已经 settle 之后来的回调会被忽略，防止执行结束后还往事件流里塞东西。

### 7.6 finalizeExecutedToolCall：afterToolCall patch

```ts
if (config.afterToolCall) {
    const afterResult = await config.afterToolCall({ assistantMessage, toolCall, args, result, isError, context }, signal);
    if (afterResult) {
        result = {
            ...result,
            content: afterResult.content ?? result.content,   // 字段级覆盖，无深合并
            details: afterResult.details ?? result.details,
            usage: afterResult.usage ?? result.usage,
            terminate: afterResult.terminate ?? result.terminate,
        };
        isError = afterResult.isError ?? isError;
    }
}
```

`afterToolCall` 返回的 patch 是**字段级覆盖**：提供了就替换，没提供保留原值。没有深合并——`content` 数组、`details` 对象都是整块替换。编码 agent 用这个钩子把扩展（extension）对工具结果的改写注入回去。

### 7.7 失败路径汇总

| 场景 | 路径 | 结果 |
| --- | --- | --- |
| 工具不存在 | `prepareToolCall` immediate | 错误结果 `Tool xxx not found` |
| 参数校验失败 | `validateToolArguments` 抛错 | 带格式化错误信息的错误结果 |
| 被 `beforeToolCall` block | immediate | `reason` 文本作为错误结果 |
| 执行抛错 | `executePreparedToolCall` catch | 错误消息作为结果 |
| `afterToolCall` 钩子抛错 | `finalizeExecutedToolCall` catch | 钩子错误作为结果 |
| `length` 截断 | `failToolCallsFromTruncatedMessage` | **所有**工具调用直接失败，提示模型重发 |

**length 截断是特例**：流式工具调用参数是用"尽力而为"的 JSON 恢复解析器补全的（`toolcall_delta` 片段拼起来），截断时参数可能被静默截断但解析成功。执行这种残缺参数比不执行更危险。Pi 的选择是：一个都不执行，每个都发 `tool_execution_start`/`tool_execution_end` 并带上错误说明"re-issue the tool call with complete arguments"。

### 7.8 terminate：批量提前终止

`AgentToolResult.terminate` 是"本轮工具批次结束后停止"的提示。规则很严格：

```ts
function shouldTerminateToolBatch(finalizedCalls) {
    return finalizedCalls.length > 0 && finalizedCalls.every((f) => f.result.terminate === true);
}
```

**必须本批所有工具结果都标记 terminate 才停止**——防止"有的想继续、有的想停"时出现不一致状态。它控制的是 `hasMoreToolCalls`：为 true 时内层循环退出（不再发起下一次 LLM 调用）。

### 7.9 工具结果消息的规范化

```ts
function createToolResultMessage(finalized) {
    return {
        role: "toolResult",
        toolCallId: finalized.toolCall.id,
        toolName: finalized.toolCall.name,
        content: finalized.result.content ?? [],       // 空数组兜底
        details: finalized.result.details,
        usage: finalized.result.usage,
        ...(finalized.result.addedToolNames?.length ? { addedToolNames: finalized.result.addedToolNames } : {}),
        isError: finalized.isError,
        timestamp: Date.now(),
    };
}
```

注释里点明了一个现实问题：JS 扩展写的工具可能返回没有 `content` 的结果。`?? []` 兜底保证 `null` 永远不会进入会话历史或 provider 请求载荷（否则 Anthropic 等 API 会拒绝）。

## 8. 事件系统与 Agent 状态机

### 8.1 AgentEvent 全类型

agent loop 对外只发事件，不发命令。事件分四组（`types.ts`）：

- **Agent 生命周期**：`agent_start` / `agent_end`（携带本轮 `newMessages`）
- **Turn 生命周期**：`turn_start` / `turn_end`（携带 assistant 消息 + 工具结果）
- **消息生命周期**：`message_start`（user/assistant/toolResult 都有）/ `message_update`（仅 assistant 流式期间，携带底层 provider 事件）/ `message_end`
- **工具执行**：`tool_execution_start` / `tool_execution_update`（onUpdate 部分结果）/ `tool_execution_end`（最终结果 + isError）

### 8.2 processEvents：状态归约 + 通知

`Agent.processEvents`（`agent.ts`）是事件系统的核心，每个事件做两件事：

```ts
private async processEvents(event: AgentEvent) {
    switch (event.type) {
        case "message_start": case "message_update":
            this._state.streamingMessage = event.message;    // 记录正在流式的消息
            break;
        case "message_end":
            this._state.streamingMessage = undefined;
            this._state.messages.push(event.message);        // 归约：正式进入 transcript
            break;
        case "tool_execution_start":
            this._state.pendingToolCalls = new Set(this._state.pendingToolCalls).add(event.toolCallId);
            break;
        case "tool_execution_end":
            // 从 pendingToolCalls 删除
            break;
        case "turn_end":
            if (event.message.role === "assistant" && event.message.errorMessage) {
                this._state.errorMessage = event.message.errorMessage;
            }
            break;
        case "agent_end":
            this._state.streamingMessage = undefined;
            break;
    }

    const signal = this.activeRun?.abortController.signal;
    if (!signal) throw new Error("Agent listener invoked outside active run");
    for (const listener of this.listeners) {
        await listener(event, signal);   // 按订阅顺序 await
    }
}
```

要点：

- **状态归约**：agent 的公开状态（`state.messages`、`state.streamingMessage`、`state.pendingToolCalls`、`state.errorMessage`）完全由事件驱动，是事件的"投影"。
- **订阅者顺序执行**：listener 按订阅顺序 `await`，且拿到当前 run 的 abort signal。订阅者抛错会中断当前 run——所以 AgentSession 的处理器从不抛错。
- 注意 `pendingToolCalls` 用 `new Set(...).add()` 不可变更新——`AgentState` 的 `pendingToolCalls` 是 `ReadonlySet`，防止外部直接改。

### 8.3 Agent 生命周期

`Agent` 维护一个 `ActiveRun`（`promise` + `resolve` + `abortController`）：

- `runWithLifecycle`：创建 run，`isStreaming = true`，执行，`finally` 里 `finishRun()`（置 `isStreaming = false`、清 `pendingToolCalls`、resolve run promise、清 `activeRun`）
- **并发保护**：`prompt` / `continue` 开头都检查 `if (this.activeRun) throw new Error("Agent is already processing...")`——同一时刻只有一个 run，多出的消息请走 `steer()` / `followUp()` 队列
- `waitForIdle()`：resolve 当 run 和所有已 await 的 listener 结束
- **`agent_end` 语义细节**：`agent_end` 发射后不再有新的 loop 事件，但 agent 要到所有 listener 处理完 `agent_end` 才真正 idle——UI 利用这个时机做收尾（关掉"正在工作"指示器）

### 8.4 失败处理

`runWithLifecycle` catch 到异常时走 `handleRunFailure`：构造一条 `stopReason: aborted ? "aborted" : "error"` 的失败 assistant 消息，然后**按正常事件序列发射** `message_start` → `message_end` → `turn_end` → `agent_end`。

这是"失败也是数据流"原则的又一次体现：即使 runAgentLoop 本身抛了未捕获异常（理论上不该发生，因为 StreamFn 契约禁止 throw），外部也只看到一条普通的失败消息，UI 不需要额外错误分支。

### 8.5 Agent.continue

`continue()` 处理"最后一条消息是 assistant"的情况：先 drain steering 队列，有则走 `runPromptMessages`；没有则 drain follow-up 队列；再没有就抛错。最后一条是 user/toolResult 时才走 `runAgentLoopContinue`（不新增消息继续）。注意 LLM 协议约束：**最后一条不能是 assistant**，否则 provider 拒绝请求。

## 9. AgentHarness：loop 配置的生产者

`AgentHarness`（`packages/agent/src/harness/agent-harness.ts`）是 `Agent` 的一个更完整的变体，编码 agent 的 TUI 模式用它。它把 `AgentLoopConfig` 的每个钩子都接上真实逻辑。

### 9.1 createTurnState：每轮的状态快照

每次发 LLM 请求前（`prepareNextTurn` 里）都会调用 `createTurnState()` 重建快照：

```ts
const context = await this.session.buildContext();      // 从会话存储构建消息历史
const resources = this.getResources();                  // skills / promptTemplates
const toolContext = await this.resolveToolContext();    // 动态工具上下文（可能是函数）
const systemPrompt = await this.systemPrompt({ session, model, thinkingLevel, activeTools, resources });
```

系统提示词支持**动态构建**：传入函数时每轮都重新生成——这样用户切换了模型、工具集或思考级别后，提示词会跟着变。

### 9.2 createContext 与工具上下文绑定

```ts
tools: turnState.activeTools.map((tool) => this.bindToolContext(tool, turnState.toolContext)),
```

`bindToolContext` 把工具上下文（如 cwd、agentDir）**闭包绑定**进 `execute`，生成一个适配 `AgentTool` 接口的新工具——工具实现本身不用感知上下文参数。

### 9.3 createStreamFn：接到 Models

```ts
return async (model, context, streamOptions) => {
    const requestOptions = await this.emitBeforeProviderRequest(model, sessionId, snapshotOptions);
    return this.models.streamSimple(model, context, {
        cacheRetention: requestOptions.cacheRetention,
        headers: requestOptions.headers,
        maxRetries: requestOptions.maxRetries,
        maxRetryDelayMs: requestOptions.maxRetryDelayMs,
        metadata: requestOptions.metadata,
        onPayload: async (payload) => await this.emitBeforeProviderPayload(model, payload),  // 扩展可改请求体
        onResponse: async (response) => { /* 发射 after_provider_response */ },
        reasoning: streamOptions?.reasoning,
        signal: streamOptions?.signal,
        sessionId: turnState.sessionId,     // 转给 provider 做缓存感知
        timeoutMs: requestOptions.timeoutMs,
        transport: requestOptions.transport,
    });
};
```

`before_provider_request` 是**扩展钩子**：扩展可以返回 streamOptions patch（改 headers、超时、重试数），真正发请求前被应用。

### 9.4 createLoopConfig：钩子全接上

| 钩子 | AgentHarness 的接法 |
| --- | --- |
| `transformContext` | 发射 `context` 钩子事件，扩展可以返回替换后的消息 |
| `beforeToolCall` | 发射 `tool_call` 钩子事件，扩展返回 block/reason |
| `afterToolCall` | 发射 `tool_result` 钩子事件，扩展返回 patch |
| `prepareNextTurn` | flush 待写会话 + 重建 turnState（模型切换/思考级别变化在此生效） |
| `getSteeringMessages` | drain 内部 steer 队列（`steer()` 方法入队） |
| `getFollowUpMessages` | drain follow-up 队列（`followUp()` 方法入队） |

### 9.5 executeTurn 与持久化

`executeTurn` 合并 `nextTurnQueue`（`nextTurn()` 入队的消息）、发射 `before_agent_start` 钩子（可追加消息/覆盖系统提示词），然后调用 `runAgentLoop`。

事件处理 `handleAgentEvent` 做了持久化和钩子发射：

- `message_end` → `session.appendMessage()` + 广播给订阅者
- `turn_end` → 广播 + flush 待写会话 + 发射 `save_point`（UI 知道这里可以安全存档了）
- `agent_end` → flush + 置 idle + 发射 `settled`

这里能看到**钩子-事件双层广播**：typed 钩子（`on("tool_call", ...)`）用于"改行为"，通配订阅（`subscribe(...)`）用于"看事件"。

## 10. AgentSession：消费 loop 的应用层

`AgentSession` 订阅了 agent 的每个事件（构造时 `this.agent.subscribe(this._handleAgentEvent)`），在事件基础上叠加应用层职责。

### 10.1 持久化

`_handleAgentEvent` 在 `message_end` 时把消息写入会话存储（`sessionManager.appendMessage`）。特殊角色（`custom` 等）存为对应 entry 类型。**会话历史 = agent 事件流的副产品**，不需要单独维护一份 transcript。

### 10.2 prepareNextTurn：每轮刷新上下文

`AgentSession` 的 `_installAgentNextTurnRefresh` 包装了 `prepareNextTurnWithContext`，每轮都：

- 系统提示词：用最新的 `_baseSystemPrompt`（包含最新加载的 skills、工具说明、权限模式提示）重建
- 工具列表：用 `agent.state.tools` 的最新快照
- 模型 / 思考级别：跟随用户会话中的切换

为什么需要这个？长任务中用户可能中途改了权限模式（code/plan/ask）、切换了模型。没有这个刷新点，后续轮次会继续用旧系统提示词和旧模型。

### 10.3 自动重试与自动压缩

`_handlePostAgentRun` 在每轮 agent 结束后依次检查：

1. **自动重试**：`_isRetryableError(msg)`（网络错误、限流、可重试的 provider 错误）且未超过最大次数 → `_prepareRetry` 指数退避重试，发 `auto_retry_start` 等事件
2. **自动压缩**：`_checkCompaction` 检查 `shouldCompact`（token 估算超阈值或溢出恢复后）→ 用模型把旧历史总结成摘要替换进会话（`compact()`），保留最近 tail

## 11. 输出：回到 UI

`PiAgentService.ensureSession` 创建 `AgentSession` 后订阅事件，`handleSessionEvent` 把 Agent 事件翻译成 webview 协议消息：

| Agent 事件 | Webview 动作 |
| --- | --- |
| `message_start`（assistant） | `append`：新建一条空的 assistant 气泡，`working: true` |
| `message_update`（text_delta） | `appendDelta`：把增量文本拼到当前气泡 |
| `message_end`（assistant） | `replace`：用最终完整文本替换，`working: false` |
| `tool_execution_start` | `append`：新建"Running bash..."工具气泡 |
| `tool_execution_update` | `replace`：实时更新工具输出 |
| `tool_execution_end` | `replace`：工具完成状态 + 摘要 |

这些消息通过 `onEvent` → webview bridge（`kind: "event"`，见 [VS Code Webview 通信](./vscode-webview-communication.md)）推送到 Webview，聊天界面渲染出完整回复。**最终输出不是一次性的大块文本，而是事件驱动的增量渲染**——这就是打字机效果的来源。

## 12. 设计要点总结

读完整个链路，可以提炼出几条贯穿始终的设计原则：

1. **单向依赖，引擎与 UI 解耦**：`agent` 引擎只发事件、收队列，不知道外面是 TUI 还是 Webview。`AgentHarness`、`AgentSession`、vscode-extension 各自在不同层级消费同一套事件。

2. **两层消息模型 + 边界转换**：内部用宽类型 `AgentMessage` 保存所有历史（包括 UI 展示用的 bash 输出），只在 LLM 调用边界用 `convertToLlm` 裁剪成模型能读的格式。历史完整性和 token 效率兼得。

3. **失败也是数据流**：`StreamFn` 契约禁止 throw，错误编码成 `stopReason: "error"` 的消息走正常事件流。调用方不需要散落的 try/catch，UI 也不需要特殊错误分支。

4. **一切皆流**：provider 响应是 `EventStream`，agent 事件也是流式推送。流式不是"打字效果"的附属品，而是架构的默认形态。

5. **双层循环对应两种交互语义**：steering（尽快插入）和 follow-up（等完成再处理）是两个队列、两个轮询点，而不是一个通用队列——语义决定结构。

6. **安全的失败优先级高于效率**：length 截断时一个工具都不执行；terminate 需要全批同意才停止；并行执行前先顺序预检；事件发射有严格的顺序约定（完成序 vs 原始序）。宁可多花一轮，不执行可能残缺的操作。

7. **状态是事件的投影**：`Agent` 的公开状态完全由事件归约而来，UI 也通过订阅事件渲染。整个系统是"事件驱动"的单向数据流，没有共享可变状态的中心。

## 附录：建议的阅读顺序

1. `packages/agent/src/types.ts` — 先看 `AgentMessage` / `AgentEvent` / `AgentLoopConfig` 的类型定义
2. `packages/agent/src/agent-loop.ts` — 再看 `runLoop` 和 `streamAssistantResponse` 的实现（本文第 5、6、7 节）
3. `packages/agent/src/agent.ts` — 然后看 `Agent` 类如何包装循环、管理队列和状态（第 8 节）
4. `packages/ai/src/utils/event-stream.ts` — 理解流式基础设施
5. `packages/ai/src/utils/validation.ts` — 理解工具参数校验的宽容与严格
6. `packages/agent/src/harness/agent-harness.ts` — 理解 loop 配置如何被接上真实逻辑（第 9 节）
7. `packages/coding-agent/src/core/agent-session.ts` — 最后看应用层如何消费事件、持久化、压缩（第 10 节）
