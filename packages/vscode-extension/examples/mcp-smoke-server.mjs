#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
	name: "pi-vscode-mcp-smoke",
	version: "0.0.1",
});

server.registerTool(
	"smoke_echo",
	{
		description: "Echo text for Pi VS Code MCP smoke tests.",
		inputSchema: {
			text: z.string().describe("Text to echo."),
		},
	},
	async ({ text }) => ({
		content: [{ type: "text", text: `smoke:${text}` }],
		structuredContent: { echoed: text },
	}),
);

await server.connect(new StdioServerTransport());
