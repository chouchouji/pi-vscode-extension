export function getWebviewScript(highlighterScriptUri: string, scriptNonce: string): string {
	return `			const vscode = acquireVsCodeApi();
		const shikiScriptUri = ${JSON.stringify(highlighterScriptUri)};
		const shikiScriptNonce = ${JSON.stringify(scriptNonce)};
			const emptyStateEl = document.getElementById("emptyState");
			const messagesEl = document.getElementById("messages");
			const approvalsEl = document.getElementById("approvals");
			const approvalBatchEl = document.getElementById("approvalBatch");
			const inputEl = document.getElementById("input");
			const sendEl = document.getElementById("send");
			const stopEl = document.getElementById("stop");
			const newEl = document.getElementById("new");
			const reviewAllEl = document.getElementById("reviewAll");
		const applyAllEl = document.getElementById("applyAll");
		const rejectAllEl = document.getElementById("rejectAll");
		const modeEl = document.getElementById("mode");
		const modeLabelEl = document.getElementById("modeLabel");
		const approvalModeEl = document.getElementById("approvalMode");
		const approvalModeLabelEl = document.getElementById("approvalModeLabel");
		const selectMenuEl = document.getElementById("selectMenu");
		const modelStatusEl = document.getElementById("modelStatus");
		const sessionPanelEl = document.getElementById("sessionPanel");
		const sessionPanelCloseEl = document.getElementById("sessionPanelClose");
		const sessionSearchEl = document.getElementById("sessionSearch");
		const sessionListEl = document.getElementById("sessionList");
		const messageEls = new Map();
		const messageData = new Map();
		const approvalEls = new Map();
		let sessionsState = [];
		let running = false;
		let activeSessionPath = "";
		let permissionModeValue = "code";
		let approvalModeValue = "ask";
		let openSelectKind = "";
		let highlighterLoadPromise;
		const permissionModeOptions = [
			{ value: "ask", label: "Ask", description: "Read-only answers and explanations." },
			{ value: "plan", label: "Plan", description: "Read-only implementation plans." },
			{ value: "code", label: "Code", description: "Read, run, and edit with approvals." },
		];
		const approvalModeOptions = [
			{ value: "ask", label: "Default", description: "Ask before applying VS Code edits." },
			{ value: "auto", label: "Auto", description: "Apply VS Code edits without prompting." },
		];

		function appendText(parent, className, text) {
			const el = document.createElement("div");
			el.className = className;
			el.textContent = text;
			parent.appendChild(el);
			return el;
		}

		function appendHighlightedToken(parent, text, className) {
			const span = document.createElement("span");
			span.className = className;
			span.textContent = text;
			parent.appendChild(span);
		}

		function appendHighlightedGrepLine(parent, line) {
			const match = line.match(/^(.+?):(\\d+)(?::(\\d+))?([-:])(.*)$/);
			if (!match) {
				appendHighlightedCodeLine(parent, line, "");
				return;
			}

			appendHighlightedToken(parent, match[1], "code-file-path");
			parent.appendChild(document.createTextNode(":"));
			appendHighlightedToken(parent, match[2], "code-number");
			if (match[3]) {
				parent.appendChild(document.createTextNode(":"));
				appendHighlightedToken(parent, match[3], "code-number");
			}
			parent.appendChild(document.createTextNode(match[4]));
			appendHighlightedCodeLine(parent, match[5], languageFromPathText(match[1]));
		}

		function appendHighlightedCodeLine(parent, line, language) {
			const normalizedLanguage = (language || "").toLowerCase();
			if (normalizedLanguage === "grep") {
				appendHighlightedGrepLine(parent, line);
				return;
			}
			const isJson = normalizedLanguage === "json" || normalizedLanguage === "jsonc";
			const pattern = /("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\\/\\/.*|#.*|\\b(?:async|await|break|case|catch|class|const|constructor|continue|default|else|export|extends|false|for|from|function|if|import|interface|let|new|null|private|public|readonly|return|switch|throw|true|try|type|undefined|var|while)\\b|-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)/g;
			let offset = 0;
			for (const match of line.matchAll(pattern)) {
				const value = match[0];
				const index = match.index || 0;
				if (index > offset) {
					parent.appendChild(document.createTextNode(line.slice(offset, index)));
				}
				const className = value.startsWith("//") || value.startsWith("#")
					? "code-comment"
					: value.startsWith(String.fromCharCode(34)) || value.startsWith("'")
						? isJson && value.startsWith(String.fromCharCode(34)) && /^\\s*:/.test(line.slice(index + value.length))
							? "code-json-key"
							: "code-string"
						: /^-?\\d/.test(value)
							? "code-number"
							: "code-keyword";
				appendHighlightedToken(parent, value, className);
				offset = index + value.length;
			}
			if (offset < line.length) {
				parent.appendChild(document.createTextNode(line.slice(offset)));
			}
		}

		function appendHighlightedCode(parent, code, language) {
			const normalizedLanguage = (language || "").toLowerCase();
			const lines = code.split("\\n");
			const isDiff = normalizedLanguage === "diff" || normalizedLanguage === "patch" || lines.some((line) =>
				line.startsWith("diff --git") || line.startsWith("@@ ") || line.startsWith("+++ ") || line.startsWith("--- "),
			);
			for (const line of lines) {
				const lineEl = document.createElement("span");
				lineEl.className = "code-line";
				if (isDiff) {
					if (line.startsWith("+") && !line.startsWith("+++")) {
						lineEl.classList.add("diff-add");
					} else if (line.startsWith("-") && !line.startsWith("---")) {
						lineEl.classList.add("diff-delete");
					} else if (line.startsWith("@@")) {
						lineEl.classList.add("diff-hunk");
					} else if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("+++ ") || line.startsWith("--- ")) {
						lineEl.classList.add("diff-header");
					}
					lineEl.textContent = line || " ";
				} else {
					appendHighlightedCodeLine(lineEl, line, normalizedLanguage);
					if (!line) {
						lineEl.textContent = " ";
					}
				}
				parent.appendChild(lineEl);
			}
		}

		function getPiShikiHighlighter() {
			return window.piShikiHighlighter;
		}

		function loadShikiHighlighter() {
			const existing = getPiShikiHighlighter();
			if (existing) {
				return Promise.resolve(existing);
			}
			highlighterLoadPromise ||= new Promise((resolve, reject) => {
				const script = document.createElement("script");
				script.src = shikiScriptUri;
				script.nonce = shikiScriptNonce;
				script.addEventListener("load", () => {
					const loaded = getPiShikiHighlighter();
					if (loaded) {
						resolve(loaded);
					} else {
						reject(new Error("Shiki highlighter did not initialize."));
					}
				});
				script.addEventListener("error", () => reject(new Error("Failed to load Shiki highlighter.")));
				document.head.appendChild(script);
			});
			return highlighterLoadPromise;
		}

		function isDarkTheme() {
			const rawColor = getComputedStyle(document.body).getPropertyValue("--vscode-editor-background");
			const match = rawColor.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
			if (!match) {
				return true;
			}
			const red = Number(match[1]) / 255;
			const green = Number(match[2]) / 255;
			const blue = Number(match[3]) / 255;
			return red * 0.2126 + green * 0.7152 + blue * 0.0722 < 0.5;
		}

		function applyDiffLineClasses(pre) {
			for (const line of pre.querySelectorAll(".line")) {
				const text = line.textContent || "";
				if (text.startsWith("+") && !text.startsWith("+++")) {
					line.classList.add("diff-add");
				} else if (text.startsWith("-") && !text.startsWith("---")) {
					line.classList.add("diff-delete");
				} else if (text.startsWith("@@")) {
					line.classList.add("diff-hunk");
				} else if (text.startsWith("diff --git") || text.startsWith("index ") || text.startsWith("+++ ") || text.startsWith("--- ")) {
					line.classList.add("diff-header");
				}
			}
		}

		function normalizeShikiTokenStyles(pre) {
			for (const token of pre.querySelectorAll("span[style]")) {
				const color =
					token.getAttribute("data-pi-token-color") || token.style.getPropertyValue("--pi-token-color") || token.style.color;
				if (!color) {
					continue;
				}
				token.classList.add("shiki-token");
				token.dataset.piTokenColor = color;
				token.style.setProperty("--pi-token-color", color);
				token.style.setProperty("color", "var(--pi-token-color)", "important");
				token.style.setProperty("-webkit-text-fill-color", "var(--pi-token-color)", "important");
				token.style.setProperty("background-image", "linear-gradient(var(--pi-token-color), var(--pi-token-color))");
				token.style.setProperty("background-clip", "text");
				token.style.setProperty("forced-color-adjust", "none");
				token.style.setProperty("-webkit-background-clip", "text");
			}
		}

		function normalizeShikiLineLayout(pre) {
			const code = pre.querySelector("code");
			if (!code) {
				return;
			}
			for (const node of Array.from(code.childNodes)) {
				if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) {
					node.remove();
				}
			}
		}

		function canvasColor(element, fallback) {
			const datasetTokenColor = (element.getAttribute("data-pi-token-color") || element.dataset.piTokenColor || "").trim();
			if (datasetTokenColor && !datasetTokenColor.startsWith("var(")) {
				return datasetTokenColor;
			}
			const inlineTokenColor = element.style.getPropertyValue("--pi-token-color").trim();
			if (inlineTokenColor && !inlineTokenColor.startsWith("var(")) {
				return inlineTokenColor;
			}
			const inlineColor = element.style.color.trim();
			if (inlineColor && !inlineColor.startsWith("var(")) {
				return inlineColor;
			}
			const style = getComputedStyle(element);
			const tokenColor = style.getPropertyValue("--pi-token-color").trim();
			if (tokenColor && !tokenColor.startsWith("var(")) {
				return tokenColor;
			}
			const color = style.color.trim();
			return color && color !== "rgba(0, 0, 0, 0)" ? color : fallback;
		}

		function renderTextNode(ctx, text, x, baseline, font) {
			if (!text) {
				return x;
			}
			ctx.font = font;
			ctx.fillText(text, x, baseline);
			return x + ctx.measureText(text).width;
		}

		function drawCodeCanvas(pre, canvas) {
			const code = pre.querySelector("code");
			if (!code) {
				return;
			}
			const lineEls = Array.from(code.querySelectorAll(".line"));
			if (lineEls.length === 0) {
				return;
			}

			const codeStyle = getComputedStyle(code);
			const fontSize = Number.parseFloat(codeStyle.fontSize) || 12;
			const lineHeight = Number.parseFloat(codeStyle.lineHeight) || fontSize * 1.45;
			const fontFamily = codeStyle.fontFamily || "monospace";
			const defaultColor = codeStyle.color.trim() || getComputedStyle(document.body).color.trim() || "#f0f3f6";
			const ratio = window.devicePixelRatio || 1;
			const sampledColors = new Set();
			const lineMetrics = [];
			let contentWidth = 1;

			const measureContext = canvas.getContext("2d");
			if (!measureContext) {
				return;
			}

			for (const line of lineEls) {
				let x = 0;
				for (const node of Array.from(line.childNodes)) {
					if (node.nodeType === Node.TEXT_NODE) {
						measureContext.font = fontSize + "px " + fontFamily;
						x += measureContext.measureText(node.textContent || "").width;
					} else if (node instanceof HTMLElement) {
						const tokenStyle = getComputedStyle(node);
						const fontStyle = tokenStyle.fontStyle === "italic" ? "italic " : "";
						const fontWeight = tokenStyle.fontWeight === "700" || tokenStyle.fontWeight === "bold" ? "700 " : "";
						measureContext.font = fontStyle + fontWeight + fontSize + "px " + fontFamily;
						x += measureContext.measureText(node.textContent || "").width;
					}
				}
				lineMetrics.push(x);
				contentWidth = Math.max(contentWidth, x);
			}

			const contentHeight = Math.max(lineHeight, lineEls.length * lineHeight);
			canvas.width = Math.ceil(contentWidth * ratio);
			canvas.height = Math.ceil(contentHeight * ratio);
			canvas.style.width = String(Math.ceil(contentWidth)).concat("px");
			canvas.style.height = String(Math.ceil(contentHeight)).concat("px");

			const ctx = canvas.getContext("2d");
			if (!ctx) {
				return;
			}
			ctx.scale(ratio, ratio);
			ctx.textBaseline = "alphabetic";

			lineEls.forEach((line, lineIndex) => {
				let x = 0;
				const baseline = lineIndex * lineHeight + fontSize;
				for (const node of Array.from(line.childNodes)) {
					if (node.nodeType === Node.TEXT_NODE) {
						ctx.fillStyle = defaultColor;
						x = renderTextNode(ctx, node.textContent || "", x, baseline, fontSize + "px " + fontFamily);
					} else if (node instanceof HTMLElement) {
						const nodeStyle = getComputedStyle(node);
						const fontStyle = nodeStyle.fontStyle === "italic" ? "italic " : "";
						const fontWeight = nodeStyle.fontWeight === "700" || nodeStyle.fontWeight === "bold" ? "700 " : "";
						const color = canvasColor(node, defaultColor);
						sampledColors.add(color);
						ctx.fillStyle = color;
						x = renderTextNode(ctx, node.textContent || "", x, baseline, fontStyle + fontWeight + fontSize + "px " + fontFamily);
					}
				}
			});
			canvas.dataset.piTokenColors = Array.from(sampledColors).slice(0, 16).join(",");
		}

		function renderCodeCanvas(pre) {
			const code = pre.querySelector("code");
			if (!code || pre.querySelector("canvas.code-canvas")) {
				return;
			}
			const canvas = document.createElement("canvas");
			canvas.className = "code-canvas";
			pre.appendChild(canvas);
			pre.classList.add("canvas-code-block");
			code.classList.add("canvas-code-source");
			const draw = () => drawCodeCanvas(pre, canvas);
			requestAnimationFrame(draw);
			setTimeout(draw, 100);
		}

		function shouldRenderAsDiff(text) {
			return text.split("\\n").some((line) =>
				line.startsWith("diff --git") || line.startsWith("@@ ") || line.startsWith("+++ ") || line.startsWith("--- "),
			);
		}

		function normalizeLanguageId(language) {
			const normalized = (language || "").trim().toLowerCase();
			if (["typescript", "ts"].includes(normalized)) return "typescript";
			if (["typescriptreact", "tsx"].includes(normalized)) return "tsx";
			if (["javascript", "js", "mjs", "cjs"].includes(normalized)) return "javascript";
			if (["javascriptreact", "jsx"].includes(normalized)) return "jsx";
			if (["json", "jsonc", "css", "html", "diff"].includes(normalized)) return normalized;
			if (["markdown", "md"].includes(normalized)) return "markdown";
			if (["shell", "bash", "sh", "shellscript", "zsh"].includes(normalized)) return "shellscript";
			if (["python", "py"].includes(normalized)) return "python";
			if (["yaml", "yml"].includes(normalized)) return "yaml";
			return "";
		}

		function languageFromExtension(extension) {
			const normalized = (extension || "").toLowerCase();
			if (["ts", "mts", "cts"].includes(normalized)) return "typescript";
			if (normalized === "tsx") return "tsx";
			if (["js", "mjs", "cjs"].includes(normalized)) return "javascript";
			if (normalized === "jsx") return "jsx";
			if (["json", "jsonc", "css"].includes(normalized)) return normalized;
			if (["md", "markdown"].includes(normalized)) return "markdown";
			if (["htm", "html"].includes(normalized)) return "html";
			if (["yaml", "yml"].includes(normalized)) return "yaml";
			if (["py", "pyw"].includes(normalized)) return "python";
			if (["sh", "bash", "zsh"].includes(normalized)) return "shellscript";
			return "";
		}

		function languageFromPath(path) {
			const match = String(path || "").match(/\\.([A-Za-z0-9]+)$/);
			return match ? languageFromExtension(match[1]) : "";
		}

		function languageFromPathText(text) {
			const matches = String(text || "").matchAll(/(?:^|["'\\s])((?:\\.{1,2}[\\/\\\\]|[A-Za-z]:[\\/\\\\]|[\\/\\\\])?(?:[A-Za-z0-9_.@()[\\]-]+[\\/\\\\])*[A-Za-z0-9_.@()[\\]-]+\\.([A-Za-z0-9]+))(?=["'\\s:,)]|$)/g);
			for (const match of matches) {
				const language = languageFromExtension(match[2]);
				if (language) {
					return language;
				}
			}
			return "";
		}

		function languageFromLabelText(text) {
			const match = text.match(/(?:^|[\\n\\r])\\s*language\\s*:\\s*([A-Za-z0-9+#-]+)/i);
			const language = match ? normalizeLanguageId(match[1]) : "";
			return language || (match && match[1].toLowerCase() === "grep" ? "grep" : "");
		}

		function languageFromToolName(name) {
			const normalizedName = (name || "").toLowerCase();
			if (["bash", "shell", "sh"].includes(normalizedName)) {
				return "shellscript";
			}
			if (["grep", "rg", "ripgrep"].includes(normalizedName)) {
				return "grep";
			}
			return "";
		}

		function languageFromCodeText(text) {
			const trimmed = text.trimStart();
			if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
				return "json";
			}
			if (trimmed.startsWith("#!/") && /\\b(?:bash|sh|zsh)\\b/.test(trimmed.split("\\n")[0] || "")) {
				return "shellscript";
			}
			if (/^\\s*(?:import|export)\\s.+\\sfrom\\s+["']/.test(text) || /\\b(?:interface|type)\\s+[A-Za-z_$]/.test(text)) {
				return "typescript";
			}
			if (/<[A-Z][A-Za-z0-9]*(?:\\s|>|\\/) |\\bReact\\./.test(text)) {
				return "tsx";
			}
			if (/^\\s*(?:const|let|var|function|class)\\s+[A-Za-z_$]/m.test(text)) {
				return "javascript";
			}
			return "";
		}

		function languageFromToolArgs(tool) {
			const args = tool?.args || "";
			if (!args) {
				return "";
			}
			const parsed = parseToolArgs(tool);
			if (parsed) {
				const path = parsed.file_path || parsed.path;
				const language = typeof path === "string" ? languageFromPath(path) : "";
				if (language) {
					return language;
				}
			}
			const pathMatch = args.match(/["']?(?:file_path|path)["']?\\s*[:=]\\s*["']([^"'\\n]+)["']/i);
			if (pathMatch) {
				const language = languageFromPath(pathMatch[1]);
				if (language) {
					return language;
				}
			}
			return languageFromPathText(args);
		}

		function inferCodeLanguage(text, tool) {
			if (shouldRenderAsDiff(text)) {
				return "diff";
			}
			const fromToolArgs = languageFromToolArgs(tool);
			if (fromToolArgs) {
				return fromToolArgs;
			}
			const metadata = [tool?.name || "", tool?.title || "", tool?.args || ""].join("\\n");
			const fromToolMetadata = languageFromLabelText(metadata) || languageFromPathText(metadata);
			if (fromToolMetadata) {
				return fromToolMetadata;
			}
			const fromOutputText = languageFromLabelText(text) || languageFromPathText(text);
			if (fromOutputText) {
				return fromOutputText;
			}
			const trimmed = text.trimStart();
			if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
				return "json";
			}
			if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || trimmed.startsWith("<?xml")) {
				return "html";
			}
			if (/^\\s*#\\s+\\S/m.test(text)) {
				return "markdown";
			}
			return languageFromCodeText(text) || languageFromToolName(tool?.name || "");
		}

		function parseToolArgs(tool) {
			if (!tool?.args) {
				return undefined;
			}
			try {
				const parsed = JSON.parse(tool.args);
				return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
			} catch {
				return undefined;
			}
		}

		function readLineRange(args) {
			const offset = typeof args?.offset === "number" ? args.offset : undefined;
			const limit = typeof args?.limit === "number" ? args.limit : undefined;
			if (offset === undefined && limit === undefined) {
				return "";
			}
			const start = offset ?? 1;
			const end = limit === undefined ? "" : start + limit - 1;
			return ":" + start + (end ? "-" + end : "");
		}

		function limitSuffix(args) {
			return typeof args?.limit === "number" ? " (limit " + args.limit + ")" : "";
		}

		function pathArg(args) {
			return typeof args?.file_path === "string" ? args.file_path : typeof args?.path === "string" ? args.path : "";
		}

		function toolCallText(tool) {
			const args = parseToolArgs(tool);
			if (tool.name === "read") {
				const path = pathArg(args);
				return path ? "read " + path + readLineRange(args) : "read";
			}
			if (tool.name === "bash") {
				const command = typeof args?.command === "string" ? args.command : typeof tool.args === "string" ? tool.args : "";
				const firstLine = command.trim().split("\\n")[0] || "";
				return firstLine ? "$ " + firstLine : "$";
			}
			if (tool.name === "grep") {
				const pattern = typeof args?.pattern === "string" ? args.pattern : "";
				const path = pathArg(args) || ".";
				const glob = typeof args?.glob === "string" && args.glob ? " (" + args.glob + ")" : "";
				return "grep /" + pattern + "/ in " + path + glob + limitSuffix(args);
			}
			if (tool.name === "find") {
				const pattern = typeof args?.pattern === "string" ? args.pattern : "";
				const path = pathArg(args) || ".";
				return "find " + pattern + " in " + path + limitSuffix(args);
			}
			if (tool.name === "ls") {
				return "ls " + (pathArg(args) || ".") + limitSuffix(args);
			}
			if (tool.name === "write") {
				const path = pathArg(args);
				return path ? "write " + path : "write";
			}
			if (tool.name === "edit") {
				const path = pathArg(args);
				return path ? "edit " + path : "edit";
			}
			return tool.title || tool.name;
		}

		function upgradeCodeBlock(pre, code, language) {
			if ((language || "").toLowerCase() === "grep") {
				pre.classList.add("code-highlight-fallback");
				return;
			}
			const existingClasses = Array.from(pre.classList);
			const render = shouldRenderAsDiff(code) || ["diff", "patch"].includes((language || "").toLowerCase())
				? (highlighter) => highlighter.highlightDiff(code, isDarkTheme())
				: (highlighter) => highlighter.highlight(code, language || "", isDarkTheme());
			void loadShikiHighlighter()
				.then(render)
				.then((html) => {
					const template = document.createElement("template");
					template.innerHTML = html.trim();
					const highlighted = template.content.firstElementChild;
					if (!(highlighted instanceof HTMLElement) || highlighted.tagName !== "PRE") {
						return;
					}
					highlighted.classList.add("shiki-code-block");
					for (const className of existingClasses) {
						highlighted.classList.add(className);
					}
					highlighted.classList.remove("tool-output");
					highlighted.classList.add("tool-code-output");
					applyDiffLineClasses(highlighted);
					normalizeShikiLineLayout(highlighted);
					normalizeShikiTokenStyles(highlighted);
					pre.replaceWith(highlighted);
					if (!highlighted.classList.contains("shiki-diff")) {
						renderCodeCanvas(highlighted);
					}
				})
				.catch(() => {
					pre.classList.add("code-highlight-fallback");
				});
		}

		function appendCodeBlock(parent, code, language) {
			if (!code.trim()) {
				return;
			}
			if (language) {
				const header = document.createElement("div");
				header.className = "code-header";
				const label = document.createElement("span");
				label.textContent = language;
				header.appendChild(label);
				const copy = document.createElement("button");
				copy.type = "button";
				copy.className = "copy-code";
				copy.textContent = "Copy";
				copy.addEventListener("click", async () => {
					try {
						await navigator.clipboard.writeText(code);
						copy.textContent = "Copied";
						setTimeout(() => {
							copy.textContent = "Copy";
						}, 1200);
					} catch {
						copy.textContent = "Failed";
						setTimeout(() => {
							copy.textContent = "Copy";
						}, 1200);
					}
				});
				header.appendChild(copy);
				parent.appendChild(header);
			}
			const pre = document.createElement("pre");
			const codeEl = document.createElement("code");
			appendHighlightedCode(codeEl, code, language);
			pre.appendChild(codeEl);
			parent.appendChild(pre);
			upgradeCodeBlock(pre, code, language);
		}

		function appendFileLink(parent, text, path, line, character) {
			const link = document.createElement("a");
			link.href = "#";
			link.className = "file-link";
			link.textContent = text;
			link.addEventListener("click", (event) => {
				event.preventDefault();
				vscode.postMessage({ type: "openFile", path, line, character });
			});
			parent.appendChild(link);
		}

		function inlineCodeClassName(text) {
			if (/^@[A-Za-z0-9._-]+\\/[A-Za-z0-9._-]+$/.test(text)) {
				return "inline-code inline-code-package";
			}
			if (/^(?:pi|editor|view)\\.[A-Za-z0-9_.\\/-]+$/.test(text)) {
				return "inline-code inline-code-key";
			}
			if (/^["'].*["']$/.test(text)) {
				return "inline-code inline-code-string";
			}
			if (/^v?\\d+\\.\\d+\\.\\d+(?:[-+][A-Za-z0-9._-]+)?$/.test(text)) {
				return "inline-code inline-code-version";
			}
			if (/^(?:\\.{1,2}[\\/\\\\]|[A-Za-z]:[\\/\\\\]|[\\/\\\\])|[\\/\\\\]/.test(text)) {
				return "inline-code inline-code-path";
			}
			return "inline-code";
		}

		function appendInlineCode(parent, text) {
			const code = document.createElement("code");
			code.className = inlineCodeClassName(text);
			code.textContent = text;
			parent.appendChild(code);
		}

		function shouldRenderInlineCodeToken(text) {
			return (
				/^@[A-Za-z0-9._-]+\\/[A-Za-z0-9._-]+$/.test(text) ||
				/^(?:pi|editor|view)\\.[A-Za-z0-9_.\\/-]+$/.test(text) ||
				/^v?\\d+\\.\\d+\\.\\d+(?:[-+][A-Za-z0-9._-]+)?$/.test(text)
			);
		}

		function appendInline(parent, text) {
			const pattern = /(\\\`[^\\\`]+\\\`|\\[[^\\]\\n]+\\]\\((https?:\\/\\/[^)\\s]+)\\)|@[A-Za-z0-9._-]+\\/[A-Za-z0-9._-]+|(?:pi|editor|view)\\.[A-Za-z0-9_.\\/-]+|v?\\d+\\.\\d+\\.\\d+(?:[-+][A-Za-z0-9._-]+)?|(?:\\.{1,2}\\/|\\/)?(?:[A-Za-z0-9_.@()-]+\\/)*[A-Za-z0-9_.@()-]+\\.[A-Za-z0-9]+(?::[0-9]+){0,2})/g;
			let offset = 0;
			for (const match of text.matchAll(pattern)) {
				const value = match[0];
				const index = match.index || 0;
				if (index > offset) {
					parent.appendChild(document.createTextNode(text.slice(offset, index)));
				}

				if (value.startsWith("\`") && value.endsWith("\`")) {
					appendInlineCode(parent, value.slice(1, -1));
				} else if (value.startsWith("[")) {
					const closeLabel = value.indexOf("](");
					const link = document.createElement("a");
					link.href = value.slice(closeLabel + 2, -1);
					link.textContent = value.slice(1, closeLabel);
					parent.appendChild(link);
				} else if (shouldRenderInlineCodeToken(value)) {
					appendInlineCode(parent, value);
				} else {
					const parts = value.split(":");
					const path = parts[0];
					const line = parts.length > 1 ? Number(parts[1]) : undefined;
					const character = parts.length > 2 ? Number(parts[2]) : undefined;
					appendFileLink(parent, value, path, line, character);
				}
				offset = index + value.length;
			}
			if (offset < text.length) {
				parent.appendChild(document.createTextNode(text.slice(offset)));
			}
		}

		function isBlockStart(line) {
			return (
				/^#{1,4}\\s+/.test(line) ||
				/^([-*_])\\s*\\1\\s*\\1\\s*$/.test(line) ||
				/^\\s*>\\s?/.test(line) ||
				/^\\s*([-*+])\\s+/.test(line) ||
				/^\\s*\\d+\\.\\s+/.test(line) ||
				line.startsWith(String.fromCharCode(96, 96, 96))
			);
		}

		function appendMarkdown(parent, text) {
			const root = document.createElement("div");
			root.className = "message-content";
			const lines = text.split("\\n");
			let index = 0;

			while (index < lines.length) {
				const line = lines[index];
				if (!line.trim()) {
					index++;
					continue;
				}

				const fencePrefix = String.fromCharCode(96, 96, 96);
				const fence = line.startsWith(fencePrefix) ? line.slice(fencePrefix.length).trim().match(/^(\\S*)/) : null;
				if (fence) {
					index++;
					const codeLines = [];
					while (index < lines.length && lines[index].trim() !== fencePrefix) {
						codeLines.push(lines[index]);
						index++;
					}
					if (index < lines.length) index++;
					appendCodeBlock(root, codeLines.join("\\n"), fence[1] || "");
					continue;
				}

				const heading = line.match(/^(#{1,4})\\s+(.+)$/);
				if (heading) {
					const headingEl = document.createElement("h".concat(String(Math.min(heading[1].length, 4))));
					appendInline(headingEl, heading[2]);
					root.appendChild(headingEl);
					index++;
					continue;
				}

				if (/^([-*_])\\s*\\1\\s*\\1\\s*$/.test(line)) {
					root.appendChild(document.createElement("hr"));
					index++;
					continue;
				}

				if (/^\\s*>\\s?/.test(line)) {
					const quote = document.createElement("blockquote");
					const quoteLines = [];
					while (index < lines.length && /^\\s*>\\s?/.test(lines[index])) {
						quoteLines.push(lines[index].replace(/^\\s*>\\s?/, ""));
						index++;
					}
					appendMarkdown(quote, quoteLines.join("\\n"));
					root.appendChild(quote);
					continue;
				}

				const unordered = line.match(/^\\s*([-*+])\\s+(.+)$/);
				const ordered = line.match(/^\\s*\\d+\\.\\s+(.+)$/);
				if (unordered || ordered) {
					const list = document.createElement(ordered ? "ol" : "ul");
					while (index < lines.length) {
						const item = ordered ? lines[index].match(/^\\s*\\d+\\.\\s+(.+)$/) : lines[index].match(/^\\s*[-*+]\\s+(.+)$/);
						if (!item) break;
						const li = document.createElement("li");
						appendInline(li, item[1]);
						list.appendChild(li);
						index++;
					}
					root.appendChild(list);
					continue;
				}

				const paragraphLines = [line];
				index++;
				while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
					paragraphLines.push(lines[index]);
					index++;
				}
				const paragraph = document.createElement("p");
				appendInline(paragraph, paragraphLines.join("\\n"));
				root.appendChild(paragraph);
			}

			parent.appendChild(root);
		}

		function stripAnsi(text) {
			return text.replace(/\\x1b(?:\\[[0-?]*[ -/]*[@-~]|\\][^\\x07]*(?:\\x07|\\x1b\\\\))/g, "");
		}

		function appendPre(parent, label, text, isOutput, language, options) {
			const cleanText = stripAnsi(text);
			const showLabel = !options?.hideLabel;
			const section = document.createElement(showLabel && cleanText.length > 1200 ? "details" : "div");
			section.className = "tool-section";
			if (showLabel && section.tagName === "DETAILS") {
				section.open = true;
				const summary = document.createElement("summary");
				summary.className = "tool-section-label";
				summary.textContent = label;
				section.appendChild(summary);
			} else if (showLabel) {
				appendText(section, "tool-section-label", label);
			}
			const pre = document.createElement("pre");
			pre.className = isOutput ? "tool-pre tool-output" : "tool-pre";
			if (language || shouldRenderAsDiff(cleanText)) {
				const resolvedLanguage = language || "diff";
				const codeEl = document.createElement("code");
				appendHighlightedCode(codeEl, cleanText, resolvedLanguage);
				pre.appendChild(codeEl);
				upgradeCodeBlock(pre, cleanText, resolvedLanguage);
			} else {
				pre.textContent = cleanText;
			}
			section.appendChild(pre);
			parent.appendChild(section);
		}

		function appendToolTextOutput(parent, text) {
			const section = document.createElement("div");
			section.className = "tool-section tool-text-output";
			for (const line of text.split("\\n")) {
				const lineEl = document.createElement("div");
				lineEl.className = "tool-output-line";
				if (line) {
					appendInline(lineEl, line);
				} else {
					lineEl.textContent = " ";
				}
				section.appendChild(lineEl);
			}
			parent.appendChild(section);
		}

		function appendToolResult(parent, text) {
			const result = document.createElement("div");
			result.className = "tool-result";
			appendInline(result, text);
			parent.appendChild(result);
		}

		function shouldRenderResultLine(tool, output) {
			return (
				["write", "edit", "vscode_apply_edits", "vscode_write_file"].includes(tool.name) &&
				/^Successfully\\b/.test(output.trim())
			);
		}

		function renderToolOutput(el, tool, output) {
			const cleanOutput = stripAnsi(output);
			if (shouldRenderResultLine(tool, cleanOutput)) {
				appendToolResult(el, cleanOutput);
				return;
			}
			if (tool.name === "find" || tool.name === "ls") {
				appendToolTextOutput(el, cleanOutput);
				return;
			}
			if (tool.name === "grep") {
				appendPre(el, "Output", cleanOutput, true, "grep", { hideLabel: true });
				return;
			}
			if (tool.name === "bash") {
				appendPre(el, "Output", cleanOutput, true, "", { hideLabel: true });
				return;
			}
			const language = inferCodeLanguage(cleanOutput, tool);
			appendPre(el, "Output", cleanOutput, true, language, {
				hideLabel: tool.name === "read" && Boolean(language),
			});
		}

		function renderToolMessage(el, message) {
			const tool = message.tool;
			const output = typeof tool.output === "string" ? tool.output.trimEnd() : "";
			el.classList.add("tool-".concat(tool.status));
			const header = document.createElement("div");
			header.className = "tool-header";
			appendText(header, "tool-name", toolCallText(tool));
			appendText(header, "tool-status", tool.status);
			el.appendChild(header);
			if (tool.title && tool.title !== toolCallText(tool)) {
				const title = document.createElement("div");
				title.className = "tool-title";
				appendMarkdown(title, tool.title);
				el.appendChild(title);
			}
			if (output.trim()) {
				renderToolOutput(el, tool, output);
			}
			if (!output.trim() && message.text && message.text.trim() !== tool.name.concat(":")) {
				const title = document.createElement("div");
				title.className = "tool-title";
				appendMarkdown(title, message.text);
				el.appendChild(title);
			}
		}

		function removeMessage(id) {
			const el = messageEls.get(id);
			if (el) el.remove();
			messageEls.delete(id);
			messageData.delete(id);
			updateEmptyState();
		}

		function shouldHideMessage(message) {
			return message.role === "assistant" && !message.working && !message.tool && !(message.text || "").trim();
		}

		function renderMessage(message) {
			if (shouldHideMessage(message)) {
				removeMessage(message.id);
				return;
			}
			messageData.set(message.id, message);
			let el = messageEls.get(message.id);
			if (!el) {
				el = document.createElement("div");
				messagesEl.appendChild(el);
				messageEls.set(message.id, el);
			}
			el.dataset.role = message.role;
			el.className = ["message", message.role].join(" ");
			el.textContent = "";
			if (message.tool) {
				renderToolMessage(el, message);
			} else {
				appendMarkdown(el, message.text || (message.working ? "..." : ""));
			}
			messagesEl.scrollTop = messagesEl.scrollHeight;
			updateEmptyState();
		}

		function approvalButton(id, action, label, className) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = className;
			button.textContent = label;
			button.addEventListener("click", () => vscode.postMessage({ type: "approvalResponse", id, action }));
			return button;
		}

		function renderApproval(approval) {
			let el = approvalEls.get(approval.id);
			if (!el) {
				el = document.createElement("div");
				el.className = "approval";
				approvalsEl.appendChild(el);
				approvalEls.set(approval.id, el);
			}

			el.textContent = "";
			const text = document.createElement("div");
			text.className = "approval-text";
			text.textContent = approval.text;
			el.appendChild(text);
			if (approval.detail) {
				const detail = document.createElement("div");
				detail.className = "approval-detail";
				detail.textContent = approval.detail;
				el.appendChild(detail);
			}
			const actions = document.createElement("div");
			actions.className = "approval-actions";
			actions.appendChild(approvalButton(approval.id, "review", "Review", "secondary"));
			actions.appendChild(approvalButton(approval.id, "apply", "Apply", "primary"));
			actions.appendChild(approvalButton(approval.id, "reject", "Reject", "secondary"));
			el.appendChild(actions);
			updateApprovalBatch();
		}

		function removeApproval(id) {
			const el = approvalEls.get(id);
			if (!el) return;
			el.remove();
			approvalEls.delete(id);
			updateApprovalBatch();
		}

		function updateApprovalBatch() {
			approvalBatchEl.hidden = approvalEls.size <= 1;
		}

		function setRunning(value) {
			running = value;
			sendEl.disabled = value;
			sendEl.hidden = value;
			stopEl.disabled = !value;
			stopEl.hidden = !value;
		}

		function setModelStatus(modelStatus) {
			const label = modelStatus ? modelStatus.label : "Models";
			modelStatusEl.textContent = label;
			modelStatusEl.title = modelStatus ? modelStatus.detail : "No model selected";
		}

		function setPermissionMode(permissionMode) {
			permissionModeValue = permissionMode;
			const option = permissionModeOptions.find((candidate) => candidate.value === permissionMode);
			modeLabelEl.textContent = option ? option.label : "Code";
		}

		function setApprovalMode(approvalMode) {
			approvalModeValue = approvalMode;
			const option = approvalModeOptions.find((candidate) => candidate.value === approvalMode);
			approvalModeLabelEl.textContent = option ? option.label : "Default";
		}

		function updateEmptyState() {
			emptyStateEl.hidden = messageEls.size > 0;
		}

		function setSessionPanelOpen(open) {
			sessionPanelEl.hidden = !open;
			if (open) closeSelectMenu();
			if (open) {
				sessionSearchEl.focus();
				sessionSearchEl.select();
			}
		}

		function closeSelectMenu() {
			openSelectKind = "";
			selectMenuEl.hidden = true;
			modeEl.setAttribute("aria-expanded", "false");
			approvalModeEl.setAttribute("aria-expanded", "false");
		}

		function openSelectMenu(kind, anchor, title, icon, options, value, onSelect) {
			if (openSelectKind === kind && !selectMenuEl.hidden) {
				closeSelectMenu();
				return;
			}
			setSessionPanelOpen(false);
			openSelectKind = kind;
			selectMenuEl.textContent = "";
			const header = document.createElement("div");
			header.className = "select-menu-header";
			const headerIcon = document.createElement("span");
			headerIcon.className = "select-menu-icon";
			headerIcon.textContent = icon;
			const headerText = document.createElement("span");
			headerText.textContent = title;
			header.appendChild(headerIcon);
			header.appendChild(headerText);
			selectMenuEl.appendChild(header);
			for (const option of options) {
				const item = document.createElement("button");
				item.type = "button";
				item.className = ["select-option", option.value === value ? "active" : ""].filter(Boolean).join(" ");
				const optionIcon = document.createElement("span");
				optionIcon.className = "select-menu-icon";
				optionIcon.textContent = icon;
				const optionLabel = document.createElement("span");
				optionLabel.className = "select-option-label";
				optionLabel.textContent = option.label;
				const optionText = document.createElement("span");
				optionText.className = "select-option-text";
				optionText.appendChild(optionLabel);
				if (option.description) {
					const description = document.createElement("span");
					description.className = "select-option-description";
					description.textContent = option.description;
					optionText.appendChild(description);
				}
				item.appendChild(optionIcon);
				item.appendChild(optionText);
				item.addEventListener("click", () => {
					closeSelectMenu();
					onSelect(option.value);
				});
				selectMenuEl.appendChild(item);
			}
			const anchorRect = anchor.getBoundingClientRect();
			const composerRect = selectMenuEl.parentElement.getBoundingClientRect();
			selectMenuEl.hidden = false;
			const menuWidth = Math.min(280, window.innerWidth - 24);
			selectMenuEl.style.width = String(menuWidth).concat("px");
			selectMenuEl.style.left = String(Math.max(0, anchorRect.left - composerRect.left)).concat("px");
			selectMenuEl.style.bottom = String(composerRect.bottom - anchorRect.top + 8).concat("px");
			const overflow = selectMenuEl.getBoundingClientRect().right - (window.innerWidth - 12);
			if (overflow > 0) {
				selectMenuEl.style.left = String(Math.max(0, anchorRect.left - composerRect.left - overflow)).concat("px");
			}
			anchor.setAttribute("aria-expanded", "true");
			selectMenuEl.querySelector(".select-option.active, .select-option")?.focus();
		}

		function renderSessionList() {
			sessionListEl.textContent = "";
			const query = sessionSearchEl.value.trim().toLowerCase();
			const sessions = query
				? sessionsState.filter((session) =>
						[session.label, session.detail].some((value) => value.toLowerCase().includes(query)),
					)
				: sessionsState;
			if (sessions.length === 0) {
				const empty = document.createElement("div");
				empty.className = "session-empty";
				empty.textContent = query ? "No matching chats" : "No chat history";
				sessionListEl.appendChild(empty);
				return;
			}
			for (const session of sessions) {
				const item = document.createElement("button");
				item.type = "button";
				item.className = ["session-item", session.path === activeSessionPath ? "active" : ""]
					.filter(Boolean)
					.join(" ");
				item.title = session.detail;
				const title = document.createElement("div");
				title.className = "session-item-title";
				title.textContent = session.active ? "Current: ".concat(session.label) : session.label;
				const detail = document.createElement("div");
				detail.className = "session-item-detail";
				detail.textContent = session.detail;
				item.appendChild(title);
				item.appendChild(detail);
				item.addEventListener("click", () => {
					setSessionPanelOpen(false);
					if (session.path && session.path !== activeSessionPath) {
						vscode.postMessage({ type: "switchSession", path: session.path });
					}
				});
				sessionListEl.appendChild(item);
			}
		}

		function setSessions(sessions, activePath) {
			activeSessionPath = activePath || "";
			sessionsState = Array.isArray(sessions) ? sessions : [];
			renderSessionList();
		}

		function setState(state) {
			messagesEl.textContent = "";
			approvalsEl.textContent = "";
			messageEls.clear();
			messageData.clear();
			approvalEls.clear();
			for (const message of state.messages) renderMessage(message);
			for (const approval of state.approvals) renderApproval(approval);
			updateApprovalBatch();
			updateEmptyState();
			setPermissionMode(state.permissionMode);
			setApprovalMode(state.approvalMode);
			setModelStatus(state.modelStatus);
			setSessions(state.sessions, state.activeSessionPath);
			setRunning(state.running);
		}

		function send() {
			const text = inputEl.value.trim();
			if (!text || running) return;
			inputEl.value = "";
			vscode.postMessage({ type: "send", text });
		}

		sendEl.addEventListener("click", send);
		stopEl.addEventListener("click", () => vscode.postMessage({ type: "stop" }));
		newEl.addEventListener("click", () => vscode.postMessage({ type: "new" }));
		reviewAllEl.addEventListener("click", () => vscode.postMessage({ type: "approvalBatchResponse", action: "review" }));
		applyAllEl.addEventListener("click", () => vscode.postMessage({ type: "approvalBatchResponse", action: "apply" }));
		rejectAllEl.addEventListener("click", () => vscode.postMessage({ type: "approvalBatchResponse", action: "reject" }));
		modeEl.addEventListener("click", () =>
			openSelectMenu("mode", modeEl, "Agent", "◇", permissionModeOptions, permissionModeValue, (permissionMode) => {
				setPermissionMode(permissionMode);
				vscode.postMessage({ type: "setPermissionMode", permissionMode });
			}),
		);
		approvalModeEl.addEventListener("click", () =>
			openSelectMenu(
				"approval",
				approvalModeEl,
				"Permissions",
				"◇",
				approvalModeOptions,
				approvalModeValue,
				(approvalMode) => {
					setApprovalMode(approvalMode);
					vscode.postMessage({ type: "setApprovalMode", approvalMode });
				},
			),
		);
		sessionPanelCloseEl.addEventListener("click", () => setSessionPanelOpen(false));
		sessionSearchEl.addEventListener("input", renderSessionList);
		sessionSearchEl.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				setSessionPanelOpen(false);
				sessionHistoryEl.focus();
			}
		});
		selectMenuEl.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				const kind = openSelectKind;
				closeSelectMenu();
				(kind === "approval" ? approvalModeEl : modeEl).focus();
			}
		});
		document.addEventListener("click", (event) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (!selectMenuEl.hidden && !selectMenuEl.contains(target) && !modeEl.contains(target) && !approvalModeEl.contains(target)) {
				closeSelectMenu();
			}
			if (
				!sessionPanelEl.hidden &&
				!sessionPanelEl.contains(target)
			) {
				setSessionPanelOpen(false);
			}
		});
		window.addEventListener("resize", () => {
			closeSelectMenu();
			setSessionPanelOpen(false);
		});
		inputEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				send();
			}
		});

		window.addEventListener("message", (event) => {
			const message = event.data;
			if (message.type === "state") {
				setState(message);
			} else if (message.type === "append") {
				renderMessage(message.message);
			} else if (message.type === "appendDelta") {
				const existing = messageData.get(message.id);
				if (existing) {
					existing.text += message.delta;
					renderMessage(existing);
				}
				messagesEl.scrollTop = messagesEl.scrollHeight;
			} else if (message.type === "replace") {
				const el = messageEls.get(message.id);
				const role = message.role || (el ? el.dataset.role : undefined) || "assistant";
				renderMessage({
					id: message.id,
					role,
					text: message.text || "",
					working: message.working,
					tool: message.tool,
				});
			} else if (message.type === "running") {
				setRunning(message.running);
			} else if (message.type === "modelStatus") {
				setModelStatus(message.modelStatus);
			} else if (message.type === "sessions") {
				setSessions(message.sessions, message.activeSessionPath);
			} else if (message.type === "approvalRequested") {
				renderApproval(message.approval);
			} else if (message.type === "approvalResolved") {
				removeApproval(message.id);
			} else if (message.type === "prefill") {
				inputEl.value = message.text;
				inputEl.focus();
			} else if (message.type === "toggleSessionHistory") {
				setSessionPanelOpen(sessionPanelEl.hidden);
			}
		});

		vscode.postMessage({ type: "ready" });`;
}
