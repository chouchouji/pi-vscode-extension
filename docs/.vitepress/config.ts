import { defineConfig } from "vitepress";

export default defineConfig({
	lang: "zh-CN",
	title: "Pi VS Code 扩展",
	description: "Pi VS Code 扩展的技术文档。",
	themeConfig: {
		nav: [{ text: "文章", link: "/articles/vscode-webview-communication" }],
		socialLinks: [{ icon: "github", link: "https://github.com/chouchouji/pi-vscode-extension" }],
		sidebar: [
			{
				text: "文章",
				items: [{ text: "VS Code Webview 通信", link: "/articles/vscode-webview-communication" }],
			},
		],
	},
});