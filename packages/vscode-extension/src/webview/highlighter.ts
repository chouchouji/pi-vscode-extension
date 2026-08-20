import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import css from "shiki/langs/css.mjs";
import diff from "shiki/langs/diff.mjs";
import html from "shiki/langs/html.mjs";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import jsonc from "shiki/langs/jsonc.mjs";
import jsx from "shiki/langs/jsx.mjs";
import markdown from "shiki/langs/markdown.mjs";
import python from "shiki/langs/python.mjs";
import shellscript from "shiki/langs/shellscript.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";
import yaml from "shiki/langs/yaml.mjs";
import githubDarkHighContrast from "shiki/themes/github-dark-high-contrast.mjs";
import githubLightHighContrast from "shiki/themes/github-light-high-contrast.mjs";
import type { ThemedToken } from "shiki/types";

interface PiShikiHighlighter {
	highlight(code: string, language: string, dark: boolean): Promise<string>;
	highlightDiff(code: string, dark: boolean): Promise<string>;
}

const languageAliases = new Map([
	["bash", "bash"],
	["css", "css"],
	["diff", "diff"],
	["html", "html"],
	["htm", "html"],
	["javascript", "javascript"],
	["js", "javascript"],
	["mjs", "javascript"],
	["cjs", "javascript"],
	["json", "json"],
	["jsonc", "jsonc"],
	["jsx", "jsx"],
	["markdown", "markdown"],
	["md", "markdown"],
	["patch", "diff"],
	["python", "python"],
	["py", "python"],
	["sh", "shellscript"],
	["shell", "shellscript"],
	["shellscript", "shellscript"],
	["tsx", "tsx"],
	["typescript", "typescript"],
	["ts", "typescript"],
	["mts", "typescript"],
	["cts", "typescript"],
	["yaml", "yaml"],
	["yml", "yaml"],
]);

let highlighterPromise: Promise<Awaited<ReturnType<typeof createHighlighterCore>>> | undefined;

const DARK_THEME = "github-dark-high-contrast";
const LIGHT_THEME = "github-light-high-contrast";

function getHighlighter(): Promise<Awaited<ReturnType<typeof createHighlighterCore>>> {
	highlighterPromise ??= createHighlighterCore({
		engine: createJavaScriptRegexEngine(),
		themes: [githubDarkHighContrast, githubLightHighContrast],
		langs: [
			bash,
			css,
			diff,
			html,
			javascript,
			json,
			jsonc,
			jsx,
			markdown,
			python,
			shellscript,
			tsx,
			typescript,
			yaml,
		],
	});
	return highlighterPromise;
}

function looksLikeDiff(code: string): boolean {
	return code.split("\n").some((line) => {
		return (
			line.startsWith("diff --git") ||
			line.startsWith("@@ ") ||
			line.startsWith("+++ ") ||
			line.startsWith("--- ") ||
			line.startsWith("+") ||
			line.startsWith("-")
		);
	});
}

function resolveLanguage(language: string, code: string): string {
	const normalized = language.trim().toLowerCase();
	const resolved = languageAliases.get(normalized);
	if (resolved) {
		return resolved;
	}
	return looksLikeDiff(code) ? "diff" : "text";
}

function escapeHtml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function tokenStyle(token: ThemedToken): string {
	const styles: string[] = [];
	if (token.color) {
		styles.push(`--pi-token-color:${token.color}`);
		styles.push("color:var(--pi-token-color) !important");
		styles.push("-webkit-text-fill-color:var(--pi-token-color) !important");
		styles.push("background-image:linear-gradient(var(--pi-token-color), var(--pi-token-color))");
		styles.push("background-clip:text");
		styles.push("forced-color-adjust:none");
		styles.push("-webkit-background-clip:text");
	}
	if (token.fontStyle) {
		if (token.fontStyle & 1) {
			styles.push("font-style:italic");
		}
		if (token.fontStyle & 2) {
			styles.push("font-weight:700");
		}
		if (token.fontStyle & 4) {
			styles.push("text-decoration:underline");
		}
	}
	return styles.join(";");
}

function tokensToHtml(tokens: readonly ThemedToken[]): string {
	return tokens
		.map((token) => {
			const style = tokenStyle(token);
			const content = escapeHtml(token.content);
			const colorAttribute = token.color ? ` data-pi-token-color="${escapeHtml(token.color)}"` : "";
			return style ? `<span class="shiki-token"${colorAttribute} style="${style}">${content}</span>` : content;
		})
		.join("");
}

async function highlightCode(code: string, language: string, dark: boolean): Promise<string> {
	const highlighter = await getHighlighter();
	const theme = dark ? DARK_THEME : LIGHT_THEME;
	const resolvedLanguage = resolveLanguage(language, code);
	if (resolvedLanguage === "text") {
		return `<pre class="shiki shiki-code-block" tabindex="0"><code>${escapeHtml(code)}</code></pre>`;
	}

	try {
		const tokenLines = highlighter.codeToTokensBase(code, {
			lang: resolvedLanguage,
			theme,
		});
		const renderedLines = code.split("\n").map((line, index) => {
			const tokens = tokenLines[index];
			const html = tokens && tokens.length > 0 ? tokensToHtml(tokens) : escapeHtml(line || " ");
			return `<span class="line">${html}</span>`;
		});
		return `<pre class="shiki shiki-code-block" tabindex="0"><code>${renderedLines.join("\n")}</code></pre>`;
	} catch {
		return `<pre class="shiki shiki-code-block" tabindex="0"><code>${escapeHtml(code)}</code></pre>`;
	}
}

function languageFromPath(path: string): string | undefined {
	const extension = path
		.trim()
		.split(/[./\\]/)
		.pop()
		?.toLowerCase();
	return extension ? languageAliases.get(extension) : undefined;
}

function diffLineClass(line: string): string {
	if (line.startsWith("+") && !line.startsWith("+++")) {
		return "diff-add";
	}
	if (line.startsWith("-") && !line.startsWith("---")) {
		return "diff-delete";
	}
	if (line.startsWith("@@")) {
		return "diff-hunk";
	}
	if (
		line.startsWith("diff --git") ||
		line.startsWith("index ") ||
		line.startsWith("+++ ") ||
		line.startsWith("--- ")
	) {
		return "diff-header";
	}
	return "";
}

async function highlightLineContent(
	highlighter: Awaited<ReturnType<typeof createHighlighterCore>>,
	content: string,
	language: string,
	theme: string,
): Promise<string> {
	if (!content || language === "text") {
		return escapeHtml(content || " ");
	}
	try {
		const [tokens] = highlighter.codeToTokensBase(content, {
			lang: language,
			theme,
		});
		return tokens ? tokensToHtml(tokens) : escapeHtml(content);
	} catch {
		return escapeHtml(content);
	}
}

async function highlightDiffCode(code: string, dark: boolean): Promise<string> {
	const highlighter = await getHighlighter();
	const theme = dark ? DARK_THEME : LIGHT_THEME;
	let currentLanguage = "text";
	const renderedLines: string[] = [];

	for (const line of code.split("\n")) {
		const lineClass = diffLineClass(line);
		if (line.startsWith("+++ ")) {
			const path = line.replace(/^\+\+\+\s+b\//, "").replace(/^\+\+\+\s+/, "");
			currentLanguage = languageFromPath(path) ?? currentLanguage;
		} else if (line.startsWith("diff --git ")) {
			const match = line.match(/\sb\/(.+)$/);
			if (match) {
				currentLanguage = languageFromPath(match[1]) ?? currentLanguage;
			}
		}

		let prefix = "";
		let content = line;
		if (
			(line.startsWith("+") && !line.startsWith("+++")) ||
			(line.startsWith("-") && !line.startsWith("---")) ||
			line.startsWith(" ")
		) {
			prefix = line.slice(0, 1);
			content = line.slice(1);
		}

		const highlightedContent =
			lineClass === "diff-header" || lineClass === "diff-hunk"
				? escapeHtml(content || " ")
				: await highlightLineContent(highlighter, content, currentLanguage, theme);
		renderedLines.push(
			`<span class="line ${lineClass}"><span class="diff-prefix">${escapeHtml(prefix)}</span>${highlightedContent}</span>`,
		);
	}

	return `<pre class="shiki shiki-code-block shiki-diff" tabindex="0"><code>${renderedLines.join("\n")}</code></pre>`;
}

const api: PiShikiHighlighter = {
	async highlight(code, language, dark) {
		return highlightCode(code, language, dark);
	},
	highlightDiff: highlightDiffCode,
};

(globalThis as typeof globalThis & { piShikiHighlighter: PiShikiHighlighter }).piShikiHighlighter = api;
