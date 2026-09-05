export function getWebviewScript(
	highlighterScriptUri: string,
	mermaidScriptUri: string,
	scriptNonce: string,
	styleNonce: string,
	avatarUri: string,
): string {
	return `			const vscode = acquireVsCodeApi();
		const assistantAvatarUri = ${JSON.stringify(avatarUri)};
		let nextRequestId = 0;
		const requestTimeoutMs = 60000;
		const pendingRequests = new Map();

		function call(method, params = {}) {
			const id = String(++nextRequestId);
			return new Promise((resolve, reject) => {
				const timeoutId = window.setTimeout(() => {
					pendingRequests.delete(id);
					reject(new Error("Pi request timed out."));
				}, requestTimeoutMs);
				pendingRequests.set(id, { resolve, reject, timeoutId });
				try {
					vscode.postMessage({ kind: "request", id, request: { method, params } });
				} catch (error) {
					window.clearTimeout(timeoutId);
					pendingRequests.delete(id);
					reject(error);
				}
			});
		}

		function notify(method, params) {
			void call(method, params).catch((error) => console.error("Pi request failed:", error));
		}

		const shikiScriptUri = ${JSON.stringify(highlighterScriptUri)};
		const shikiScriptNonce = ${JSON.stringify(scriptNonce)};
		const mermaidScriptUri = ${JSON.stringify(mermaidScriptUri)};
		const mermaidStyleNonce = ${JSON.stringify(styleNonce)};
		// Mermaid creates its <style> element via document.createElement before we can
		// post-process the SVG, so stamp the style nonce on dynamically created styles.
		const originalCreateElement = document.createElement.bind(document);
		document.createElement = function (tagName, options) {
			const element = originalCreateElement(tagName, options);
			if (String(tagName).toLowerCase() === "style") {
				element.nonce = mermaidStyleNonce;
			}
			return element;
		};
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
		const completionMenuEl = document.getElementById("completionMenu");
		const completionMenuBodyEl = document.getElementById("completionMenuBody");
		const modelStatusEl = document.getElementById("modelStatus");
		const pendingQueueEl = document.getElementById("pendingQueue");
		const runningHintEl = document.getElementById("runningHint");
		const sessionTimeEl = document.getElementById("sessionTime");
		const composerResizeEl = document.getElementById("composerResize");
		const codeBlockPreviewLines = 24;
		const toolOutputPreviewHeadLines = 20;
		const toolOutputPreviewTailLines = 0;
		const toolOutputPreviewMaxChars = 120000;
		const messageEls = new Map();
		const messageData = new Map();
		const approvalEls = new Map();
		const approvalData = new Map();
		const reviewedApprovalIds = new Set();
		let running = false;
		let permissionModeValue = "code";
		let approvalModeValue = "ask";
		let openSelectKind = "";
		let completion = null;
		let completionItems = [];
		let completionActiveIndex = 0;
		let slashCommandsCache;
		let fileQueryTimer = null;
		let completionRequestSeq = 0;
		let imeComposing = false;
		let highlighterLoadPromise;
		let mermaidLoadPromise;
		let userPromptHistory = [];
		let promptHistoryCursor;
		let draftBeforePromptHistory = "";
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

		function getPiMermaid() {
			return window.piMermaid;
		}

		function loadMermaidRenderer() {
			const existing = getPiMermaid();
			if (existing) {
				return Promise.resolve(existing);
			}
			mermaidLoadPromise ||= new Promise((resolve, reject) => {
				const script = document.createElement("script");
				script.src = mermaidScriptUri;
				script.nonce = shikiScriptNonce;
				script.addEventListener("load", () => {
					const loaded = getPiMermaid();
					if (loaded) {
						resolve(loaded);
					} else {
						reject(new Error("Mermaid renderer did not initialize."));
					}
				});
				script.addEventListener("error", () => reject(new Error("Failed to load Mermaid renderer.")));
				document.head.appendChild(script);
			});
			return mermaidLoadPromise;
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
				return false;
			}
			const lineEls = Array.from(code.querySelectorAll(".line"));
			if (lineEls.length === 0) {
				return false;
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
				return false;
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
				return false;
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
			return true;
		}

		function renderCodeCanvas(pre) {
			const code = pre.querySelector("code");
			if (!code || pre.querySelector("canvas.code-canvas")) {
				return;
			}
			const canvas = document.createElement("canvas");
			canvas.className = "code-canvas";
			pre.classList.add("canvas-code-block");
			pre.appendChild(canvas);
			requestAnimationFrame(() => {
				if (drawCodeCanvas(pre, canvas)) {
					code.classList.add("canvas-code-source");
				} else {
					canvas.remove();
					pre.classList.remove("canvas-code-block");
				}
			});
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
				return;
			}
			try {
				const parsed = JSON.parse(tool.args);
				return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
			} catch {
				return;
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

		function setupMermaidPanZoom(container, diagram) {
			const minScale = 0.2;
			const maxScale = 8;
			let scale = 1;
			let translateX = 0;
			let translateY = 0;
			let dragPointerId = -1;
			let dragStartX = 0;
			let dragStartY = 0;
			let panStartX = 0;
			let panStartY = 0;

			function applyTransform() {
				diagram.style.transform = "translate(" + translateX + "px, " + translateY + "px) scale(" + scale + ")";
			}

			function setScale(nextScale, focusX, focusY) {
				const bounded = Math.min(maxScale, Math.max(minScale, nextScale));
				const ratio = bounded / scale;
				translateX = focusX - (focusX - translateX) * ratio;
				translateY = focusY - (focusY - translateY) * ratio;
				scale = bounded;
				applyTransform();
			}

			function zoomFromCenter(nextScale) {
				setScale(nextScale, container.clientWidth / 2, container.clientHeight / 2);
			}

			container.addEventListener("wheel", (event) => {
				event.preventDefault();
				const rect = container.getBoundingClientRect();
				const zoomFactor = Math.exp(-event.deltaY * 0.0015);
				setScale(scale * zoomFactor, event.clientX - rect.left, event.clientY - rect.top);
			}, { passive: false });

			container.addEventListener("pointerdown", (event) => {
				if (event.button !== 0 || dragPointerId !== -1) {
					return;
				}
				dragPointerId = event.pointerId;
				dragStartX = event.clientX;
				dragStartY = event.clientY;
				panStartX = translateX;
				panStartY = translateY;
				container.setPointerCapture(event.pointerId);
				container.classList.add("mermaid-panning");
				event.preventDefault();
			});

			container.addEventListener("pointermove", (event) => {
				if (event.pointerId !== dragPointerId) {
					return;
				}
				translateX = panStartX + (event.clientX - dragStartX);
				translateY = panStartY + (event.clientY - dragStartY);
				applyTransform();
			});

			function endDrag(event) {
				if (event.pointerId !== dragPointerId) {
					return;
				}
				dragPointerId = -1;
				container.classList.remove("mermaid-panning");
				const moved = Math.abs(event.clientX - dragStartX) > 2 || Math.abs(event.clientY - dragStartY) > 2;
				if (moved) {
					const swallowClick = (click) => {
						click.preventDefault();
						click.stopPropagation();
					};
					document.addEventListener("click", swallowClick, { capture: true, once: true });
					window.setTimeout(() => document.removeEventListener("click", swallowClick, true), 0);
				}
			}
			container.addEventListener("pointerup", endDrag);
			container.addEventListener("pointercancel", endDrag);

			const controls = document.createElement("div");
			controls.className = "mermaid-zoom-controls";
			controls.addEventListener("pointerdown", (event) => event.stopPropagation());
			function appendZoomButton(label, title, onClick) {
				const button = document.createElement("button");
				button.type = "button";
				button.className = "mermaid-zoom-button";
				button.textContent = label;
				button.title = title;
				button.addEventListener("click", onClick);
				controls.appendChild(button);
			}
			appendZoomButton("-", "Zoom out", () => zoomFromCenter(scale / 1.25));
			appendZoomButton("+", "Zoom in", () => zoomFromCenter(scale * 1.25));
			appendZoomButton("Reset", "Reset zoom", () => {
				scale = 1;
				translateX = 0;
				translateY = 0;
				applyTransform();
			});
			container.appendChild(controls);
		}

		function upgradeCodeBlock(pre, code, language) {
			if ((language || "").toLowerCase() === "grep") {
				pre.classList.add("code-highlight-fallback");
				return;
			}
			if ((language || "").toLowerCase() === "mermaid") {
				const status = document.createElement("div");
				status.className = "mermaid-status";
				status.textContent = "Rendering mermaid...";
				pre.replaceWith(status);
				void loadMermaidRenderer()
					.then((renderer) => renderer.render(code, isDarkTheme()))
					.then((svg) => {
						const template = document.createElement("template");
						template.innerHTML = svg.trim();
						const diagram = template.content.firstElementChild;
						if (!(diagram instanceof SVGElement) || diagram.tagName.toLowerCase() !== "svg") {
							status.textContent = "Mermaid rendering failed";
							status.classList.add("mermaid-status-error");
							return;
						}
						// The nonce value is hidden during serialization, so the SVG carries an
						// empty nonce and its <style> is blocked on insertion. Re-create the
						// styles in <head> with the real nonce; mermaid scopes all rules by the
						// unique diagram id, so hoisting is safe.
						for (const styleEl of Array.from(diagram.querySelectorAll("style"))) {
							const hoisted = document.createElement("style");
							hoisted.nonce = mermaidStyleNonce;
							hoisted.textContent = styleEl.textContent;
							document.head.appendChild(hoisted);
							styleEl.remove();
						}
						const container = document.createElement("div");
						container.className = "mermaid-diagram";
						container.appendChild(diagram);
						setupMermaidPanZoom(container, diagram);
						status.replaceWith(container);
					})
					.catch(() => {
						status.textContent = "Mermaid rendering failed";
						status.classList.add("mermaid-status-error");
					});
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

		function appendCodeBlock(parent, code, language, deferHighlight) {
			if (!code.trim()) {
				return;
			}
			const lineCount = code.split("\\n").length;
			const isLong = lineCount > codeBlockPreviewLines;
			const container = isLong ? document.createElement("details") : parent;
			if (isLong) {
				container.className = "code-section";
			}
			if (language || isLong) {
				const header = document.createElement("div");
				header.className = "code-header";
				const label = document.createElement("span");
				label.textContent = (language || "Code") + " · " + lineCount + " lines";
				header.appendChild(label);
				if (language) {
					const copy = document.createElement("button");
					copy.type = "button";
					copy.className = "copy-code";
					copy.textContent = "Copy";
					copy.addEventListener("click", async (event) => {
						event.preventDefault();
						event.stopPropagation();
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
				}
				if (isLong) {
					const summary = document.createElement("summary");
					summary.appendChild(header);
					container.appendChild(summary);
				} else {
					container.appendChild(header);
				}
			}
			const pre = document.createElement("pre");
			const codeEl = document.createElement("code");
			appendHighlightedCode(codeEl, code, language);
			pre.appendChild(codeEl);
			container.appendChild(pre);
			if (!deferHighlight) {
				upgradeCodeBlock(pre, code, language);
			}
			if (isLong) {
				parent.appendChild(container);
			}
		}

		function appendFileLink(parent, text, path, line, character) {
			const link = document.createElement("a");
			link.href = "#";
			link.className = "file-link";
			link.textContent = text;
			link.addEventListener("click", (event) => {
				event.preventDefault();
				notify("openFile", { path, line, character });
			});
			parent.appendChild(link);
		}

		function inlineCodeClassName(text) {
			if (/^@[A-Za-z0-9._-]+\\/[A-Za-z0-9_-]+$/.test(text)) {
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
				/^@[A-Za-z0-9._-]+\\/[A-Za-z0-9_-]+$/.test(text) ||
				/^(?:pi|editor|view)\\.[A-Za-z0-9_.\\/-]+$/.test(text) ||
				/^v?\\d+\\.\\d+\\.\\d+(?:[-+][A-Za-z0-9._-]+)?$/.test(text)
			);
		}

		function appendInline(parent, text) {
			const pattern = /(\\\`[^\\\`]+\\\`|\\[[^\\]\\n]+\\]\\((https?:\\/\\/[^)\\s]+)\\)|\\*\\*[^*\\n]+\\*\\*|\\*[^*\\n]+\\*|@[A-Za-z0-9._-]+\\/[A-Za-z0-9_-]+(?![\\/A-Za-z0-9._-])|(?:pi|editor|view)\\.[A-Za-z0-9_.\\/-]+|v?\\d+\\.\\d+\\.\\d+(?:[-+][A-Za-z0-9._-]+)?|(?:\\.{1,2}\\/|\\/)?(?:[A-Za-z0-9_.@()-]+\\/)*[A-Za-z0-9_.@()-]+\\.[A-Za-z0-9]+(?::[0-9]+){0,2})/g;
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
				} else if (value.startsWith("**")) {
					const strong = document.createElement("strong");
					appendInline(strong, value.slice(2, -2));
					parent.appendChild(strong);
				} else if (value.startsWith("*")) {
					const em = document.createElement("em");
					appendInline(em, value.slice(1, -1));
					parent.appendChild(em);
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

		function appendMarkdown(parent, text, streaming) {
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
					appendCodeBlock(root, codeLines.join("\\n"), fence[1] || "", streaming);
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
					appendMarkdown(quote, quoteLines.join("\\n"), streaming);
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
			const preview = options?.preview;
			const initialText = preview?.text || cleanText;
			const showLabel = !options?.hideLabel;
			const isLong = cleanText.split("\\n").length > codeBlockPreviewLines || Boolean(preview?.isTruncated);
			const section = document.createElement(showLabel && isLong ? "details" : "div");
			section.className = "tool-section";
			if (showLabel && section.tagName === "DETAILS") {
				const summary = document.createElement("summary");
				summary.className = "tool-section-label";
				summary.textContent = label;
				section.appendChild(summary);
			} else if (showLabel) {
				appendText(section, "tool-section-label", label);
			}
			const pre = document.createElement("pre");
			pre.className = isOutput ? "tool-pre tool-output" : "tool-pre";
			if (language || shouldRenderAsDiff(initialText)) {
				const resolvedLanguage = language || "diff";
				const codeEl = document.createElement("code");
				appendHighlightedCode(codeEl, initialText, resolvedLanguage);
				pre.appendChild(codeEl);
				if (!options?.skipShiki) {
					upgradeCodeBlock(pre, initialText, resolvedLanguage);
				}
			} else {
				pre.textContent = initialText;
			}
			section.appendChild(pre);
			if (preview?.isTruncated) {
				const toggle = document.createElement("button");
				toggle.type = "button";
				toggle.className = "secondary";
				toggle.textContent = preview.hiddenLines > 0
					? "Show full output (" + preview.hiddenLines + " lines hidden)"
					: "Show full output";
				toggle.addEventListener("click", () => {
					toggle.remove();
					pre.textContent = "";
					if (language || shouldRenderAsDiff(cleanText)) {
						const resolvedLanguage = language || "diff";
						const codeEl = document.createElement("code");
						appendHighlightedCode(codeEl, cleanText, resolvedLanguage);
						pre.appendChild(codeEl);
					} else {
						pre.textContent = cleanText;
					}
				});
				section.appendChild(toggle);
			}
			parent.appendChild(section);
		}

		function createToolOutputPreview(text) {
			if (!text) {
				return { text: "", isTruncated: false, hiddenLines: 0 };
			}
			const lines = text.split("\\n");
			if (lines.length <= toolOutputPreviewHeadLines + toolOutputPreviewTailLines && text.length <= toolOutputPreviewMaxChars) {
				return { text, isTruncated: false, hiddenLines: 0 };
			}

			const head = lines.slice(0, toolOutputPreviewHeadLines);
			const tail = toolOutputPreviewTailLines > 0 ? lines.slice(-toolOutputPreviewTailLines) : [];
			const hiddenLines = Math.max(0, lines.length - head.length - tail.length);
			const marker = "... (" + hiddenLines + " lines omitted) ...";
			let previewText = head.concat(hiddenLines > 0 ? [marker] : [], tail).join("\\n");

			if (previewText.length > toolOutputPreviewMaxChars) {
				previewText = previewText.slice(0, toolOutputPreviewMaxChars).trimEnd().concat("\\n... (output truncated) ...");
			}

			return {
				text: previewText,
				isTruncated: true,
				hiddenLines,
			};
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
				[
					"write",
					"edit",
					"vscode_apply_edits",
					"vscode_write_file",
					"vscode_delete_file",
					"vscode_delete_directory",
					"vscode_rename_symbol",
				].includes(tool.name) && /^(Successfully|Moved|Renamed)\\b/.test(output.trim())
			);
		}

		function renderToolOutput(el, tool, output) {
			const cleanOutput = stripAnsi(output);
			const preview = ["read", "grep", "bash"].includes(tool.name) ? createToolOutputPreview(cleanOutput) : undefined;
			if (shouldRenderResultLine(tool, cleanOutput)) {
				appendToolResult(el, cleanOutput);
				return;
			}
			if (tool.name === "find" || tool.name === "ls") {
				appendToolTextOutput(el, cleanOutput);
				return;
			}
			if (tool.name === "grep") {
				appendPre(el, "Output", cleanOutput, true, "grep", {
					hideLabel: true,
					preview,
					skipShiki: Boolean(preview?.isTruncated),
				});
				return;
			}
			if (tool.name === "bash") {
				appendPre(el, "Output", cleanOutput, true, "", {
					hideLabel: true,
					preview,
					skipShiki: Boolean(preview?.isTruncated),
				});
				return;
			}
			const language = inferCodeLanguage(cleanOutput, tool);
			appendPre(el, "Output", cleanOutput, true, language, {
				hideLabel: tool.name === "read" && Boolean(language),
				preview,
				skipShiki: Boolean(preview?.isTruncated),
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
			if (el) {
				el.classList.add("message-fade-out");
				setTimeout(() => el.remove(), 160);
			}
			messageEls.delete(id);
			messageData.delete(id);
			updateEmptyState();
		}

		function shouldHideMessage(message) {
			return message.role === "assistant" && !message.working && !message.tool && !(message.text || "").trim();
		}

		function formatMessageTime(timestamp) {
			return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
		}

		function formatSessionTime(timestamp) {
			const date = new Date(timestamp);
			const pad = (value) => String(value).padStart(2, "0");
			return [
				date.getFullYear(),
				"-",
				pad(date.getMonth() + 1),
				"-",
				pad(date.getDate()),
				" ",
				pad(date.getHours()),
				":",
				pad(date.getMinutes()),
			].join("");
		}

		function updateSessionTime() {
			if (running || messageEls.size === 0) {
				sessionTimeEl.hidden = true;
				return;
			}
			let lastTimestamp;
			for (const message of messageData.values()) {
				if (message.timestamp && (lastTimestamp === undefined || message.timestamp > lastTimestamp)) {
					lastTimestamp = message.timestamp;
				}
			}
			sessionTimeEl.textContent = formatSessionTime(lastTimestamp ?? Date.now());
			sessionTimeEl.hidden = false;
		}

		const pendingRenderIds = new Set();
		let renderScheduled = false;

		function scheduleRender(id) {
			pendingRenderIds.add(id);
			if (renderScheduled) return;
			renderScheduled = true;
			requestAnimationFrame(() => {
				renderScheduled = false;
				const pinnedToBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 40;
				for (const pendingId of pendingRenderIds) {
					const message = messageData.get(pendingId);
					if (message) renderMessage(message);
				}
				pendingRenderIds.clear();
				if (pinnedToBottom) {
					messagesEl.scrollTop = messagesEl.scrollHeight;
				}
			});
		}

		const streamBuffers = new Map();
		let typewriterTimer = null;

		function enqueueDelta(id, delta) {
			streamBuffers.set(id, (streamBuffers.get(id) || "") + delta);
			if (typewriterTimer === null) {
				typewriterTimer = setInterval(flushTypewriter, 24);
			}
		}

		function flushTypewriter() {
			let active = false;
			for (const [id, buffer] of streamBuffers) {
				const message = messageData.get(id);
				if (!message || buffer.length === 0) {
					streamBuffers.delete(id);
					continue;
				}
				const chars = Math.max(2, Math.ceil(buffer.length / 10));
				message.text += buffer.slice(0, chars);
				const rest = buffer.slice(chars);
				if (rest) {
					streamBuffers.set(id, rest);
					active = true;
				} else {
					streamBuffers.delete(id);
				}
				scheduleRender(id);
			}
			if (!active && typewriterTimer !== null) {
				clearInterval(typewriterTimer);
				typewriterTimer = null;
			}
		}

		function dropStreamBuffer(id) {
			streamBuffers.delete(id);
			if (streamBuffers.size === 0 && typewriterTimer !== null) {
				clearInterval(typewriterTimer);
				typewriterTimer = null;
			}
		}

		function stripFileBlocks(text) {
			return text
				.replace(/<file name="[^"]+">[\\s\\S]*?<\\/file>/g, "")
				.replace(/\\n{3,}/g, "\\n\\n")
				.trim();
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
			if (message.role === "assistant" || (message.role === "error" && !message.tool)) {
				const header = document.createElement("div");
				header.className = "message-header";
				const avatar = document.createElement("img");
				avatar.className = "message-avatar";
				avatar.src = assistantAvatarUri;
				avatar.alt = "";
				const author = document.createElement("span");
				author.className = "message-author";
				author.textContent = "Pi";
				header.appendChild(avatar);
				header.appendChild(author);
				el.appendChild(header);
			}
			if (message.tool) {
				renderToolMessage(el, message);
			} else {
				const rawText = message.text || (message.working ? "..." : "");
				const displayText = message.role === "user" ? stripFileBlocks(rawText) : rawText;
				if (displayText) {
					appendMarkdown(el, displayText, Boolean(message.working));
				}
				if (message.role === "assistant" && !message.working && message.timestamp) {
					const time = document.createElement("div");
					time.className = "message-time";
					time.textContent = formatMessageTime(message.timestamp);
					el.appendChild(time);
				}
			}
			updateEmptyState();
		}

		function approvalRisk(approval) {
			return approval && (approval.risk === "danger" || approval.risk === "warning") ? approval.risk : "normal";
		}

		function isDangerApproval(approval) {
			return approvalRisk(approval) === "danger";
		}

		function markApprovalReviewed(id) {
			reviewedApprovalIds.add(id);
			const approval = approvalData.get(id);
			if (approval) {
				renderApproval(approval);
			}
			updateApprovalBatch();
		}

		function approvalButton(approval, action, label, className) {
			const id = approval.id;
			const button = document.createElement("button");
			button.type = "button";
			button.className = className;
			button.textContent = label;
			if (action === "apply" && isDangerApproval(approval) && !reviewedApprovalIds.has(id)) {
				button.disabled = true;
				button.title = "Review this change before applying it.";
			}
			button.addEventListener("click", () => {
				if (action === "review") {
					markApprovalReviewed(id);
				}
				notify("approvalResponse", { id, action });
			});
			return button;
		}

		function renderApproval(approval) {
			approvalData.set(approval.id, approval);
			let el = approvalEls.get(approval.id);
			if (!el) {
				el = document.createElement("div");
				approvalsEl.appendChild(el);
				approvalEls.set(approval.id, el);
			}

			const reviewed = reviewedApprovalIds.has(approval.id);
			const risk = approvalRisk(approval);
			el.className = ["approval", "approval-" + risk, reviewed ? "approval-reviewed" : ""].filter(Boolean).join(" ");
			el.textContent = "";
			const header = document.createElement("div");
			header.className = "approval-header";
			const action = document.createElement("div");
			action.className = "approval-action";
			action.textContent = approval.action || approval.text;
			header.appendChild(action);
			const status = document.createElement("div");
			status.className = "approval-status";
			status.textContent = reviewed ? "Reviewed" : isDangerApproval(approval) ? "Review required" : "Pending";
			header.appendChild(status);
			el.appendChild(header);
			if (approval.target) {
				const target = document.createElement("div");
				target.className = "approval-target";
				target.textContent = approval.target;
				el.appendChild(target);
			}
			if (approval.scope) {
				const scope = document.createElement("div");
				scope.className = "approval-scope";
				scope.textContent = approval.scope;
				el.appendChild(scope);
			}
			if (approval.detail) {
				const detail = document.createElement("div");
				detail.className = "approval-detail";
				detail.textContent = approval.detail;
				el.appendChild(detail);
			}
			const actions = document.createElement("div");
			actions.className = "approval-actions";
			actions.appendChild(approvalButton(approval, "review", reviewed ? "Review again" : "Review", "secondary"));
			actions.appendChild(approvalButton(approval, "apply", "Apply", "primary"));
			actions.appendChild(approvalButton(approval, "reject", "Reject", "secondary"));
			el.appendChild(actions);
			updateApprovalBatch();
		}

		function removeApproval(id) {
			const el = approvalEls.get(id);
			if (!el) return;
			el.remove();
			approvalEls.delete(id);
			approvalData.delete(id);
			reviewedApprovalIds.delete(id);
			updateApprovalBatch();
		}

		function updateApprovalBatch() {
			approvalBatchEl.hidden = approvalEls.size <= 1;
			const hasDanger = Array.from(approvalData.values()).some((approval) => isDangerApproval(approval));
			applyAllEl.disabled = hasDanger;
			applyAllEl.title = hasDanger ? "Apply all is disabled while delete or overwrite approvals are pending." : "";
		}

		function setRunning(value) {
			running = value;
			sendEl.disabled = false;
			sendEl.hidden = false;
			stopEl.disabled = !value;
			stopEl.hidden = !value;
			runningHintEl.hidden = !value;
			updateSessionTime();
		}

		function setModelStatus(modelStatus) {
			const label = modelStatus ? modelStatus.label : "Models";
			modelStatusEl.textContent = label;
			modelStatusEl.title = modelStatus ? modelStatus.detail : "Select provider/model";
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

		function closeCompletion() {
			completion = null;
			completionItems = [];
			completionActiveIndex = 0;
			completionMenuEl.hidden = true;
			completionMenuBodyEl.textContent = "";
		}

		function renderCompletionMenu() {
			completionMenuBodyEl.textContent = "";
			if (!completion || completionItems.length === 0) {
				completionMenuEl.hidden = true;
				return;
			}
			const prefix = completion.kind === "file" ? "@" : "/";
			completionItems.forEach((item, index) => {
				const button = document.createElement("button");
				button.type = "button";
				button.className = ["completion-item", index === completionActiveIndex ? "active" : ""].filter(Boolean).join(" ");
				const label = document.createElement("span");
				label.className = "completion-item-label";
				label.textContent = prefix + item.value;
				button.appendChild(label);
				if (item.description) {
					const description = document.createElement("span");
					description.className = "completion-item-description";
					description.textContent = item.description;
					button.appendChild(description);
				}
				button.addEventListener("click", () => acceptCompletion(index));
				completionMenuBodyEl.appendChild(button);
			});
			completionMenuEl.hidden = false;
		}

		function moveCompletion(delta) {
			if (completionItems.length === 0) return;
			completionActiveIndex = (completionActiveIndex + delta + completionItems.length) % completionItems.length;
			renderCompletionMenu();
			const activeEl = completionMenuBodyEl.children[completionActiveIndex];
			if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
		}

		function acceptCompletion(index) {
			if (!completion) return;
			const item = completionItems[index === undefined ? completionActiveIndex : index];
			if (!item) return;
			const prefix = completion.kind === "file" ? "@" : "/";
			const insert = prefix + item.value + (item.value.endsWith("/") ? "" : " ");
			const caret = inputEl.selectionStart;
			inputEl.value = inputEl.value.slice(0, completion.tokenStart) + insert + inputEl.value.slice(caret);
			const newCaret = completion.tokenStart + insert.length;
			inputEl.setSelectionRange(newCaret, newCaret);
			closeCompletion();
			inputEl.focus();
			if (item.value.endsWith("/")) {
				updateCompletion();
			}
		}

		function loadSlashCommands() {
			if (slashCommandsCache) return Promise.resolve(slashCommandsCache);
			return call("listCommands", {})
				.then((commands) => {
					slashCommandsCache = Array.isArray(commands) ? commands : [];
					return slashCommandsCache;
				})
				.catch(() => {
					slashCommandsCache = [];
					return slashCommandsCache;
				});
		}

		function filterSlashCommands(query) {
			const needle = query.toLowerCase();
			completionItems = slashCommandsCache
				.filter((command) => command.name.toLowerCase().indexOf(needle) !== -1)
				.slice(0, 50)
				.map((command) => ({ value: command.name, description: command.description || "" }));
			renderCompletionMenu();
		}

		function scheduleFileQuery() {
			if (fileQueryTimer !== null) window.clearTimeout(fileQueryTimer);
			fileQueryTimer = window.setTimeout(() => {
				fileQueryTimer = null;
				if (!completion || completion.kind !== "file") return;
				const seq = ++completionRequestSeq;
				call("listFiles", { query: completion.query })
					.then((files) => {
						if (seq !== completionRequestSeq || !completion || completion.kind !== "file") return;
						completionItems = (Array.isArray(files) ? files : []).map((file) => ({ value: file.path, description: "" }));
						renderCompletionMenu();
					})
					.catch(() => {});
			}, 150);
		}

		function updateCompletion() {
			if (imeComposing) return;
			const caret = inputEl.selectionStart;
			if (caret !== inputEl.selectionEnd) {
				closeCompletion();
				return;
			}
			const before = inputEl.value.slice(0, caret);
			const slashMatch = before.match(/^\\/([^\\s]*)$/);
			if (slashMatch) {
				completion = { kind: "command", tokenStart: 0, query: slashMatch[1] };
				completionActiveIndex = 0;
				if (slashCommandsCache) {
					filterSlashCommands(slashMatch[1]);
				} else {
					completionMenuEl.hidden = true;
					void loadSlashCommands().then(() => {
						if (completion && completion.kind === "command") filterSlashCommands(completion.query);
					});
				}
				return;
			}
			const atMatch = before.match(/(?:^|\\s)@([^\\s]*)$/);
			if (atMatch) {
				const query = atMatch[1];
				completion = { kind: "file", tokenStart: caret - query.length - 1, query };
				completionActiveIndex = 0;
				scheduleFileQuery();
				return;
			}
			closeCompletion();
		}

		function resetPromptHistoryNavigation() {
			promptHistoryCursor = undefined;
			draftBeforePromptHistory = "";
		}

		function setUserPromptHistory(messages) {
			userPromptHistory = messages
				.filter((message) => message.role === "user" && typeof message.text === "string" && message.text.trim())
				.map((message) => message.text);
			resetPromptHistoryNavigation();
		}

		function appendUserPromptToHistory(message) {
			if (message.role === "user" && typeof message.text === "string" && message.text.trim()) {
				userPromptHistory.push(message.text);
				resetPromptHistoryNavigation();
			}
		}

		function replaceInputValue(value) {
			inputEl.value = value;
			const cursor = value.length;
			inputEl.setSelectionRange(cursor, cursor);
		}

		function isInputSelectionCollapsed() {
			return inputEl.selectionStart === inputEl.selectionEnd;
		}

		function isCursorOnFirstInputLine() {
			return inputEl.value.lastIndexOf("\\n", inputEl.selectionStart - 1) === -1;
		}

		function isCursorOnLastInputLine() {
			return inputEl.value.indexOf("\\n", inputEl.selectionEnd) === -1;
		}

		function shouldHandlePromptHistoryKey(event, direction) {
			if (direction === "next" && promptHistoryCursor === undefined) {
				return false;
			}
			if (
				event.isComposing ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				event.shiftKey ||
				userPromptHistory.length === 0 ||
				!isInputSelectionCollapsed()
			) {
				return false;
			}
			return direction === "previous" ? isCursorOnFirstInputLine() : isCursorOnLastInputLine();
		}

		function navigatePromptHistory(direction) {
			if (promptHistoryCursor === undefined) {
				draftBeforePromptHistory = inputEl.value;
				promptHistoryCursor = userPromptHistory.length;
			}

			if (direction === "previous") {
				promptHistoryCursor = Math.max(0, promptHistoryCursor - 1);
				replaceInputValue(userPromptHistory[promptHistoryCursor] || "");
				return;
			}

			promptHistoryCursor = Math.min(userPromptHistory.length, promptHistoryCursor + 1);
			if (promptHistoryCursor === userPromptHistory.length) {
				replaceInputValue(draftBeforePromptHistory);
				resetPromptHistoryNavigation();
				return;
			}
			replaceInputValue(userPromptHistory[promptHistoryCursor] || "");
		}

		function setState(state) {
			streamBuffers.clear();
			pendingRenderIds.clear();
			pendingQueueEl.textContent = "";
			pendingQueueEl.hidden = true;
			messagesEl.textContent = "";
			messagesEl.appendChild(sessionTimeEl);
			approvalsEl.textContent = "";
			messageEls.clear();
			messageData.clear();
			approvalEls.clear();
			approvalData.clear();
			const activeApprovalIds = new Set(state.approvals.map((approval) => approval.id));
			for (const id of reviewedApprovalIds) {
				if (!activeApprovalIds.has(id)) {
					reviewedApprovalIds.delete(id);
				}
			}
			setUserPromptHistory(state.messages);
			for (const message of state.messages) renderMessage(message);
			for (const approval of state.approvals) renderApproval(approval);
			updateApprovalBatch();
			updateEmptyState();
			setPermissionMode(state.permissionMode);
			setApprovalMode(state.approvalMode);
			setModelStatus(state.modelStatus);
			setRunning(state.running);
			messagesEl.scrollTop = messagesEl.scrollHeight;
		}

		function restoreQueuedMessagesToInput(data) {
			const restored = (data?.steering || []).concat(data?.followUp || []);
			if (restored.length === 0) {
				return;
			}
			const current = inputEl.value;
			inputEl.value = [current, ...restored].filter((text) => text.trim()).join("\\n\\n");
			inputEl.focus();
		}

		function renderPendingQueue(steering, followUp) {
			pendingQueueEl.textContent = "";
			const items = [];
			for (const text of steering || []) {
				items.push({ text, kind: "steer" });
			}
			for (const text of followUp || []) {
				items.push({ text, kind: "followUp" });
			}
			if (items.length === 0) {
				pendingQueueEl.hidden = true;
				return;
			}
			pendingQueueEl.hidden = false;
			const label = document.createElement("span");
			label.className = "pending-queue-label";
			label.textContent = "Queued";
			pendingQueueEl.appendChild(label);
			for (const item of items) {
				const chip = document.createElement("span");
				chip.className = ["pending-queue-item", "pending-queue-" + item.kind].join(" ");
				chip.title = (item.kind === "steer" ? "Steer: " : "Follow-up: ") + item.text;
				chip.textContent = (item.kind === "steer" ? "⇧ " : "↪ ") + item.text.split("\\n")[0].slice(0, 60);
				pendingQueueEl.appendChild(chip);
			}
			const restore = document.createElement("button");
			restore.type = "button";
			restore.className = "pending-queue-restore";
			restore.textContent = "Restore";
			restore.addEventListener("click", () => {
				void call("clearQueue", {})
					.then((data) => restoreQueuedMessagesToInput(data))
					.catch((error) => console.error("Pi clearQueue failed:", error));
			});
			pendingQueueEl.appendChild(restore);
		}

		function send(streamingBehavior) {
			const text = inputEl.value.trim();
			if (!text) return;
			closeCompletion();
			inputEl.value = "";
			resetPromptHistoryNavigation();
			notify("send", { text, streamingBehavior });
		}

		sendEl.addEventListener("click", () => send("steer"));
		stopEl.addEventListener("click", () => {
			void call("stop", {})
				.then((data) => restoreQueuedMessagesToInput(data))
				.catch((error) => console.error("Pi stop failed:", error));
		});
		newEl.addEventListener("click", () => notify("new", {}));
		modelStatusEl.addEventListener("click", () => notify("selectModel", {}));
		reviewAllEl.addEventListener("click", () => {
			for (const id of approvalData.keys()) {
				reviewedApprovalIds.add(id);
			}
			for (const approval of approvalData.values()) {
				renderApproval(approval);
			}
			notify("approvalBatchResponse", { action: "review" });
		});
		applyAllEl.addEventListener("click", () => notify("approvalBatchResponse", { action: "apply" }));
		rejectAllEl.addEventListener("click", () => notify("approvalBatchResponse", { action: "reject" }));
		modeEl.addEventListener("click", () =>
			openSelectMenu("mode", modeEl, "Agent", "◇", permissionModeOptions, permissionModeValue, (permissionMode) => {
				setPermissionMode(permissionMode);
				notify("setPermissionMode", { permissionMode });
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
					notify("setApprovalMode", { approvalMode });
				},
			),
		);
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
			if (completion && !completionMenuEl.contains(target) && target !== inputEl) {
				closeCompletion();
			}
		}, true);
		window.addEventListener("resize", () => {
			closeSelectMenu();
			closeCompletion();
		});
		inputEl.addEventListener("keydown", (event) => {
			if (completion && !completionMenuEl.hidden) {
				if (event.key === "ArrowDown") {
					event.preventDefault();
					moveCompletion(1);
					return;
				}
				if (event.key === "ArrowUp") {
					event.preventDefault();
					moveCompletion(-1);
					return;
				}
				if (event.key === "Enter" || event.key === "Tab") {
					event.preventDefault();
					acceptCompletion();
					return;
				}
				if (event.key === "Escape") {
					event.preventDefault();
					closeCompletion();
					return;
				}
			}
			if (event.key === "Enter" && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
				event.preventDefault();
				send("followUp");
				return;
			}
			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				send("steer");
				return;
			}
			if (event.key === "ArrowUp" && shouldHandlePromptHistoryKey(event, "previous")) {
				event.preventDefault();
				navigatePromptHistory("previous");
				return;
			}
			if (event.key === "ArrowDown" && shouldHandlePromptHistoryKey(event, "next")) {
				event.preventDefault();
				navigatePromptHistory("next");
			}
		});
		inputEl.addEventListener("input", () => {
			resetPromptHistoryNavigation();
			updateCompletion();
		});
		inputEl.addEventListener("compositionstart", () => {
			imeComposing = true;
		});
		inputEl.addEventListener("compositionend", () => {
			imeComposing = false;
			updateCompletion();
		});
		inputEl.addEventListener("click", () => {
			updateCompletion();
		});
		inputEl.addEventListener("keyup", (event) => {
			if (
				event.key === "ArrowLeft" ||
				event.key === "ArrowRight" ||
				event.key === "Home" ||
				event.key === "End" ||
				event.key === "PageUp" ||
				event.key === "PageDown"
			) {
				updateCompletion();
			}
		});
		composerResizeEl.addEventListener("pointerdown", (event) => {
			event.preventDefault();
			const startY = event.clientY;
			const startHeight = inputEl.getBoundingClientRect().height;
			composerResizeEl.setPointerCapture(event.pointerId);
			inputEl.style.maxHeight = "none";
			const onMove = (moveEvent) => {
				const next = Math.min(116, Math.max(58, startHeight + (startY - moveEvent.clientY)));
				inputEl.style.height = String(Math.round(next)).concat("px");
			};
			const onEnd = () => {
				composerResizeEl.removeEventListener("pointermove", onMove);
				composerResizeEl.removeEventListener("pointerup", onEnd);
				composerResizeEl.removeEventListener("pointercancel", onEnd);
			};
			composerResizeEl.addEventListener("pointermove", onMove);
			composerResizeEl.addEventListener("pointerup", onEnd);
			composerResizeEl.addEventListener("pointercancel", onEnd);
		});

		window.addEventListener("message", (event) => {
			const envelope = event.data;
			if (envelope?.kind === "response") {
				const pending = pendingRequests.get(envelope.id);
				if (!pending) return;
				pendingRequests.delete(envelope.id);
				window.clearTimeout(pending.timeoutId);
				if (envelope.ok) {
					pending.resolve(envelope.data);
				} else {
					pending.reject(new Error(envelope.error?.message || "Pi request failed."));
				}
				return;
			}
			if (envelope?.kind !== "event" || !envelope.event) return;
			const message = envelope.event;
			if (message.type === "state") {
				setState(message);
			} else if (message.type === "append") {
				appendUserPromptToHistory(message.message);
				messageData.set(message.message.id, message.message);
				scheduleRender(message.message.id);
			} else if (message.type === "appendDelta") {
				const existing = messageData.get(message.id);
				if (existing) {
					enqueueDelta(message.id, message.delta);
				} else {
					messagesEl.scrollTop = messagesEl.scrollHeight;
				}
			} else if (message.type === "replace") {
				const el = messageEls.get(message.id);
				const existing = messageData.get(message.id);
				const role = message.role || (el ? el.dataset.role : undefined) || "assistant";
				dropStreamBuffer(message.id);
				const replacedMessage = {
					id: message.id,
					role,
					text: message.text || "",
					working: message.working,
					tool: message.tool,
					timestamp: message.timestamp ?? existing?.timestamp,
				};
				messageData.set(replacedMessage.id, replacedMessage);
				scheduleRender(replacedMessage.id);
			} else if (message.type === "running") {
				setRunning(message.running);
			} else if (message.type === "queueUpdate") {
				renderPendingQueue(message.steering, message.followUp);
			} else if (message.type === "modelStatus") {
				setModelStatus(message.modelStatus);
			} else if (message.type === "approvalRequested") {
				renderApproval(message.approval);
			} else if (message.type === "approvalResolved") {
				removeApproval(message.id);
			} else if (message.type === "prefill") {
				inputEl.value = message.text;
				resetPromptHistoryNavigation();
				inputEl.focus();
			}
		});

		notify("ready", {});`;
}
