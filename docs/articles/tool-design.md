# Pi 的 Tool 系统设计：从 schema 到并行执行

## 1. 全景：一个工具调用的完整旅程

一次工具调用要经历七个阶段：

```
① 定义     工具 = name + description + TypeBox schema（+ 提示词片段 + 执行逻辑）
② 注入     两条通道：provider 请求的 tools 数组（结构化）+ 系统提示词（文本摘要）
③ 返回     模型输出 toolCall 内容块（流式拼 JSON 参数），stopReason = "toolUse"
④ 校验     validateToolArguments：类型转换 + schema 校验，失败则生成错误结果
⑤ 钩子     beforeToolCall（可 block）→ execute（可流式 onUpdate）→ afterToolCall（可 patch）
⑥ 回填     工具结果规范化为 toolResult 消息，进入上下文
⑦ 下一轮   模型看到所有工具结果，决定继续调用或收尾
```

整个系统是 **schema 驱动**的：同一个 TypeBox schema 被用于类型推断（TypeScript `Static`）、请求下发（JSON Schema）、入参校验（TypeBox Check）三处，单一数据源。

## 2. 工具的定义：三层接口

工具在不同 package 里有三层接口，逐层加东西：

### 2.1 最底层：`Tool`（`packages/ai/src/types.ts`）

```ts
export interface Tool<TParameters extends TSchema = TSchema> {
    name: string;                       // 模型调用时的名字，如 "bash"
    description: string;                // 给模型看的用途说明
    parameters: TParameters;            // TypeBox schema
    constrainedSampling?: false | ConstrainedSamplingConfig;  // 约束采样（见下文）
}
```

它只描述"给模型看的定义"，不包含执行逻辑。这是 provider 层的最小契约。

### 2.2 中间层：`AgentTool`（`packages/agent/src/types.ts`）

```ts
export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
    label: string;                              // UI 展示名
    prepareArguments?: (args: unknown) => Static<TParameters>;   // 参数兼容层
    execute: (
        toolCallId: string,
        params: Static<TParameters>,            // 校验后的参数（类型安全）
        signal?: AbortSignal,
        onUpdate?: AgentToolUpdateCallback<TDetails>,   // 流式部分结果
    ) => Promise<AgentToolResult<TDetails>>;
    executionMode?: ToolExecutionMode;          // "sequential" | "parallel"
}
```

加了"执行"能力。注意 `execute` 收到的 `params` 是 `Static<TParameters>`——**校验通过后才有执行**，且类型已经从 `unknown` 收窄到 schema 推导的类型。

### 2.3 应用层：`ToolDefinition`（`packages/coding-agent/src/core/extensions/types.ts`）

```ts
export interface ToolDefinition<TParams, TDetails, TState> {
    name: string;
    label: string;
    description: string;
    promptSnippet?: string;          // 系统提示词里的单行摘要（没有则不出现）
    promptGuidelines?: string[];     // 附加的 Guidelines 条目
    parameters: TParams;             // TypeBox schema
    constrainedSampling?: false | ConstrainedSamplingConfig;
    prepareArguments?: (args: unknown) => Static<TParams>;
    executionMode?: ToolExecutionMode;
    execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext): Promise<AgentToolResult<TDetails>>;
    renderCall?: (...);              // TUI 里怎么渲染"调用中"
    renderResult?: (...);            // TUI 里怎么渲染"结果"
}
```

再往上加的是**产品层**的东西：提示词片段、渲染函数、扩展上下文。`wrapToolDefinition`（`tools/tool-definition-wrapper.ts`）负责把 `ToolDefinition` 适配成 `AgentTool`——这也是扩展写自定义工具时用的接口。

### 2.4 真实例子：bash 与 edit

bash 的 schema（`coding-agent/src/core/tools/bash.ts`）：

```ts
const bashSchema = Type.Object({
    command: Type.String({ description: "Bash command to execute" }),
    timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional, no default timeout)" })),
});
```

edit 的 schema（`coding-agent/src/core/tools/edit.ts`）展示了嵌套结构：

```ts
const replaceEditSchema = Type.Object({
    oldText: Type.String({ description: "..." }),
    newText: Type.String({ description: "..." }),
});
const editSchema = Type.Object({
    path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
    edits: Type.Array(replaceEditSchema, { description: "..." }),
});
```

TypeBox 的 `Type.Object` 直接生成 JSON Schema，所以不需要手写两份。

## 3. 工具如何到达模型：两条通道

### 3.1 结构化通道：provider 请求里的 tools

agent loop 把 `Context.tools` 传给 `StreamFn`（`streamAssistantResponse` 的第 ③ 步），provider 层把它转成各家 API 的格式。

**OpenAI / DeepSeek 格式**（`ai/src/api/openai-completions.ts` 的 `convertTools`）：

DeepSeek 走 OpenAI 兼容的 chat completions API，两者共用同一个转换函数。请求体里的 `tools` 数组长这样：

```ts
{
    type: "function",
    function: {                   // 注意：OpenAI 兼容格式是嵌套的 function 对象
        name: "bash",
        description: "Execute a bash command...",
        parameters: bashSchema,   // TypeBox 生成的 JSON Schema 直接透传
        strict: false,            // 由 constrainedSampling 决定；仅当 provider 支持才带，
                                  // 有些不支持的 API 会拒绝未知字段
    },
}
```

DeepSeek 与 OpenAI 的差异在工具**之外**的请求参数（`buildParams`）：

- `thinking: { type: "enabled" | "disabled" }`：DeepSeek 的推理开关（`compat.thinkingFormat === "deepseek"` 时）
- 重放带推理的 assistant 消息时需要 `reasoning_content` 字段（`requiresReasoningContentOnAssistantMessages: true`）
- 工具调用本身与 OpenAI 完全一致——这是所有 OpenAI 兼容 API 的好处：**一套转换逻辑，全族复用**

两个细节值得注意：

- **各家 API 的 schema 方言不同**：OpenAI 兼容 API 接受完整 JSON Schema（TypeBox 直接透传），而部分 API 只要 `properties`/`required` 子集。所以转换层会做裁剪/合并，DeepSeek 属于直接透传的那类。
- **`constrainedSampling`**（约束采样）：`{ type: "json_schema", strict: "prefer" | "require" }` 请求 provider 用 JSON Schema 约束解码——模型输出的参数**天然合法**，校验只是兜底。这是从"校验纠正"升级到"源头保证"。

### 3.2 文本通道：系统提示词里的工具说明

模型选错工具比参数错更常见，所以提示词里还要有**选工具的引导**。`buildSystemPrompt`（`coding-agent/src/core/system-prompt.ts`）用一行摘要生成 `Available tools` 列表：

```
Available tools:
- read: Read file contents
- bash: Execute bash commands (ls, grep, find, etc.)
- edit: Edit files via targeted text replacements
```

生成逻辑（`agent-session.ts` 的 `_rebuildSystemPrompt`）：

- 每个工具的可选 `promptSnippet` 一行摘要；**没有 snippet 的工具不出现在列表里**（但 API 里仍然有）——token 预算由工具作者决定
- 工具的 `promptGuidelines` 追加到 Guidelines 区（如 bash 的"Use bash for file operations like ls, rg, find"）
- 只有**当前 active 的工具**才注入（`setActiveToolsByName` 控制）
- 系统提示词每轮重建（`prepareNextTurn`），工具增删后提示词自动跟着变

**为什么两条通道都要？** 结构化 tools 让模型能精准输出合法 JSON；文本 snippet 帮模型在十几个工具里快速选对。前者是"能力的精确描述"，后者是"使用的策略引导"。而且提示词里没有的是完整 schema——完整参数说明走 API 通道，避免提示词膨胀。

## 4. 模型返回什么：tool_calls 的解析

各家 API 的返回格式不同，provider 层统一转换成内部 `ToolCall` 块（`ai/src/types.ts`）：

```ts
export interface ToolCall {
    type: "toolCall";
    id: string;                          // 关联工具结果用
    name: string;
    arguments: Record<string, any>;      // 已解析的 JSON 对象
    thoughtSignature?: string;           // Google 专用
}
```

### 4.1 各家格式映射

**OpenAI / DeepSeek**（`openai-completions.ts`）：流式响应里 `choice.delta.tool_calls` 数组，每个元素：

```ts
{
    index: 0,                                // 流式块的序号（按 index 关联同一工具调用）
    id: "call_abc123",                      // 通常只在最后一个片段出现
    type: "function",
    function: { name: "bash", arguments: "{\"command\":\"npm " },  // arguments 是 JSON 字符串片段
}
```

`arguments` 是 **JSON 字符串**（且是流式片段），provider 要先把片段拼起来再 `JSON.parse`。DeepSeek 返回同样的结构，额外在 assistant 消息里带 `reasoning_content`（推理内容）——Pi 把它单独解析成 thinking 块，重放历史时再原样回传（这是 DeepSeek 的硬性要求）。

### 4.2 流式解析：参数是拼出来的

工具参数是流式到达的，provider 把片段拼起来、边拼边尽力解析（以 OpenAI/DeepSeek 为例）：

- `toolcall_start`：新工具调用块开始（空 arguments）
- `toolcall_delta`：`function.arguments` 片段累积进 `partialArgs`（`block.partialArgs += toolCall.function.arguments`），用 `parseStreamingJson` 尽力解析（JSON 不完整时返回部分结果）
- `toolcall_end`：最终 `JSON.parse(partialArgs)` 定稿，删掉临时缓冲区，携带完整 `toolCall`

agent loop 收到这些事件后（`streamAssistantResponse`），把累积的 partial 消息原地替换进上下文（详见 agent-loop 一文第 6 节）。模型最终消息的 `stopReason` 是 `"toolUse"`，loop 据此进入工具执行阶段。

**这里埋了一个安全点**：`parseStreamingJson` 是"尽力而为"的解析——截断时参数可能**解析成功但不完整**。这正是 agent loop 遇到 `stopReason === "length"` 时一个工具都不执行的原因（见第 7 节）。

## 5. 入参校验：validateToolArguments

模型输出的 `arguments` 是**不可信输入**——可能是错的类型、缺失字段、多余字段。校验在 `ai/src/utils/validation.ts`，设计哲学是**宽容转换、严格校验、错误可读**：

```ts
export function validateToolArguments(tool: Tool, toolCall: ToolCall): any {
    const args = structuredClone(toolCall.arguments);      // ① 拷贝，不改模型返回的原对象
    Value.Convert(tool.parameters, args);                  // ② TypeBox 类型转换

    const validator = getValidator(tool.parameters);       // ③ 编译（带 WeakMap 缓存）
    if (!isTypeBoxSchema) {
        const coerced = coerceWithJsonSchema(args, tool.parameters);  // ④ 自定义深度转换
        // 合并转换结果
    }

    if (validator.Check(args)) {
        return args;                                       // ⑤ 校验通过，返回（收窄后的）参数
    }

    // ⑥ 失败：格式化错误，模型能读懂
    const errors = validator.Errors(args)
        .map((error) => `  - ${formatValidationPath(error)}: ${error.message}`)
        .join("\n");
    throw new Error(
        `Validation failed for tool "${toolCall.name}":\n${errors}\n\nReceived arguments:\n${JSON.stringify(toolCall.arguments, null, 2)}`
    );
}
```

四层设计：

1. **宽容转换**：`Value.Convert` + `coerceWithJsonSchema` 把 `"123"` → `123`、`"true"` → `true`、处理 `allOf`/`anyOf`/`oneOf` 联合、数组项、对象属性。目的是**尽量救活**模型的轻微格式错误，而不是一上来就拒绝。
2. **严格校验**：转换后仍然过 TypeBox `Check`——不合法就拒绝，绝不带着坏参数执行。
3. **错误可读**：抛出的错误包含字段路径（`path.edits`）、原因和收到的原始 JSON。这个错误会变成工具结果文本喂给模型（agent loop 的 `prepareToolCall` catch 分支），模型下一轮能"看到哪里错了"并自我修正。
4. **性能**：validator 按 schema 对象用 `WeakMap` 缓存编译结果。

### prepareArguments：兼容层

在 `validateToolArguments` 之前还有一层 `tool.prepareArguments`（`agent-loop.ts` 的 `prepareToolCallArguments`）：把"老模型输出的参数形状"改写成"当前 schema 期望的形状"。返回结果与传入相同则跳过。这是为了让 schema 演进时不必强制所有模型立即适配。

## 6. beforeToolCall / afterToolCall：执行前后的钩子

完整时序（`agent-loop.ts`）：

```
tool_execution_start（事件）
        │
        ▼
prepareToolCall
   ├─ 按 name 找工具定义；找不到 → 立即错误结果
   ├─ prepareArguments（兼容层）
   ├─ validateToolArguments（校验）
   ├─ beforeToolCall 钩子 ←────── 可 block，返回错误结果
   └─ 通过 → 进入执行
        │
        ▼
execute（tool.execute）
   ├─ onUpdate 回调 → tool_execution_update 事件（流式部分结果）
   ├─ 抛错 → 转成错误结果
        │
        ▼
finalizeExecutedToolCall
   └─ afterToolCall 钩子 ←────── 可 patch 结果字段
        │
        ▼
tool_execution_end（事件）→ toolResult 消息（message_start/message_end）→ 进上下文
```

### beforeToolCall：执行前的拦截点

```ts
// agent-loop.ts（简化）
const beforeResult = await config.beforeToolCall(
    { assistantMessage, toolCall, args: validatedArgs, context: currentContext },
    signal,
);
if (beforeResult?.block) {
    return { kind: "immediate", result: createErrorToolResult(
        beforeResult.reason || "Tool execution was blocked"), isError: true };
}
```

语义：**参数校验之后、真正执行之前**。返回 `{ block: true }` 则工具不执行，取而代之一条错误结果喂回模型。用途：

- **权限确认**：TUI 模式对写操作/危险 bash 的确认（编码 agent 把它接到扩展的 `tool_call` 钩子，见 `agent-session.ts` 的 `_installAgentToolHooks`）
- **扩展拦截**：扩展可以审查参数、改写、拒绝
- **RPC/审批**：远程客户端可以在执行前审批

注意 `beforeToolCall` 收到的 `args` 已经是校验后的类型安全参数。

### afterToolCall：执行后的改写点

```ts
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
```

语义：**执行完成之后、结果定稿之前**。返回的 patch 是字段级覆盖（`content` 数组、`details` 对象都是整块替换，不深合并）。用途：

- 扩展对工具结果做后处理（过滤敏感信息、改写格式、补充统计）
- `terminate` 字段：提示"本轮批次结束后停止"（见第 7 节）

### 钩子的失败安全

`beforeToolCall`/`afterToolCall` 钩子自身抛错不会被带到 agent loop 外——`prepareToolCall` 的 catch 或 `finalizeExecutedToolCall` 的 catch 会把它降级成一条错误工具结果。钩子出错不会弄死整个循环，模型能看到"钩子失败"。

## 7. 并行与串行执行的设计

### 7.1 决策规则

```ts
const hasSequentialToolCall = toolCalls.some(
    (tc) => currentContext.tools?.find((t) => t.name === tc.name)?.executionMode === "sequential",
);
if (config.toolExecution === "sequential" || hasSequentialToolCall) {
    return executeToolCallsSequential(...);   // 逐个执行
}
return executeToolCallsParallel(...);          // 并行执行
```

两层控制：全局默认（`config.toolExecution`，默认 `"parallel"`）+ 每个工具的 `executionMode` 覆盖。规则是**一个串行则整批串行**——因为并行时"读-改-写"同一文件的工具会互相踩踏。

### 7.2 为什么需要并行

模型一次 `toolUse` 可能带多个工具调用（比如"读这三个文件"）。串行意味着每个都要等前一个完成+回填上下文，Latency 叠加。并行把这些合并成一轮往返。

### 7.3 并行执行的三阶段

并行不是简单 `Promise.all`，而是三阶段（`executeToolCallsParallel`）：

```
阶段一 顺序预检：      每个 toolCall 依次 prepareToolCall
                      ├─ 立即失败（找不到/校验失败/被block）→ 立即 tool_execution_end
                      └─ 通过预检 → 存为"待执行闭包"（还没执行！）
阶段二 并发执行：      Promise.all 执行所有闭包
                      每个完成 → tool_execution_end（按完成顺序）
阶段三 顺序收尾：      按 assistant 原始顺序生成 toolResult 消息进上下文
```

**为什么预检要顺序、执行才并发？** 三个原因：

1. 参数校验和 `beforeToolCall` 可能有副作用或权限语义，需要确定的执行顺序（比如两个工具互相依赖审批状态）
2. 校验失败的工具根本不该执行——先预检能提前排除
3. `beforeToolCall` 的 block 决策必须在并发开始前完成

实现上的技巧：`FinalizedToolCallEntry = FinalizedToolCallOutcome | (() => Promise<...>)`——立即失败的值直接放进去，通过预检的用闭包延迟执行，`Promise.all` 时用 `typeof entry === "function"` 区分。

**事件顺序约定**（对 UI 很重要）：

- `tool_execution_start`：全部先发（预检阶段）
- `tool_execution_end`：按**完成顺序**发——UI 立刻看到先完成的工具
- toolResult **消息**：按 **source 顺序**发——会话历史里工具调用和结果一一对应，模型不会混淆

### 7.4 同文件互斥：file-mutation-queue

光靠"并行"还不够，同一文件的写操作必须串行。`coding-agent/src/core/tools/file-mutation-queue.ts`：

```ts
export async function withFileMutationQueue<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    // 按 realpath 归一化文件路径，每个文件一条 Promise 链
    // 不同文件并行，同一文件排队
}
```

`edit`/`write` 工具内部用 `realpath` 归一化路径后按文件排队——这是对"工具并行"的最后一道物理防线：**并行只发生在互不冲突的文件上**。

### 7.5 两种失败特例

- **length 截断**（`failToolCallsFromTruncatedMessage`）：输出被 token 上限截断时，流式拼接的参数可能残缺但解析成功。**一个都不执行**，全部标记失败并提示模型重新发起。
- **terminate 提前终止**（`shouldTerminateToolBatch`）：只有**本批所有**工具结果都带 `terminate: true` 才停止——防止"有的想继续、有的想停"的不一致。

## 8. 结果回填：进入下一轮

每个工具调用最终变成一条 `toolResult` 消息（`createToolResultMessage`，`agent-loop.ts`）：

```ts
{
    role: "toolResult",
    toolCallId: "...",          // 与 assistant 消息里的 toolCall 对应
    toolName: "bash",
    content: [...],             // 文本/图片内容，空数组兜底（JS 扩展可能不返回 content）
    details: {...},             // 结构化详情（UI 用）
    usage: {...},               // 工具执行本身的 token 用量
    isError: false,
    timestamp: Date.now(),
}
```

然后 `currentContext.messages.push(result)` —— 工具结果进上下文。下一轮 LLM 请求（`convertToLlm` 后）里就是：

```
user: 帮我看看这个报错
assistant: [toolCall: bash "npm test"]
toolResult: [bash 输出]
assistant: [最终回答]
```

模型看到结果后决定：继续调用工具，或输出最终答案收尾。

## 9. 设计原则总结

1. **schema 驱动，单一数据源**：TypeBox schema 同时产出 TypeScript 类型、provider 请求、入参校验。改 schema = 三处同步。

2. **宽容入参、严格执行、可读反馈**：先尽力类型转换救活轻微错误，再严格校验保证执行安全，失败时把"哪里错了"格式化给模型让它自我修正。

3. **每个阶段有钩子，扩展点清晰**：preflight（beforeToolCall，可 block）→ execute（可流式）→ finalize（afterToolCall，可 patch）。产品逻辑（权限、审批、改写）都挂在钩子上，工具本身只做本职。

4. **并行是优化，正确性是底线**：三阶段设计保证校验/审批有序、执行并发；同文件互斥保证物理安全；length 截断一个不执行。

5. **事件全程可见**：start/update/end 三级事件让 UI 能渲染"正在跑 bash"→"输出更新"→"完成"，用户始终知道工具在干什么——这也与提示词注入防护的"人工确认"形成呼应。
