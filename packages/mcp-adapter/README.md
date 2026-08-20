# @earendil-works/pi-mcp-adapter

Internal MCP adapter package vendored from `nicobailon/pi-mcp-adapter`.

The VS Code extension imports this package directly and registers it through
`DefaultResourceLoader` extension factories. Developers using the VS Code
extension do not install this package or configure Pi packages manually; they add
a workspace `.mcp.json` using the standard `mcpServers` shape.

```json
{
	"mcpServers": {
		"chrome-devtools": {
			"command": "npx",
			"args": ["-y", "chrome-devtools-mcp@1.6.0"]
		}
	}
}
```

Design tools such as Figma, Lanhu, or other MCP-capable products can be wired by
using the command, arguments, environment, or URL documented by that tool's MCP
server.

The upstream adapter license is preserved in `LICENSE`.
