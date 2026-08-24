import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "zh-CN",
  title: "Pi VSCode Extension",
  description: "Pi VSCode Extension的技术文档。",
  base: "/pi-vscode-extension/",
  themeConfig: {
    nav: [{ text: "文章", link: "/articles/vscode-webview-communication" }],
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/chouchouji/pi-vscode-extension",
      },
    ],
    sidebar: [
      {
        text: "文章",
        items: [
          {
            text: "VSCode Webview 通信",
            link: "/articles/vscode-webview-communication",
          },
          {
            text: "Agent Loop 实现剖析：从用户输入到模型输出",
            link: "/articles/agent-loop-analysis",
          },
          {
            text: "Tool 系统设计：从 schema 到并行执行",
            link: "/articles/tool-system-design",
          },
          {
            text: "Session 系统设计：从 JSONL 树到运行时切换",
            link: "/articles/session-design",
          }
        ],
      },
    ],
  },
});
