export function getWebviewScript(): string {
	return `			const vscode = acquireVsCodeApi();
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
		const sessionHistoryEl = document.getElementById("sessionHistory");
		const currentSessionLabelEl = document.getElementById("currentSessionLabel");
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
		let permissionModeValue = "ask";
		let approvalModeValue = "ask";
		let openSelectKind = "";
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
			modeLabelEl.textContent = option ? option.label : "Ask";
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
			sessionHistoryEl.setAttribute("aria-expanded", open ? "true" : "false");
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
			const menuWidth = Math.min(360, window.innerWidth - 24);
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
			const activeSession = sessionsState.find((session) => session.path === activeSessionPath || session.active);
			currentSessionLabelEl.textContent = activeSession ? activeSession.label : "Current session";
			sessionHistoryEl.title = activeSession ? "Session history: ".concat(activeSession.detail) : "Session history";
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
		sessionHistoryEl.addEventListener("click", () => setSessionPanelOpen(sessionPanelEl.hidden));
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
				!sessionPanelEl.contains(target) &&
				!sessionHistoryEl.contains(target)
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
			}
		});

		vscode.postMessage({ type: "ready" });`;
}
