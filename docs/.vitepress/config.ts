import { defineConfig } from "vitepress";

export default defineConfig({
	lang: "zh-CN",
	title: "Pi VSCode Extension",
	description: "Pi VSCode Extension的技术文档。",
	base: "/pi-vscode-extension/",
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