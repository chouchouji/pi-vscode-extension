# VS Code Webview 通信

## 问题

VS Code Webview 运行在隔离的浏览器上下文中，只能通过官方 `postMessage` 边界与 Extension Host 通信。

扩展最初将每个操作作为顶层对象发送，例如：

```ts
vscode.postMessage({ type: "send", text });
```

这种方式可以工作，但随着 UI 操作增多，命令名称和字段容易变得不一致。

## 旧版策略的问题

旧版直接将业务字段放在消息顶层，并以 `type` 区分全部 Webview 请求和 host 事件。它没有改变 `postMessage` 的传输能力，但应用层协议存在几个问题：

- **请求和事件混在同一种外形中**：`{ type: "send", text }`、`{ type: "appendDelta", id, delta }` 都是顶层 `type` 对象，无法从消息外形直接判断它是一次命令还是一次 UI 更新。
- **没有请求 ID**：Webview 无法把一次操作和它的处理结果关联起来。例如点击“停止”或“切换会话”后，无法可靠地知道 host 是否处理成功。
- **没有统一的成功与失败结果**：host 发生异常时，Webview 没有标准的错误消息可消费，只能静默等待后续状态事件。
- **发送逻辑分散**：每个按钮、菜单和文件链接都直接调用 `vscode.postMessage()`，新增字段时容易出现命令名、字段名或错误处理方式不一致。
- **协议边界不集中**：虽然 host 会校验传入数据，但 Webview 到 host 的命令结构与 host 到 Webview 的更新结构没有明确的公共约定。

例如旧版发送消息后，Webview 只会发出请求；是否成功完全依赖后续是否碰巧收到状态更新：

```ts
vscode.postMessage({ type: "send", text });
```

## 可选方案

| 方案 | 评估 |
| --- | --- |
| 原始 `postMessage` | 必须使用的传输边界，但需要统一的应用层协议。 |
| Command URI | 适合触发 VS Code 命令，不适合双向应用通信。 |
| `MessageChannel` | 对单个 Webview 的类型和请求语义没有额外帮助。 |
| 第三方 RPC 库 | 对当前扩展而言引入的机制多于实际需要。 |

## 采用的协议

扩展继续使用 `postMessage`，并在其上定义三类消息：

- `request`：Webview 发给 host 的命令。
- `response`：与请求 ID 对应的处理结果。
- `event`：host 主动推送的 UI 更新。

```ts
{
  kind: "request",
  id: "42",
  request: {
    method: "send",
    params: { text: "解释这个文件" },
  },
}
```

Webview 通过 bridge 发送请求：

```js
notify("send", { text });
```

Extension Host 校验不可信的消息负载，处理对应方法后返回响应：

```ts
{ kind: "response", id: "42", ok: true }
```

流式聊天输出由 host 主动推送：

```ts
{
  kind: "event",
  event: {
    type: "appendDelta",
    id: "assistant-message-id",
    delta: "这个文件负责...",
  },
}
```

## 新旧对比

| 维度 | 旧版顶层 `type` 消息 | 新版 bridge 协议 |
| --- | --- | --- |
| 传输层 | `postMessage` | 仍然是 `postMessage` |
| 命令外形 | `{ type, ...业务字段 }` | `{ kind: "request", id, request: { method, params } }` |
| host 更新外形 | 与命令共用 `type` | `{ kind: "event", event }` |
| 请求结果 | 没有统一约定 | 用相同 `id` 返回 `response` |
| 错误反馈 | 调用方通常无法得知 | `response.ok === false` 携带错误信息 |
| Webview 调用点 | 多处直接调用 `postMessage` | 统一经过 `notify()` 或 `call()` |
| 参数边界 | 业务字段散在消息顶层 | 参数固定收敛到 `params` |

新版的主要收益是**统一而非替换**：底层仍遵循 VS Code 官方通信方式，不增加额外服务或第三方依赖；同时让命令、结果和推送事件拥有稳定边界。

它也不会消除新增功能所需的业务工作。新增一个操作仍需要声明参数、校验输入并在 host 处理，但每一步都有固定位置，且 Webview 能获得一致的成功和失败反馈。

## 新增按钮

新增 Webview 操作时，先在 `src/protocol.ts` 的 `WebviewRequestParams` 中声明方法和参数结构：

```ts
refreshSessions: Record<string, never>;
```

再在 `parseWebviewMessage()` 中校验：

```ts
if (method === "refreshSessions") {
  return { kind: "request", id, request: { method, params: {} } };
}
```

在 `PiChatViewProvider` 中处理：

```ts
case "refreshSessions":
  await this.refreshSessions();
  break;
```

最后在 Webview 中绑定按钮：

```js
refreshSessionsEl.addEventListener("click", () => notify("refreshSessions", {}));
```

`refreshSessions()` 已发布 `sessions` 事件，因此现有渲染路径会自动更新 UI。