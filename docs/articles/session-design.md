# Session 系统设计：从 JSONL 树到运行时切换

## 1. 全景：Session 到底管什么

Pi 里的 session 不是简单的聊天记录文件。它同时承担五件事：

```
① 持久化      把用户、assistant、toolResult、bash、扩展消息写进 JSONL
② 恢复上下文  从历史文件重建 Agent 启动时的 messages / model / thinkingLevel
③ 树形分支    用 id / parentId 保存多条对话路径，支持 /tree 原地切换
④ 上下文压缩  用 compaction entry 代替旧历史，避免上下文窗口爆掉
⑤ 运行时切换  /new、/resume、/fork 时销毁旧 AgentSession，按新 cwd 重建服务
```

代码上主要分四层：

| 层 | 关键文件 | 职责 |
| --- | --- | --- |
| 低层 `Agent` | `packages/agent/src/agent.ts` | 内存态、事件流、steering/follow-up 队列；不知道 JSONL |
| 应用层 `AgentSession` | `packages/coding-agent/src/core/agent-session.ts` | 订阅 Agent 事件，落盘、retry、compaction、扩展事件 |
| 存储层 `SessionManager` | `packages/coding-agent/src/core/session-manager.ts` | JSONL 文件读写、迁移、树遍历、上下文重建 |
| 运行时外壳 `AgentSessionRuntime` | `packages/coding-agent/src/core/agent-session-runtime.ts` | /new、/resume、/fork、/import 时替换整个 session runtime |

最重要的分工是：**Agent 负责跑一次循环，SessionManager 负责保存树，AgentSession 负责把两者接起来**。

## 2. 一次启动：先选 Session，再建 Runtime

CLI 入口在 `packages/coding-agent/src/main.ts`。启动时不会马上创建 `AgentSession`，而是先根据参数选出 `SessionManager`：

```ts
async function createSessionManager(parsed, cwd, sessionDir, settingsManager): Promise<SessionManager> {
    if (parsed.noSession || parsed.help || parsed.listModels !== undefined) {
        return SessionManager.inMemory(cwd, ...);
    }

    if (parsed.fork) {
        const resolved = await resolveSessionPath(parsed.fork, cwd, sessionDir);
        return SessionManager.forkFrom(resolved.path, cwd, sessionDir, parsed.sessionId);
    }

    if (parsed.session) {
        const resolved = await resolveSessionPath(parsed.session, cwd, sessionDir);
        return SessionManager.open(resolved.path, sessionDir);
    }

    if (parsed.resume) {
        const selectedPath = await selectSession(...);
        return SessionManager.open(selectedPath, sessionDir);
    }

    if (parsed.continue) {
        return SessionManager.continueRecent(cwd, sessionDir);
    }

    return SessionManager.create(cwd, sessionDir, { id: parsed.sessionId });
}
```

这一步只解决“用哪个 session 文件”。后面才根据 `sessionManager.getCwd()` 创建 cwd 绑定的服务：

```
createSessionManager()
   │
   ▼
sessionManager.getCwd()
   │
   ▼
createAgentSessionServices(cwd)
   ├─ SettingsManager.create(cwd, agentDir)
   ├─ DefaultResourceLoader(cwd, agentDir, settings)
   ├─ ModelRuntime.create(...)
   └─ resourceLoader.reload()
   │
   ▼
createAgentSessionFromServices(...)
   │
   ▼
new AgentSession(...)
```

为什么顺序这么绕？因为 `--session` 和 `--resume` 可能打开另一个项目的 session。项目配置、扩展、技能、主题、模型选择都可能和 cwd 有关，所以必须先确定目标 session 的 cwd，再加载这些资源。

## 3. Session 文件长什么样

`SessionManager` 默认把 session 放在：

```
~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<session-id>.jsonl
```

目录名来自 `getDefaultSessionDirPath(cwd)`：

```ts
const safePath = `--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
return join(resolvedAgentDir, "sessions", safePath);
```

文件是 JSONL：一行一个 JSON 对象。第一行是 header：

```json
{"type":"session","version":3,"id":"018f...","timestamp":"2026-08-24T10:00:00.000Z","cwd":"/repo"}
```

后面的每一行都是树节点 entry：

```json
{"type":"message","id":"a1b2c3d4","parentId":null,"timestamp":"...","message":{"role":"user","content":[{"type":"text","text":"看下 session 实现"}],"timestamp":...}}
{"type":"message","id":"b2c3d4e5","parentId":"a1b2c3d4","timestamp":"...","message":{"role":"assistant","content":[...],"provider":"anthropic","model":"claude-sonnet-4-5","usage":...,"stopReason":"stop","timestamp":...}}
```

核心字段只有三个：

- `id`：当前 entry 的短 ID，`generateId()` 生成并查重。
- `parentId`：父节点 ID；第一个节点是 `null`。
- `timestamp`：写入时间。

这三个字段让一个线性 JSONL 文件表达树结构。

## 4. Entry 类型：不是所有历史都会发给模型

`SessionEntry` 是一个 union：

```ts
export type SessionEntry =
    | SessionMessageEntry
    | ThinkingLevelChangeEntry
    | ModelChangeEntry
    | CompactionEntry
    | BranchSummaryEntry
    | CustomEntry
    | CustomMessageEntry
    | LabelEntry
    | SessionInfoEntry;
```

初学者容易混淆的是 `message`、`custom`、`custom_message`：

| entry | 用途 | 是否进入 LLM 上下文 |
| --- | --- | --- |
| `message` | 标准消息和应用消息，如 user、assistant、toolResult、bashExecution | 看消息 role，有些后续会被 `convertToLlm` 过滤或转换 |
| `custom` | 扩展保存自己的状态 | 否 |
| `custom_message` | 扩展注入上下文消息 | 是 |
| `compaction` | 压缩摘要 | 是，转为 `compactionSummary` |
| `branch_summary` | 切分支时保留被放弃路径的摘要 | 是，转为 `branchSummary` |
| `model_change` | 记录模型切换 | 不作为消息，但用于恢复当前模型 |
| `thinking_level_change` | 记录 thinking level 切换 | 不作为消息，但用于恢复 thinking level |
| `session_info` | 会话展示名 | 否 |
| `label` | `/tree` 里给节点打标签 | 否 |

转换入口是 `sessionEntryToContextMessages()`。下面是保留主干后的简化版本：

```ts
export function sessionEntryToContextMessages(entry: SessionEntry): AgentMessage[] {
    if (entry.type === "message") {
        return [entry.message];
    }
    if (entry.type === "custom_message") {
        return [
            createCustomMessage(entry.customType, entry.content ?? [], entry.display, entry.details, entry.timestamp),
        ];
    }
    if (entry.type === "branch_summary" && entry.summary) {
        return [createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp)];
    }
    if (entry.type === "compaction") {
        return [createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp)];
    }
    return [];
}
```

所以 session 文件保存的是“产品完整历史”，LLM 上下文只是从这份历史投影出来的一部分。

## 5. Append-only 树：leaf 是当前位置

`SessionManager` 内部有三个关键状态：

```ts
private fileEntries: FileEntry[] = [];
private byId: Map<string, SessionEntry> = new Map();
private leafId: string | null = null;
```

这里的 `leafId` 是当前进程内的“活动位置”。它决定下一次 append 挂到哪个父节点下。

追加 entry 时，总是把当前 `leafId` 作为新节点的 `parentId`，然后把 leaf 移到新节点：

```ts
private _appendEntry(entry: SessionEntry): void {
    this.fileEntries.push(entry);
    this.byId.set(entry.id, entry);
    this.leafId = entry.id;
    this._persist(entry);
}
```

例如连续三轮对话：

```
u1 ── a1 ── u2 ── a2 ── u3 ── a3
                               ▲
                             leaf
```

如果在 `/tree` 里跳回 `a1`，`branch("a1")` 只改 leaf，不改旧 entry：

```ts
branch(branchFromId: string): void {
    if (!this.byId.has(branchFromId)) throw new Error(...);
    this.leafId = branchFromId;
}
```

之后再追加新消息，就得到分支：

```
u1 ── a1 ── u2 ── a2
       │
       └── u2' ── a2'
                 ▲
               leaf
```

这就是 Pi 能在一个 session 文件里保留多条探索路径的原因：**历史 append-only，不删除旧分支；当前路径由 leaf 决定**。

有一个实现边界要记住：`coding-agent` 当前的 `leafId` 本身不单独写成 entry。纯 `/tree` 移动如果没有产生新 entry，重新打开文件时 `_buildIndex()` 会把 leaf 设回文件里的最后一个 entry。真正持久化分支的是“移动 leaf 后继续追加的新 entry”，或者带摘要/标签的导航产生的新 entry。

## 6. 落盘策略：为什么空会话不会马上出现

`SessionManager._persist()` 有个实用优化：新 session 在出现第一条 assistant 消息前不会真正创建完整文件。

```ts
_persist(entry: SessionEntry): void {
    if (!this.persist || !this.sessionFile) return;

    const hasAssistant = this.fileEntries.some(
        (e) => e.type === "message" && e.message.role === "assistant"
    );
    if (!hasAssistant) {
        if (this.flushed) {
            appendFileSync(this.sessionFile, `${JSON.stringify(entry)}\n`);
        } else {
            this.flushed = false;
        }
        return;
    }

    if (!this.flushed) {
        const fd = openSync(this.sessionFile, "wx");
        for (const e of this.fileEntries) {
            writeFileSync(fd, `${JSON.stringify(e)}\n`);
        }
        this.flushed = true;
    } else {
        appendFileSync(this.sessionFile, `${JSON.stringify(entry)}\n`);
    }
}
```

这样做的效果：

- 新 session 会先在内存里记录 `model_change`、`thinking_level_change`、第一条 user message。
- 如果用户还没等到 assistant 就退出，通常不会留下一个只有开头的历史文件。
- 第一条 assistant 完成后，一次性把 header 和之前累计的 entries 写入文件。
- 后续 entry 直接 append 到文件末尾。

这也是 `/fork` 测试里会看到“新 fork 出来的 sessionFile 已有路径，但文件还不存在”的原因：只有真正产生 assistant 后才落盘。

## 7. Agent 事件如何变成 Session 历史

低层 `Agent` 在 `packages/agent/src/agent.ts` 里维护运行态。它处理 loop 事件时只更新内存：

```ts
private async processEvents(event: AgentEvent): Promise<void> {
    switch (event.type) {
        case "message_end":
            this._state.streamingMessage = undefined;
            this._state.messages.push(event.message);
            break;
        case "tool_execution_start":
            this._state.pendingToolCalls.add(event.toolCallId);
            break;
        case "tool_execution_end":
            this._state.pendingToolCalls.delete(event.toolCallId);
            break;
    }

    for (const listener of this.listeners) {
        await listener(event, signal);
    }
}
```

真正写 session 的地方在 `AgentSession._handleAgentEvent()`：

```ts
if (event.type === "message_end") {
    if (event.message.role === "custom") {
        this.sessionManager.appendCustomMessageEntry(
            event.message.customType,
            event.message.content,
            event.message.display,
            event.message.details,
        );
    } else if (
        event.message.role === "user" ||
        event.message.role === "assistant" ||
        event.message.role === "toolResult"
    ) {
        this.sessionManager.appendMessage(event.message);
    }
}
```

这条链路很关键：

```
LLM / tool / user input
   │
   ▼
AgentEvent.message_end
   │
   ├─ Agent 更新内存 messages
   └─ AgentSession 监听事件并 append 到 SessionManager
         │
         ▼
      JSONL entry
```

所以 Pi 没有单独维护一份 transcript。**session 历史是 agent 事件流的副产品**。

## 8. prompt() 做了哪些 session 相关工作

`AgentSession.prompt()` 是用户输入进入 session 的主入口。简化时序：

```
AgentSession.prompt(text)
   ├─ 扩展命令：/xxx 先尝试由扩展处理
   ├─ input hook：扩展可 transform / handled
   ├─ 展开 /skill:name 和 prompt template
   ├─ 如果正在 streaming：进 steer 或 followUp 队列
   ├─ 非 streaming：校验 model 和 auth
   ├─ 发送前检查是否需要 compaction
   ├─ 组装 user message + pending nextTurn custom messages
   ├─ before_agent_start hook 可注入 custom messages / 改 system prompt
   └─ _runAgentPrompt(messages)
```

`_runAgentPrompt()` 又包了一层 post-run 处理：

```ts
private async _runAgentPrompt(messages: AgentMessage | AgentMessage[]): Promise<void> {
    this._isAgentRunActive = true;
    try {
        await this.agent.prompt(messages);
        while (await this._handlePostAgentRun()) {
            await this.agent.continue();
        }
    } finally {
        this._systemPromptOverride = undefined;
        this._flushPendingBashMessages();
        await this._emitAgentSettled();
    }
}
```

`_handlePostAgentRun()` 会按顺序处理：

1. 如果最后一条 assistant 是可重试错误，准备 retry，然后 `agent.continue()`。
2. 如果上下文溢出或超过阈值，压缩 session，然后必要时 `agent.continue()`。
3. 如果扩展在 `agent_end` 里排了消息，也继续一轮。

这说明 session 不只是“保存文件”，它还参与控制 agent 是否要自动继续。

## 9. 恢复上下文：从树路径变成 LLM messages

打开旧 session 时，`createAgentSession()` 会先调用：

```ts
const existingSession = sessionManager.buildSessionContext();
const hasExistingSession = existingSession.messages.length > 0;
```

如果有历史，就恢复三类状态：

```ts
// 1. 尝试恢复模型
if (!model && hasExistingSession && existingSession.model) {
    const restoredModel = modelRuntime.getModel(existingSession.model.provider, existingSession.model.modelId);
    if (restoredModel && modelRuntime.hasConfiguredAuth(restoredModel.provider)) {
        model = restoredModel;
    }
}

// 2. 恢复 thinking level
if (thinkingLevel === undefined && hasExistingSession) {
    thinkingLevel = hasThinkingEntry
        ? existingSession.thinkingLevel
        : settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL;
}

// 3. 恢复消息
if (hasExistingSession) {
    agent.state.messages = existingSession.messages;
}
```

`buildSessionContext()` 的核心是先找到当前 leaf 到 root 的路径：

```ts
function buildSessionPath(entries, leafId, byId): SessionEntry[] {
    let leaf = leafId ? index.get(leafId) : undefined;
    leaf ??= entries[entries.length - 1];

    const path = [];
    let current = leaf;
    while (current) {
        path.push(current);
        current = current.parentId ? index.get(current.parentId) : undefined;
    }
    path.reverse();
    return path;
}
```

然后再处理 compaction。下面是按真实逻辑压缩后的伪代码：

```ts
export function buildContextEntries(entries, leafId, byId): SessionEntry[] {
    const path = buildSessionPath(entries, leafId, byId);
    let compaction: CompactionEntry | null = null;
    for (const entry of path) {
        if (entry.type === "compaction") compaction = entry;
    }
    if (!compaction) return path;

    const contextEntries = [compaction];
    // 加回 firstKeptEntryId 到 compaction 之前的保留尾部
    // 再加 compaction 之后的新 entry
    return contextEntries;
}
```

最后把 entry 投影成 `AgentMessage[]`：

```ts
const messages = buildContextEntries(entries, leafId, byId)
    .flatMap(sessionEntryToContextMessages);
return { messages, thinkingLevel, model };
```

可以把它理解成三步：

```
全量 JSONL entries
   │
   ▼
按 leaf 选中一条 root → leaf 路径
   │
   ▼
按 compaction 裁掉旧历史
   │
   ▼
转换成 AgentMessage[]，供 Agent 启动和下一轮 LLM 使用
```

## 10. Compaction：压缩不是改历史，而是加一个节点

手动 `/compact` 和自动压缩最终都会写入 `compaction` entry：

```ts
appendCompaction(summary, firstKeptEntryId, tokensBefore, details, fromHook, usage)
```

entry 长这样：

```json
{
  "type": "compaction",
  "id": "f6g7h8i9",
  "parentId": "last-entry",
  "summary": "Earlier conversation discussed ...",
  "firstKeptEntryId": "c3d4e5f6",
  "tokensBefore": 50000
}
```

注意它不删除任何旧 entry。它只是告诉上下文构建器：

```
以后构建当前路径上下文时：
1. 先放 compactionSummary(summary)
2. 再保留 firstKeptEntryId 开始的尾部消息
3. 再放 compaction 之后的新消息
4. 更早的旧消息仍在文件里，但不进入 LLM context
```

`AgentSession.compact()` 完成后会立刻重建内存态：

```ts
this.sessionManager.appendCompaction(...);
const sessionContext = this.sessionManager.buildSessionContext();
this.agent.state.messages = sessionContext.messages;
```

所以压缩后的下一轮 LLM 调用看到的是“摘要 + 最近尾部”，而不是完整旧历史。

自动压缩有两个触发点：

- `overflow`：模型返回上下文溢出错误，Pi 移除内存里的错误 assistant，压缩后自动 retry 一次。
- `threshold`：估算上下文接近阈值，Pi 压缩，但不自动 retry 已经成功的回答。

## 11. /tree：原地分支和分支摘要

`AgentSession.navigateTree(targetId, options)` 是 `/tree` 的核心。

选择目标时有两种行为：

```ts
if (targetEntry.type === "message" && targetEntry.message.role === "user") {
    // 选中 user message：leaf 跳到它的 parent，文本回填到编辑器
    newLeafId = targetEntry.parentId;
    editorText = contentText(targetEntry.message.content, "");
} else {
    // 选中 assistant/tool/summary 等：leaf 就是该节点
    newLeafId = targetId;
}
```

为什么选 user message 要跳到 parent？因为用户通常想“修改这条问题后重新问”。如果 leaf 停在原 user message 后面，再追加新 user message 会变成“连续两条 user”，不是重写这轮。

如果用户要求 summarization，Pi 会先总结旧 leaf 到共同祖先之间被放弃的路径：

```ts
const { entries: entriesToSummarize, commonAncestorId } =
    collectEntriesForBranchSummary(sessionManager, oldLeafId, targetId);
```

然后把摘要挂在新位置：

```ts
const summaryId = this.sessionManager.branchWithSummary(
    newLeafId,
    summaryText,
    summaryDetails,
    fromExtension,
    summaryUsage,
);
summaryEntry = this.sessionManager.getEntry(summaryId) as BranchSummaryEntry;
```

树形效果：

```
u1 ── a1 ── u2 ── a2 ── u3 ── a3     ← 旧路径
       │
       └── branch_summary ── u2'     ← 新路径保留旧路径摘要
```

没有摘要时，`navigateTree()` 只调用 `branch()` 或 `resetLeaf()`，不会新增 entry。

## 12. /fork、/clone、/new、/resume：替换整个 Runtime

`/tree` 仍在同一个 JSONL 文件里移动 leaf；`/fork` 和 `/clone` 会产生新 session 文件。运行时替换由 `AgentSessionRuntime` 管：

```ts
async switchSession(sessionPath: string, options?): Promise<{ cancelled: boolean }> {
    const beforeResult = await this.emitBeforeSwitch("resume", sessionPath);
    if (beforeResult.cancelled) return beforeResult;

    const previousSessionFile = this.session.sessionFile;
    const sessionManager = SessionManager.open(sessionPath, undefined, options?.cwdOverride);

    await this.teardownCurrent("resume", sessionManager.getSessionFile());
    this.apply(await this.createRuntime({
        cwd: sessionManager.getCwd(),
        agentDir: this.services.agentDir,
        sessionManager,
        sessionStartEvent: { type: "session_start", reason: "resume", previousSessionFile },
    }));
    await this.finishSessionReplacement(options?.withSession);
    return { cancelled: false };
}
```

通用步骤是：

```
session_before_switch / session_before_fork
   │  扩展可以 cancel
   ▼
session_shutdown
   │
   ▼
dispose 旧 AgentSession
   │
   ▼
按新 cwd + 新 SessionManager 重新 createRuntime()
   │
   ▼
rebind UI / command context
   │
   ▼
session_start
```

这也是扩展上下文会变 stale 的原因。旧 session 的 cwd、sessionManager、工具注册、资源 loader 都可能不再有效，不能在 session 替换后继续拿旧 context 做事。

## 13. 读取和迁移：旧文件如何兼容

`loadEntriesFromFile()` 用 1MB buffer 流式读 JSONL，避免大 session 直接读成一个巨型字符串：

```ts
while (true) {
    const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
    if (bytesRead === 0) break;

    pending += decoder.write(buffer.subarray(0, bytesRead));
    // 按 \n 切行，逐行 JSON.parse
}
```

读完后会检查第一条必须是有效 session header：

```ts
const header = entries[0];
if (header.type !== "session" || typeof header.id !== "string") {
    return [];
}
```

版本迁移现在有两步：

```ts
function migrateToCurrentVersion(entries: FileEntry[]): boolean {
    const version = header?.version ?? 1;
    if (version >= CURRENT_SESSION_VERSION) return false;
    if (version < 2) migrateV1ToV2(entries); // 给线性历史补 id / parentId
    if (version < 3) migrateV2ToV3(entries); // hookMessage role 改名 custom
    return true;
}
```

打开旧文件时，如果迁移发生，`SessionManager.open()` 会 `_rewriteFile()`，把迁移后的结构写回磁盘。

## 14. Session 列表：为什么能搜索历史

`SessionManager.list()` 和 `listAll()` 不会完整构建每个 session 的上下文，而是调用 `buildSessionInfo()` 提取轻量信息：

```ts
return {
    path: filePath,
    id: header.id,
    cwd,
    name,
    parentSessionPath,
    created: new Date(header.timestamp),
    modified,
    messageCount,
    firstMessage: firstMessage || "(no messages)",
    allMessagesText: allMessages.join(" "),
};
```

session picker 用这些字段实现：

- 当前项目列表：`SessionManager.list(cwd, sessionDir)`
- 全局列表：`SessionManager.listAll(sessionDir)`
- 搜索：匹配 `firstMessage` / `allMessagesText` / name / path
- 展示名：取最新 `session_info` entry
- 排序：默认按最近活动时间

为避免很多历史文件时卡 UI，列表加载用了并发上限：

```ts
const MAX_CONCURRENT_SESSION_INFO_LOADS = 10;
```

## 15. 还有一套 harness Session：它解决什么

仓库里还有 `packages/agent/src/harness/session/*`。它和 `coding-agent/src/core/session-manager.ts` 很像，但目标不同：

| 实现 | 当前用途 | 特点 |
| --- | --- | --- |
| `coding-agent/src/core/session-manager.ts` | CLI/TUI/VS Code 的现有应用层 session | 同步文件 API、延迟 flush、内置旧版本迁移 |
| `agent/src/harness/session/*` | 更通用的 agent harness session 抽象 | `SessionStorage` / `SessionRepo` 接口、异步文件系统、`leaf` entry、`retainedTail` |

harness 版本把存储拆成三层：

```
SessionRepo      管 create/open/list/fork
SessionStorage   管 appendEntry/getLeafId/getPathToRootOrCompaction
Session          管 appendMessage/buildContext/moveTo 等高级 API
```

例如 `JsonlSessionStorage.setLeafId()` 不只是改内存变量，而是追加一个 `leaf` entry：

```ts
const entry: LeafEntry = {
    type: "leaf",
    id: generateEntryId(this.byId),
    parentId: this.currentLeafId,
    timestamp: new Date().toISOString(),
    targetId: leafId,
};
await this.fs.appendFile(this.filePath, `${JSON.stringify(entry)}\n`);
this.currentLeafId = leafId;
```

这比 `coding-agent` 当前的 `branch()` 更“持久化 leaf 移动”。但理解 Pi 当前产品的 session 行为，主线仍然是 `AgentSession + SessionManager`。

## 16. 设计原则总结

1. **事件驱动持久化**：Agent loop 只发事件；AgentSession 在 `message_end` 上落盘。这样内存态、UI、文件历史来自同一条事件流。

2. **append-only 历史**：分支、标签、压缩、命名都是追加 entry；旧历史不被改写，降低数据丢失风险。

3. **leaf 决定当前路径**：JSONL 保存全树，LLM 只看到当前 leaf 对应路径。`/tree` 的本质是移动 leaf。

4. **上下文是投影，不等于文件**：session 文件保存产品完整历史；`buildSessionContext()` 会按 leaf、compaction、entry 类型投影成 AgentMessage。

5. **压缩也是历史节点**：compaction 不删除旧消息，只加摘要节点。旧消息仍可导出、统计或走其他分支。

6. **cwd 绑定运行时**：打开另一个项目的 session 时，settings、resources、extensions、models 都要按新 cwd 重建，不能复用旧服务。

7. **文件格式宽容读取、明确迁移**：加载时跳过坏行、校验 header、自动迁移 v1/v2；发现可迁移旧格式后重写为当前版本。

## 17. 建议阅读顺序

初学者按这个顺序看代码最省力：

1. `packages/coding-agent/docs/sessions.md`：先理解用户能做什么。
2. `packages/coding-agent/docs/session-format.md`：看 JSONL 格式和 entry 类型。
3. `packages/coding-agent/src/core/session-manager.ts`：重点看 `appendMessage()`、`branch()`、`buildSessionContext()`、`_persist()`。
4. `packages/coding-agent/src/core/sdk.ts`：看 `createAgentSession()` 如何从 session 恢复 model/thinking/messages。
5. `packages/coding-agent/src/core/agent-session.ts`：看 `_handleAgentEvent()`、`prompt()`、`compact()`、`navigateTree()`。
6. `packages/coding-agent/src/core/agent-session-runtime.ts`：看 `/new`、`/resume`、`/fork` 如何替换 runtime。
7. `packages/agent/src/agent.ts`：最后看低层 Agent 如何维护内存态和队列。
