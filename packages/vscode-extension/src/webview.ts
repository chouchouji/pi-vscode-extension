function nonce(): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let value = "";
	for (let i = 0; i < 32; i++) {
		value += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return value;
}

export function getWebviewHtml(): string {
	const scriptNonce = nonce();
	const styleNonce = nonce();

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${styleNonce}'; script-src 'nonce-${scriptNonce}';">
	<style nonce="${styleNonce}">
		body {
			padding: 0;
			margin: 0;
			color: var(--vscode-foreground);
			background: var(--vscode-sideBar-background);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			line-height: 1.45;
		}
		#app {
			display: flex;
			flex-direction: column;
			height: 100vh;
			min-width: 0;
		}
		.toolbar {
			display: flex;
			align-items: center;
			padding: 8px;
			border-bottom: 1px solid var(--vscode-sideBar-border);
		}
		.toolbar select {
			flex: 1;
			min-width: 0;
			color: var(--vscode-dropdown-foreground);
			background: var(--vscode-dropdown-background);
			border: 1px solid var(--vscode-dropdown-border);
			padding: 4px;
		}
		#approvalMode {
			flex: 0 0 76px;
			margin-left: 6px;
		}
		.model-status {
			flex: 1;
			min-width: 0;
			margin-left: 8px;
			color: var(--vscode-descriptionForeground);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.sessionbar {
			display: flex;
			align-items: center;
			padding: 6px 8px;
			border-bottom: 1px solid var(--vscode-sideBar-border);
		}
		.sessionbar select {
			width: 100%;
			min-width: 0;
			color: var(--vscode-dropdown-foreground);
			background: var(--vscode-dropdown-background);
			border: 1px solid var(--vscode-dropdown-border);
			padding: 4px;
		}
		.icon-button {
			width: 28px;
			height: 28px;
			margin-left: 6px;
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
			border: 0;
			cursor: pointer;
		}
		.icon-button:disabled {
			opacity: 0.5;
			cursor: default;
		}
		.messages {
			flex: 1;
			overflow: auto;
			padding: 10px;
		}
		.message {
			margin-bottom: 12px;
			padding: 10px 12px;
			border-left: 3px solid var(--vscode-sideBar-border);
			background: var(--vscode-editor-background);
			overflow-wrap: anywhere;
		}
		.message.user {
			border-left-color: var(--vscode-textLink-foreground);
		}
		.message.assistant {
			border-left-color: var(--vscode-charts-green);
		}
		.message.error {
			border-left-color: var(--vscode-errorForeground);
		}
		.message.tool {
			color: var(--vscode-descriptionForeground);
		}
		.message-actions {
			display: flex;
			gap: 4px;
			justify-content: flex-end;
			margin-top: 8px;
		}
		.feedback-button {
			min-width: 28px;
			height: 24px;
			padding: 0 7px;
			border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
			color: var(--vscode-button-secondaryForeground);
			background: var(--vscode-button-secondaryBackground);
			cursor: pointer;
			font: inherit;
			line-height: 22px;
		}
		.feedback-button:hover,
		.feedback-button.active {
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
		}
		.message-content > :first-child,
		.tool-title > :first-child {
			margin-top: 0;
		}
		.message-content > :last-child,
		.tool-title > :last-child {
			margin-bottom: 0;
		}
		.message-content p,
		.tool-title p {
			margin: 0 0 8px;
			white-space: pre-wrap;
		}
		.message-content h1,
		.message-content h2,
		.message-content h3,
		.message-content h4 {
			margin: 12px 0 6px;
			color: var(--vscode-foreground);
			font-weight: 600;
			line-height: 1.25;
		}
		.message-content h1 {
			font-size: 1.35em;
			padding-bottom: 4px;
			border-bottom: 1px solid var(--vscode-sideBar-border);
		}
		.message-content h2 {
			font-size: 1.18em;
		}
		.message-content h3,
		.message-content h4 {
			font-size: 1.05em;
		}
		.message-content ul,
		.message-content ol {
			margin: 4px 0 10px;
			padding-left: 22px;
		}
		.message-content li {
			margin: 3px 0;
		}
		.message-content blockquote {
			margin: 8px 0;
			padding: 2px 0 2px 10px;
			border-left: 3px solid var(--vscode-textBlockQuote-border);
			color: var(--vscode-textBlockQuote-foreground, var(--vscode-descriptionForeground));
		}
		.message-content hr {
			height: 1px;
			margin: 12px 0;
			border: 0;
			background: var(--vscode-sideBar-border);
		}
		.message-content pre,
		.tool-pre {
			box-sizing: border-box;
			max-width: 100%;
			margin: 8px 0;
			padding: 10px;
			border: 1px solid var(--vscode-panel-border);
			overflow: auto;
			color: var(--vscode-editor-foreground);
			background: var(--vscode-textCodeBlock-background);
			font-family: var(--vscode-editor-font-family);
			font-size: var(--vscode-editor-font-size);
			line-height: 1.45;
			white-space: pre;
		}
		.tool-output {
			color: var(--vscode-terminal-foreground, var(--vscode-editor-foreground));
			background: var(--vscode-terminal-background, var(--vscode-textCodeBlock-background));
		}
		.message-content code,
		.tool-pre code {
			font-family: var(--vscode-editor-font-family);
			font-size: 0.96em;
		}
		.message-content :not(pre) > code {
			padding: 1px 4px;
			border-radius: 3px;
			color: var(--vscode-textPreformat-foreground);
			background: var(--vscode-textCodeBlock-background);
		}
		.message-content a,
		.file-link {
			color: var(--vscode-textLink-foreground);
			text-decoration: none;
			cursor: pointer;
		}
		.message-content a:hover,
		.file-link:hover {
			color: var(--vscode-textLink-activeForeground);
			text-decoration: underline;
		}
		.code-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			margin: 8px 0 -8px;
			padding: 4px 8px;
			border: 1px solid var(--vscode-panel-border);
			border-bottom: 0;
			color: var(--vscode-descriptionForeground);
			background: var(--vscode-editorGroupHeader-tabsBackground);
			font-family: var(--vscode-font-family);
			font-size: 0.9em;
		}
		.code-header + pre {
			margin-top: 0;
		}
		.copy-code {
			color: var(--vscode-button-secondaryForeground);
			background: var(--vscode-button-secondaryBackground);
			border: 0;
			padding: 2px 6px;
			cursor: pointer;
			font: inherit;
		}
		.copy-code:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		.tool-header {
			display: flex;
			align-items: center;
			gap: 6px;
			margin-bottom: 6px;
			color: var(--vscode-foreground);
		}
		.tool-name {
			font-weight: 600;
		}
		.tool-status {
			color: var(--vscode-descriptionForeground);
		}
		.tool-title {
			margin-bottom: 6px;
			color: var(--vscode-descriptionForeground);
		}
		.tool-section {
			margin-top: 8px;
		}
		.tool-section-label {
			margin-bottom: 3px;
			color: var(--vscode-descriptionForeground);
			font-size: 0.9em;
		}
		.approvals {
			padding: 0 8px 8px;
		}
		.approval-batch {
			display: flex;
			gap: 6px;
			flex-wrap: wrap;
			padding: 8px;
			border-bottom: 1px solid var(--vscode-sideBar-border);
			background: var(--vscode-editor-background);
		}
		.approval-batch[hidden] {
			display: none;
		}
		.approval {
			margin-top: 8px;
			padding: 8px;
			border-left: 2px solid var(--vscode-textLink-foreground);
			background: var(--vscode-editor-background);
		}
		.approval-text {
			margin-bottom: 4px;
		}
		.approval-detail {
			margin-bottom: 8px;
			color: var(--vscode-descriptionForeground);
			overflow-wrap: anywhere;
		}
		.approval-actions {
			display: flex;
			gap: 6px;
			flex-wrap: wrap;
		}
		.secondary {
			color: var(--vscode-button-secondaryForeground);
			background: var(--vscode-button-secondaryBackground);
			border: 0;
			padding: 5px 10px;
			cursor: pointer;
		}
		.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		.composer {
			border-top: 1px solid var(--vscode-sideBar-border);
			padding: 8px;
		}
		textarea {
			box-sizing: border-box;
			width: 100%;
			min-height: 80px;
			resize: vertical;
			padding: 8px;
			color: var(--vscode-input-foreground);
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
		}
		.actions {
			display: flex;
			justify-content: flex-end;
			margin-top: 8px;
		}
		.primary {
			min-width: 72px;
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
			border: 0;
			padding: 6px 12px;
			cursor: pointer;
		}
		.primary:hover,
		.icon-button:hover {
			background: var(--vscode-button-hoverBackground);
		}
	</style>
</head>
<body>
	<div id="app">
		<div class="toolbar">
			<select id="mode" title="Workspace access">
				<option value="ask">Ask</option>
				<option value="plan">Plan</option>
				<option value="code">Code</option>
			</select>
			<select id="approvalMode" title="Edit approval">
				<option value="ask">Ask</option>
				<option value="auto">Auto</option>
			</select>
			<div id="modelStatus" class="model-status" title="No model">No model</div>
			<button id="new" class="icon-button" title="New chat">+</button>
			<button id="stop" class="icon-button" title="Stop" disabled>■</button>
		</div>
		<div class="sessionbar">
			<select id="sessionSelect" title="Session"></select>
		</div>
			<div id="messages" class="messages"></div>
			<div id="approvalBatch" class="approval-batch" hidden>
				<button id="reviewAll" class="secondary" type="button">Review all</button>
				<button id="applyAll" class="primary" type="button">Apply all</button>
				<button id="rejectAll" class="secondary" type="button">Reject all</button>
			</div>
			<div id="approvals" class="approvals"></div>
		<div class="composer">
			<textarea id="input" placeholder="Message Pi"></textarea>
			<div class="actions">
				<button id="send" class="primary">Send</button>
			</div>
		</div>
	</div>
	<script nonce="${scriptNonce}">
			const vscode = acquireVsCodeApi();
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
		const approvalModeEl = document.getElementById("approvalMode");
		const modelStatusEl = document.getElementById("modelStatus");
		const sessionSelectEl = document.getElementById("sessionSelect");
		const messageEls = new Map();
		const messageData = new Map();
		const approvalEls = new Map();
		let running = false;
		let activeSessionPath = "";

		function appendText(parent, className, text) {
			const el = document.createElement("div");
			el.className = className;
			el.textContent = text;
			parent.appendChild(el);
			return el;
		}

		function appendCodeBlock(parent, code, language) {
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
			codeEl.textContent = code;
			pre.appendChild(codeEl);
			parent.appendChild(pre);
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

		function appendInline(parent, text) {
			const pattern = /(\\\`[^\\\`]+\\\`|\\[[^\\]\\n]+\\]\\((https?:\\/\\/[^)\\s]+)\\)|(?:\\.{1,2}\\/|\\/)?(?:[A-Za-z0-9_.@()-]+\\/)*[A-Za-z0-9_.@()-]+\\.[A-Za-z0-9]+(?::[0-9]+){0,2})/g;
			let offset = 0;
			for (const match of text.matchAll(pattern)) {
				const value = match[0];
				const index = match.index || 0;
				if (index > offset) {
					parent.appendChild(document.createTextNode(text.slice(offset, index)));
				}

				if (value.startsWith("\`") && value.endsWith("\`")) {
					const code = document.createElement("code");
					code.textContent = value.slice(1, -1);
					parent.appendChild(code);
				} else if (value.startsWith("[")) {
					const closeLabel = value.indexOf("](");
					const link = document.createElement("a");
					link.href = value.slice(closeLabel + 2, -1);
					link.textContent = value.slice(1, closeLabel);
					parent.appendChild(link);
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

		const terminalAnsiColors = [
			"var(--vscode-terminal-ansiBlack)",
			"var(--vscode-terminal-ansiRed)",
			"var(--vscode-terminal-ansiGreen)",
			"var(--vscode-terminal-ansiYellow)",
			"var(--vscode-terminal-ansiBlue)",
			"var(--vscode-terminal-ansiMagenta)",
			"var(--vscode-terminal-ansiCyan)",
			"var(--vscode-terminal-ansiWhite)",
			"var(--vscode-terminal-ansiBrightBlack)",
			"var(--vscode-terminal-ansiBrightRed)",
			"var(--vscode-terminal-ansiBrightGreen)",
			"var(--vscode-terminal-ansiBrightYellow)",
			"var(--vscode-terminal-ansiBrightBlue)",
			"var(--vscode-terminal-ansiBrightMagenta)",
			"var(--vscode-terminal-ansiBrightCyan)",
			"var(--vscode-terminal-ansiBrightWhite)",
		];

		function color256(index) {
			if (index < 16) {
				return terminalAnsiColors[index];
			}
			if (index < 232) {
				const cubeIndex = index - 16;
				const red = Math.floor(cubeIndex / 36);
				const green = Math.floor((cubeIndex % 36) / 6);
				const blue = cubeIndex % 6;
				const component = (value) => (value === 0 ? 0 : 55 + value * 40);
				return "rgb(".concat(String(component(red)), ",", String(component(green)), ",", String(component(blue)), ")");
			}
			const gray = 8 + (index - 232) * 10;
			return "rgb(".concat(String(gray), ",", String(gray), ",", String(gray), ")");
		}

		function createAnsiState() {
			return {
				fg: "",
				bg: "",
				bold: false,
				dim: false,
				italic: false,
				underline: false,
			};
		}

		function resetAnsiState(state) {
			state.fg = "";
			state.bg = "";
			state.bold = false;
			state.dim = false;
			state.italic = false;
			state.underline = false;
		}

		function applyAnsiCodes(state, rawCodes) {
			const codes = rawCodes.length === 0 ? [0] : rawCodes.map((code) => Number(code || "0"));
			let index = 0;
			while (index < codes.length) {
				const code = codes[index];
				if (code === 0) {
					resetAnsiState(state);
				} else if (code === 1) {
					state.bold = true;
				} else if (code === 2) {
					state.dim = true;
				} else if (code === 3) {
					state.italic = true;
				} else if (code === 4) {
					state.underline = true;
				} else if (code === 22) {
					state.bold = false;
					state.dim = false;
				} else if (code === 23) {
					state.italic = false;
				} else if (code === 24) {
					state.underline = false;
				} else if (code >= 30 && code <= 37) {
					state.fg = terminalAnsiColors[code - 30];
				} else if (code === 38) {
					if (codes[index + 1] === 5 && codes.length > index + 2) {
						state.fg = color256(codes[index + 2]);
						index += 2;
					} else if (codes[index + 1] === 2 && codes.length > index + 4) {
						state.fg = "rgb(".concat(String(codes[index + 2]), ",", String(codes[index + 3]), ",", String(codes[index + 4]), ")");
						index += 4;
					}
				} else if (code === 39) {
					state.fg = "";
				} else if (code >= 40 && code <= 47) {
					state.bg = terminalAnsiColors[code - 40];
				} else if (code === 48) {
					if (codes[index + 1] === 5 && codes.length > index + 2) {
						state.bg = color256(codes[index + 2]);
						index += 2;
					} else if (codes[index + 1] === 2 && codes.length > index + 4) {
						state.bg = "rgb(".concat(String(codes[index + 2]), ",", String(codes[index + 3]), ",", String(codes[index + 4]), ")");
						index += 4;
					}
				} else if (code === 49) {
					state.bg = "";
				} else if (code >= 90 && code <= 97) {
					state.fg = terminalAnsiColors[code - 90 + 8];
				} else if (code >= 100 && code <= 107) {
					state.bg = terminalAnsiColors[code - 100 + 8];
				}
				index++;
			}
		}

		function hasAnsiStyle(state) {
			return state.fg || state.bg || state.bold || state.dim || state.italic || state.underline;
		}

		function appendAnsiText(parent, text, state) {
			if (!text) {
				return;
			}
			if (!hasAnsiStyle(state)) {
				parent.appendChild(document.createTextNode(text));
				return;
			}
			const span = document.createElement("span");
			if (state.fg) span.style.color = state.fg;
			if (state.bg) span.style.backgroundColor = state.bg;
			if (state.bold) span.style.fontWeight = "700";
			if (state.dim) span.style.opacity = "0.65";
			if (state.italic) span.style.fontStyle = "italic";
			if (state.underline) span.style.textDecoration = "underline";
			span.textContent = text;
			parent.appendChild(span);
		}

		function appendAnsi(parent, text) {
			const state = createAnsiState();
			const pattern = new RegExp("\\\\x1b\\\\[([0-9;:]*)m", "g");
			let offset = 0;
			for (const match of text.matchAll(pattern)) {
				const index = match.index || 0;
				appendAnsiText(parent, text.slice(offset, index), state);
				applyAnsiCodes(state, match[1].split(/[;:]/));
				offset = index + match[0].length;
			}
			appendAnsiText(parent, text.slice(offset), state);
		}

		function appendPre(parent, label, text, renderAnsi) {
			const section = document.createElement(text.length > 1200 ? "details" : "div");
			section.className = "tool-section";
			if (section.tagName === "DETAILS") {
				section.open = true;
				const summary = document.createElement("summary");
				summary.className = "tool-section-label";
				summary.textContent = label;
				section.appendChild(summary);
			} else {
				appendText(section, "tool-section-label", label);
			}
			const pre = document.createElement("pre");
			pre.className = renderAnsi ? "tool-pre tool-output" : "tool-pre";
			if (renderAnsi) {
				appendAnsi(pre, text);
			} else {
				pre.textContent = text;
			}
			section.appendChild(pre);
			parent.appendChild(section);
		}

		function renderToolMessage(el, message) {
			const tool = message.tool;
			const output = typeof tool.output === "string" ? tool.output.trimEnd() : "";
			const header = document.createElement("div");
			header.className = "tool-header";
			appendText(header, "tool-name", tool.name);
			appendText(header, "tool-status", tool.status);
			el.appendChild(header);
			if (tool.title) {
				const title = document.createElement("div");
				title.className = "tool-title";
				appendMarkdown(title, tool.title);
				el.appendChild(title);
			}
			if (tool.args) appendPre(el, "Arguments", tool.args, false);
			if (output.trim()) appendPre(el, "Output", output, true);
			if (!output.trim() && message.text && message.text.trim() !== tool.name.concat(":")) {
				const title = document.createElement("div");
				title.className = "tool-title";
				appendMarkdown(title, message.text);
				el.appendChild(title);
			}
		}

		function feedbackButton(message, rating, label, title) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = ["feedback-button", message.feedback === rating ? "active" : ""].filter(Boolean).join(" ");
			button.textContent = label;
			button.title = title;
			button.addEventListener("click", () => vscode.postMessage({ type: "rateMessage", id: message.id, rating }));
			return button;
		}

		function renderFeedbackActions(el, message) {
			if (message.working || message.role !== "assistant" || message.tool) {
				return;
			}
			const actions = document.createElement("div");
			actions.className = "message-actions";
			actions.appendChild(feedbackButton(message, "up", "Up", "This answer was useful"));
			actions.appendChild(feedbackButton(message, "down", "Down", "Report a problem with this answer"));
			el.appendChild(actions);
		}

		function removeMessage(id) {
			const el = messageEls.get(id);
			if (el) el.remove();
			messageEls.delete(id);
			messageData.delete(id);
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
			renderFeedbackActions(el, message);
			messagesEl.scrollTop = messagesEl.scrollHeight;
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
			stopEl.disabled = !value;
		}

		function setModelStatus(modelStatus) {
			const label = modelStatus ? modelStatus.label : "No model";
			modelStatusEl.textContent = label;
			modelStatusEl.title = modelStatus ? modelStatus.detail : label;
		}

		function setSessions(sessions, activePath) {
			activeSessionPath = activePath || "";
			sessionSelectEl.textContent = "";
			if (!sessions || sessions.length === 0) {
				const option = document.createElement("option");
				option.value = "";
				option.textContent = "Current session";
				sessionSelectEl.appendChild(option);
				sessionSelectEl.disabled = true;
				return;
			}
			sessionSelectEl.disabled = false;
			for (const session of sessions) {
				const option = document.createElement("option");
				option.value = session.path;
				option.textContent = session.active ? "Current: ".concat(session.label) : session.label;
				option.title = session.detail;
				sessionSelectEl.appendChild(option);
			}
			sessionSelectEl.value = activeSessionPath;
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
			modeEl.value = state.permissionMode;
			approvalModeEl.value = state.approvalMode;
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
		modeEl.addEventListener("change", () => vscode.postMessage({ type: "setPermissionMode", permissionMode: modeEl.value }));
		approvalModeEl.addEventListener("change", () => vscode.postMessage({ type: "setApprovalMode", approvalMode: approvalModeEl.value }));
		sessionSelectEl.addEventListener("change", () => {
			if (sessionSelectEl.value && sessionSelectEl.value !== activeSessionPath) {
				vscode.postMessage({ type: "switchSession", path: sessionSelectEl.value });
			}
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
				const existing = messageData.get(message.id);
				const role = message.role || (el ? el.dataset.role : undefined) || "assistant";
				renderMessage({
					id: message.id,
					role,
					text: message.text || "",
					working: message.working,
					tool: message.tool,
					feedback: existing ? existing.feedback : undefined,
				});
			} else if (message.type === "feedbackChanged") {
				const existing = messageData.get(message.id);
				if (existing) {
					existing.feedback = message.feedback;
					renderMessage(existing);
				}
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
			}
		});

		vscode.postMessage({ type: "ready" });
	</script>
</body>
</html>`;
}
