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
		.session-control {
			position: absolute;
			top: 10px;
			right: 10px;
			z-index: 3;
			display: flex;
			max-width: calc(100% - 20px);
		}
		.session-history-button {
			display: flex;
			align-items: center;
			gap: 7px;
			max-width: 190px;
			height: 28px;
			padding: 0 8px;
			border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
			border-radius: 6px;
			color: var(--vscode-descriptionForeground);
			background: color-mix(in srgb, var(--vscode-sideBar-background) 90%, transparent);
			cursor: pointer;
			font: inherit;
		}
		.session-history-button:hover {
			color: var(--vscode-foreground);
			background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
		}
		.current-session-label {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.history-icon {
			flex: 0 0 auto;
			font-size: 15px;
			line-height: 1;
		}
		.session-panel {
			position: absolute;
			top: 46px;
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
			padding: 9px 11px;
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			color: var(--vscode-descriptionForeground);
			background: var(--vscode-textCodeBlock-background);
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
			width: min(360px, calc(100vw - 24px));
			padding: 8px;
			border: 1px solid var(--vscode-panel-border);
			border-radius: 10px;
			background: var(--vscode-quickInput-background, var(--vscode-editorWidget-background));
			box-shadow: 0 8px 28px var(--vscode-widget-shadow);
		}
		.select-menu[hidden] {
			display: none;
		}
		.select-menu-header {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 7px 10px 9px;
			color: var(--vscode-foreground);
			font-size: 1.05em;
			font-weight: 600;
		}
		.select-menu-icon {
			color: var(--vscode-descriptionForeground);
		}
		.select-option {
			display: flex;
			align-items: center;
			gap: 8px;
			width: 100%;
			min-height: 34px;
			padding: 6px 10px;
			border: 1px solid transparent;
			border-radius: 6px;
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
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.select-option-shortcut {
			color: var(--vscode-descriptionForeground);
			font-size: 0.9em;
		}
		.model-status {
			height: 26px;
			padding: 0 7px;
			border-radius: 5px;
			color: var(--vscode-descriptionForeground);
			line-height: 26px;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
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
