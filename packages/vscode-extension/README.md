# Pi Code Agent

Pi Code Agent 是一个 VS Code AI 编程助手插件。你可以在编辑器侧边栏中向 Pi 提问、解释代码、引用当前文件或选区，并在确认后让 Pi 修改工作区文件。

> Tips: 非官方插件

## 环境要求

- VS Code 1.96.0 或更高版本。
- 已配置可用的 Pi 账号和模型。

## 安装

在 VS Code 扩展市场中搜索 `Pi Code Agent` 并安装。安装完成后，按提示重新加载窗口。

## 打开插件

安装后，VS Code Activity Bar 会出现 `π` 图标。点击图标打开 `Chat` 视图。

也可以打开 Command Palette，运行 `Pi: Focus Chat`。

## 开始对话

1. 在 VS Code 中打开你的项目文件夹。
2. 在左侧 `Pi` 聊天视图中输入问题或任务。
3. 按发送按钮提交。
4. 等待 Pi 回复。如果 Pi 需要修改文件，会先请求你的确认。

可以输入类似：

- `解释这个文件的作用`
- `帮我修复当前报错`
- `给这个函数补充测试`
- `重构这段代码，让它更清晰`

## 权限模式

聊天框中的模式选择决定 Pi 可以对当前项目做什么：

- `Ask`：只回答问题和解释代码，不修改文件。
- `Plan`：查看项目并给出修改计划，不修改文件。
- `Code`：可以读取项目、运行命令，并在你确认后修改文件。

如果只是提问或阅读代码，建议使用 `Ask`。如果希望 Pi 实际完成修改，切换到 `Code`。

## 编辑审批

当 Pi 准备修改文件时，聊天视图会显示审批项。你可以选择：

- `Review`：查看修改内容。
- `Apply`：应用修改。
- `Reject`：拒绝修改。
- `Apply all` 或 `Reject all`：批量处理当前审批项。

建议在应用修改前先查看变更内容。

## 思考中继续输入

Pi 处理上一次消息时可以直接输入新的消息，消息会进入队列而不会丢失：

- `Cmd+Enter`（macOS）或 `Ctrl+Enter`（Windows/Linux）发送 **steer**：在当前回复的工具调用完成后、下一次回复前插入。适合打断当前思路、调整方向。
- `Alt+Enter` 发送 **follow-up**：等 Pi 完成当前回复后再投递。适合补充后续要求。

排队的消息会显示在输入框上方（steer 蓝色、follow-up 紫色）。点击 `Restore` 可以把排队内容恢复到输入框；点击停止按钮会停止当前回复，并把排队内容恢复到输入框。

> 未运行时两种按键行为一致，与普通发送相同。

## 历史会话

点击聊天视图标题栏的历史按钮，或运行 `Pi: Chat History`，可以查看最近会话并切换到旧会话。

## MCP 服务器

插件支持通过 MCP 扩展 Pi 的工具能力（例如 GitHub、Context7 等）。在工作区根目录创建 `.mcp.json` 即可配置，例如接入 GitHub 官方 MCP 服务器：

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "github-mcp-server"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx"
      }
    }
  }
}

```

MCP 服务器默认懒启动：Pi 第一次调用相关工具时才拉起进程，配置后新开会话即可生效。也可以使用 GitHub Copilot 的 MCP 端点：

```json
{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp",
      "auth": "oauth",
      "protocolVersion": "auto"
    }
  }
}

```

## 配置项

可以在 VS Code 设置中搜索 `Pi`，调整以下配置：

- `Pi: Agent Dir`：自定义 Pi 配置目录。通常保持默认即可。修改后，`auth.json`、`settings.json` 和 `models.json` 都会从这个目录读取。
- `Pi: Permission Mode`：新会话的默认权限模式。

## 配置模型和 API Key

插件默认读取 Pi 的配置目录：

- macOS/Linux：`~/.pi/agent`
- Windows：`%USERPROFILE%\.pi\agent`

如果你已经安装 Pi CLI，可以先在终端中完成登录和模型选择：

```bash
pi
/login
/model
```

VS Code 插件会复用同一个配置目录。

也可以直接创建配置文件。先在配置目录中创建 `auth.json`，写入你要使用的 provider API key：

```json
{
  "anthropic": { "type": "api_key", "key": "sk-ant-..." },
  "openai": { "type": "api_key", "key": "sk-..." },
  "google": { "type": "api_key", "key": "..." },
  "openrouter": { "type": "api_key", "key": "..." }
}
```

只需要保留你实际使用的 provider。常用 provider 对应关系：

- Anthropic：`anthropic`
- OpenAI：`openai`
- DeepSeek：`deepseek`

然后创建 `settings.json`，设置默认模型：

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-opus-4-8",
  "defaultThinkingLevel": "medium"
}
```

`defaultProvider` 要和 `auth.json` 中的 provider 名称一致，`defaultModel` 要填写该 provider 支持的模型 ID。

如果你使用自定义 OpenAI 兼容服务、Ollama、LM Studio 或代理服务，可以在配置目录中创建 `models.json`：

```json
{
  "providers": {
    "my-openai-compatible-provider": {
      "baseUrl": "https://api.example.com/v1",
      "api": "openai-completions",
      "apiKey": "$MY_API_KEY",
      "models": [
        { "id": "my-model" }
      ]
    }
  }
}
```

如果 API key 写在环境变量里，请从带有该环境变量的终端启动 VS Code。否则建议写入 `auth.json` 或在 `models.json` 的 `apiKey` 中直接配置。
