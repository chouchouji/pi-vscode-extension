export function getWebviewBody(): string {
	return `	<div id="app">
		<div class="content">
			<div id="sessionPanel" class="session-panel" hidden>
				<div class="session-panel-header">
					<span>Chat history</span>
					<button id="sessionPanelClose" class="close-button" type="button" title="Close">×</button>
				</div>
				<input id="sessionSearch" class="session-search" type="search" placeholder="Search chats">
				<div id="sessionList" class="session-list"></div>
			</div>
			<div id="emptyState" class="empty-state">
				<div class="empty-mark">Pi</div>
				<div class="empty-title">Build with Pi</div>
				<div class="empty-subtitle">AI responses may be inaccurate</div>
			</div>
			<div id="messages" class="messages"></div>
			<div id="approvalBatch" class="approval-batch" hidden>
				<button id="reviewAll" class="secondary" type="button">Review all</button>
				<button id="applyAll" class="primary" type="button">Apply all</button>
				<button id="rejectAll" class="secondary" type="button">Reject all</button>
			</div>
			<div id="approvals" class="approvals"></div>
		</div>
		<div class="composer">
			<div id="selectMenu" class="select-menu" hidden></div>
			<div class="composer-box">
				<textarea id="input" placeholder="Describe what to build"></textarea>
				<div class="composer-toolbar">
					<div class="composer-tools">
						<button id="new" class="tool-button" type="button" title="New chat">+</button>
						<button id="mode" class="select-trigger" type="button" title="Workspace access">
							<span class="select-icon">◇</span>
							<span id="modeLabel" class="select-label">Code</span>
						</button>
						<div id="modelStatus" class="model-status" title="No model">Models</div>
					</div>
					<div class="composer-actions">
						<button id="stop" class="send-button" type="button" title="Stop current response" disabled hidden>■</button>
						<button id="send" class="send-button" type="button" title="Send">↑</button>
					</div>
				</div>
			</div>
			<div class="statusbar">
				<div class="status-item">Local</div>
				<div class="status-item">
					<button id="approvalMode" class="select-trigger" type="button" title="Edit approval">
						<span class="select-icon">◇</span>
						<span id="approvalModeLabel" class="select-label">Default</span>
					</button>
				</div>
			</div>
		</div>
	</div>`;
}
