export function getWebviewStyles(): string {
	return `		body {
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
		.content {
			position: relative;
			display: flex;
			flex: 1;
			flex-direction: column;
			min-height: 0;
		}
		.empty-state {
			position: absolute;
			top: 50%;
			left: 50%;
			display: flex;
			flex-direction: column;
			align-items: center;
			width: min(260px, calc(100% - 48px));
			color: var(--vscode-descriptionForeground);
			text-align: center;
			transform: translate(-50%, -55%);
		}
		.empty-state[hidden] {
			display: none;
		}
		.empty-mark {
			display: grid;
			width: 42px;
			height: 42px;
			margin-bottom: 12px;
			place-items: center;
			border: 1px solid var(--vscode-descriptionForeground);
			border-radius: 8px;
			color: var(--vscode-foreground);
			font-weight: 600;
		}
		.empty-title {
			margin-bottom: 4px;
			color: var(--vscode-foreground);
			font-weight: 600;
		}
		.empty-subtitle {
			font-size: 0.92em;
		}
		.session-panel {
			position: absolute;
			top: 10px;
			right: 10px;
			z-index: 4;
			display: flex;
			flex-direction: column;
			width: min(360px, calc(100% - 20px));
			max-height: min(520px, calc(100% - 64px));
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			background: var(--vscode-editor-background);
			box-shadow: 0 8px 28px var(--vscode-widget-shadow);
		}
		.session-panel[hidden] {
			display: none;
		}
		.session-panel-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			padding: 10px 10px 8px;
			border-bottom: 1px solid var(--vscode-panel-border);
			font-weight: 600;
		}
		.close-button {
			width: 24px;
			height: 24px;
			border: 0;
			border-radius: 5px;
			color: var(--vscode-descriptionForeground);
			background: transparent;
			cursor: pointer;
			font: inherit;
			line-height: 24px;
		}
		.close-button:hover {
			color: var(--vscode-foreground);
			background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
		}
		.session-search {
			box-sizing: border-box;
			width: calc(100% - 20px);
			height: 30px;
			margin: 10px;
			padding: 0 8px;
			border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
			color: var(--vscode-input-foreground);
			background: var(--vscode-input-background);
			font: inherit;
		}
		.session-list {
			overflow: auto;
			padding: 0 6px 8px;
		}
		.session-item {
			display: block;
			width: 100%;
			padding: 8px;
			border: 0;
			border-radius: 6px;
			color: var(--vscode-foreground);
			background: transparent;
			cursor: pointer;
			font: inherit;
			text-align: left;
		}
		.session-item:hover,
		.session-item.active {
			background: var(--vscode-list-hoverBackground);
		}
		.session-item.active {
			color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground));
			background: var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground));
		}
		.session-item-title,
		.session-item-detail,
		.session-empty {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.session-item-title {
			font-weight: 500;
		}
		.session-item-detail,
		.session-empty {
			margin-top: 2px;
			color: var(--vscode-descriptionForeground);
			font-size: 0.9em;
		}
		.session-empty {
			padding: 8px;
		}
		.messages {
			flex: 1;
			overflow: auto;
			padding: 12px 14px;
		}
		.message {
			margin-bottom: 16px;
			padding: 0;
			overflow-wrap: anywhere;
		}
		.message.user {
			margin-left: 18px;
			padding: 9px 11px;
			border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
			border-radius: 8px;
			background: var(--vscode-input-background);
		}
		.message.assistant {
			color: var(--vscode-foreground);
		}
		.message.error {
			padding: 9px 11px;
			border: 1px solid var(--vscode-errorForeground);
			border-radius: 8px;
			background: var(--vscode-inputValidation-errorBackground);
		}
		.message.tool {
			padding: 8px 10px;
			border: 0;
			border-radius: 6px;
			color: var(--vscode-foreground);
			background: color-mix(in srgb, var(--vscode-descriptionForeground) 8%, transparent);
		}
		.message.tool.tool-running {
			background: color-mix(in srgb, var(--vscode-descriptionForeground) 10%, transparent);
		}
		.message.tool.tool-completed {
			background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 10%, transparent);
		}
		.message.tool.tool-failed {
			background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent);
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
			overflow-wrap: normal;
			tab-size: 2;
			white-space: pre;
		}
		pre.shiki-code-block {
			padding: 10px;
			color: inherit;
			forced-color-adjust: none;
			overflow-x: auto;
		}
		pre.shiki-code-block code {
			forced-color-adjust: none;
		}
		pre.shiki-code-block .line {
			display: block;
			forced-color-adjust: none;
			min-height: 1.45em;
			overflow-wrap: normal;
			white-space: pre;
		}
		pre.shiki-code-block .shiki-token {
			background-clip: text;
			background-image: linear-gradient(var(--pi-token-color), var(--pi-token-color));
			color: var(--pi-token-color) !important;
			forced-color-adjust: none;
			-webkit-background-clip: text;
			-webkit-text-fill-color: var(--pi-token-color) !important;
		}
		.tool-output {
			background: #0a0c10;
		}
		.tool-code-output {
			background: #0a0c10;
		}
		pre.canvas-code-block {
			position: relative;
		}
		pre.canvas-code-block .canvas-code-source {
			opacity: 0;
		}
		pre.canvas-code-block .code-canvas {
			position: absolute;
			top: 10px;
			left: 10px;
			pointer-events: none;
		}
		.message-content code,
		.tool-pre code {
			color: var(--vscode-editor-foreground);
			font-family: var(--vscode-editor-font-family);
			font-size: 0.96em;
		}
		.code-line {
			display: block;
			min-height: 1.45em;
			overflow-wrap: normal;
			white-space: pre;
		}
		.code-keyword {
			color: #ff7b72 !important;
			-webkit-text-fill-color: #ff7b72 !important;
		}
		.code-json-key {
			color: #72f088 !important;
			-webkit-text-fill-color: #72f088 !important;
		}
		.code-string {
			color: #a5d6ff !important;
			-webkit-text-fill-color: #a5d6ff !important;
		}
		.code-file-path {
			color: #dbb7ff !important;
			-webkit-text-fill-color: #dbb7ff !important;
		}
		.code-number {
			color: #79c0ff !important;
			-webkit-text-fill-color: #79c0ff !important;
		}
		.code-comment {
			color: #8b949e !important;
			-webkit-text-fill-color: #8b949e !important;
			font-style: italic;
		}
		.diff-add {
			color: var(--vscode-gitDecoration-addedResourceForeground);
			background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 12%, transparent);
		}
		.diff-delete {
			color: var(--vscode-gitDecoration-deletedResourceForeground);
			background: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 12%, transparent);
		}
		.diff-hunk {
			color: var(--vscode-editorLineNumber-activeForeground);
			background: var(--vscode-editor-selectionBackground);
		}
		.diff-header {
			color: var(--vscode-descriptionForeground);
			font-weight: 600;
		}
		.diff-prefix {
			user-select: none;
		}
		.message-content :not(pre) > code {
			padding: 0 1px;
			border-radius: 0;
			color: var(--vscode-terminal-ansiCyan, #4ec9b0);
			background: transparent;
			font-weight: 500;
			-webkit-text-fill-color: var(--vscode-terminal-ansiCyan, #4ec9b0);
		}
		.message-content :not(pre) > code.inline-code-package {
			color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
			-webkit-text-fill-color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
		}
		.message-content :not(pre) > code.inline-code-key,
		.message-content :not(pre) > code.inline-code-path {
			color: var(--vscode-textLink-foreground, #79c0ff);
			-webkit-text-fill-color: var(--vscode-textLink-foreground, #79c0ff);
		}
		.message-content :not(pre) > code.inline-code-string {
			color: var(--vscode-debugTokenExpression-string, #ce9178);
			-webkit-text-fill-color: var(--vscode-debugTokenExpression-string, #ce9178);
		}
		.message-content :not(pre) > code.inline-code-version {
			color: var(--vscode-debugTokenExpression-number, #b5cea8);
			-webkit-text-fill-color: var(--vscode-debugTokenExpression-number, #b5cea8);
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
		.code-section {
			margin: 8px 0;
			border: 1px solid var(--vscode-panel-border);
			background: var(--vscode-textCodeBlock-background);
		}
		.code-section > summary {
			cursor: pointer;
		}
		.code-section .code-header {
			margin: 0;
			border: 0;
		}
		.code-section > pre {
			margin: 0;
			border: 0;
			border-top: 1px solid var(--vscode-panel-border);
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
			justify-content: space-between;
			gap: 10px;
			margin-bottom: 6px;
			color: var(--vscode-foreground);
		}
		.tool-name {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-weight: 600;
		}
		.tool-status {
			flex: 0 0 auto;
			color: var(--vscode-descriptionForeground);
			font-size: 0.9em;
		}
		.tool-title {
			margin-bottom: 6px;
			color: var(--vscode-descriptionForeground);
		}
		.tool-section {
			margin-top: 6px;
		}
		.tool-section-label {
			margin-bottom: 3px;
			color: var(--vscode-descriptionForeground);
			font-size: 0.9em;
		}
		.tool-text-output {
			font-family: var(--vscode-editor-font-family);
			font-size: var(--vscode-editor-font-size);
			line-height: 1.45;
			overflow-wrap: normal;
		}
		.tool-output-line {
			min-height: 1.45em;
			white-space: pre-wrap;
		}
		.tool-result {
			margin-top: 6px;
			color: var(--vscode-descriptionForeground);
			font-size: 0.95em;
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
			padding: 10px;
			border-left: 2px solid var(--vscode-textLink-foreground);
			background: var(--vscode-editor-background);
		}
		.approval-warning {
			border-left-color: var(--vscode-editorWarning-foreground);
		}
		.approval-danger {
			border-left-color: var(--vscode-errorForeground);
		}
		.approval-reviewed {
			background: var(--vscode-sideBar-background);
		}
		.approval-header {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 8px;
			margin-bottom: 4px;
		}
		.approval-action {
			font-weight: 600;
			overflow-wrap: anywhere;
		}
		.approval-status {
			flex: 0 0 auto;
			padding: 1px 6px;
			border: 1px solid var(--vscode-sideBar-border);
			color: var(--vscode-descriptionForeground);
			font-size: 0.85em;
		}
		.approval-danger .approval-status {
			color: var(--vscode-errorForeground);
			border-color: var(--vscode-errorForeground);
		}
		.approval-reviewed .approval-status {
			color: var(--vscode-textLink-foreground);
			border-color: var(--vscode-textLink-foreground);
		}
		.approval-target {
			margin-bottom: 3px;
			font-family: var(--vscode-editor-font-family);
			font-size: 0.95em;
			overflow-wrap: anywhere;
		}
		.approval-scope {
			margin-bottom: 6px;
			color: var(--vscode-descriptionForeground);
			overflow-wrap: anywhere;
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
		button:disabled {
			opacity: 0.55;
			cursor: default;
		}
		.composer {
			padding: 0 12px 8px;
		}
		.composer-box {
			border: 1px solid var(--vscode-focusBorder, var(--vscode-inputOption-activeBorder));
			border-radius: 8px;
			background: var(--vscode-input-background);
			box-shadow: 0 0 0 1px color-mix(in srgb, var(--vscode-focusBorder) 18%, transparent);
		}
		.composer-toolbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 6px;
			min-width: 0;
			padding: 0 6px 6px;
		}
		.composer-tools,
		.composer-actions {
			display: flex;
			align-items: center;
			gap: 3px;
			color: var(--vscode-descriptionForeground);
		}
		.composer-tools {
			flex: 1;
			min-width: 0;
		}
		.tool-button,
		.send-button {
			height: 26px;
			border: 0;
			border-radius: 5px;
			font: inherit;
		}
		.tool-button {
			min-width: 26px;
			padding: 0 7px;
			color: var(--vscode-descriptionForeground);
			background: transparent;
			cursor: pointer;
		}
		.tool-button:hover,
		.send-button:hover {
			color: var(--vscode-foreground);
			background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
		}
		.select-trigger {
			display: flex;
			align-items: center;
			gap: 6px;
			height: 26px;
			max-width: 140px;
			min-width: 0;
			padding: 0 7px;
			border: 0;
			border-radius: 5px;
			color: var(--vscode-descriptionForeground);
			background: transparent;
			cursor: pointer;
			font: inherit;
		}
		.select-trigger:hover,
		.select-trigger[aria-expanded="true"] {
			color: var(--vscode-foreground);
			background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
		}
		.select-label {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.select-icon {
			flex: 0 0 auto;
		}
		#mode {
			flex: 0 0 auto;
		}
		.select-menu {
			position: absolute;
			z-index: 8;
			display: flex;
			flex-direction: column;
			width: min(280px, calc(100vw - 24px));
			padding: 5px;
			border: 1px solid var(--vscode-panel-border);
			border-radius: 7px;
			background: var(--vscode-quickInput-background, var(--vscode-editorWidget-background));
			box-shadow: 0 8px 28px var(--vscode-widget-shadow);
		}
		.select-menu[hidden] {
			display: none;
		}
		.select-menu-header {
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 5px 7px 6px;
			color: var(--vscode-foreground);
			font-size: 0.95em;
			font-weight: 600;
		}
		.select-menu-icon {
			color: var(--vscode-descriptionForeground);
		}
		.select-option {
			display: flex;
			align-items: center;
			gap: 6px;
			width: 100%;
			min-height: 28px;
			padding: 4px 7px;
			border: 1px solid transparent;
			border-radius: 5px;
			color: var(--vscode-foreground);
			background: transparent;
			cursor: pointer;
			font: inherit;
			text-align: left;
		}
		.select-option:hover,
		.select-option.active {
			border-color: var(--vscode-focusBorder);
			background: var(--vscode-list-hoverBackground);
		}
		.select-option-label {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.select-option-text {
			display: flex;
			flex: 1;
			flex-direction: column;
			min-width: 0;
		}
		.select-option-description {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			color: var(--vscode-descriptionForeground);
			font-size: 0.82em;
		}
		.model-status {
			flex: 1 1 auto;
			height: 26px;
			max-width: 220px;
			padding: 0 7px;
			border: 0;
			border-radius: 5px;
			color: var(--vscode-descriptionForeground);
			background: transparent;
			cursor: pointer;
			font: inherit;
			line-height: 26px;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.model-status:hover {
			color: var(--vscode-foreground);
			background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
		}
		.statusbar {
			display: flex;
			align-items: center;
			gap: 10px;
			min-width: 0;
			padding: 6px 2px 0;
			color: var(--vscode-descriptionForeground);
			font-size: 0.9em;
		}
		.status-item {
			display: flex;
			align-items: center;
			gap: 4px;
			min-width: 0;
		}
		#approvalMode {
			max-width: 180px;
		}
		textarea {
			box-sizing: border-box;
			width: 100%;
			min-height: 58px;
			max-height: 180px;
			resize: none;
			padding: 12px 10px 8px;
			color: var(--vscode-input-foreground);
			background: transparent;
			border: 0;
			outline: 0;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
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
		.send-button.active {
			background: var(--vscode-button-hoverBackground);
		}
		.send-button {
			width: 26px;
			flex: 0 0 26px;
			padding: 0;
			color: var(--vscode-descriptionForeground);
			background: transparent;
			cursor: pointer;
			line-height: 26px;
		}
		.send-button:disabled {
			opacity: 0.45;
			cursor: default;
		}
		.send-button[hidden] {
			display: none;
		}`;
}
