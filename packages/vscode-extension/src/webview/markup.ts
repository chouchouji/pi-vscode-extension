export function getWebviewBody(): string {
	return `	<div id="app">
		<div class="content">
			<div id="emptyState" class="empty-state">
				<div class="empty-mark">Pi</div>
				<div class="empty-title">Build with Pi</div>
				<div class="empty-subtitle">AI responses may be inaccurate</div>
			</div>
			<div id="messages" class="messages">
				<div id="sessionTime" class="session-time" hidden></div>
			</div>
			<div id="approvalBatch" class="approval-batch" hidden>
				<button id="reviewAll" class="secondary" type="button">Review all</button>
				<button id="applyAll" class="primary" type="button">Apply all</button>
				<button id="rejectAll" class="secondary" type="button">Reject all</button>
			</div>
			<div id="approvals" class="approvals"></div>
		</div>
		<div class="composer">
			<div id="selectMenu" class="select-menu" hidden></div>
			<div id="pendingQueue" class="pending-queue" hidden></div>
			<div id="runningHint" class="running-hint" hidden>
				<span class="running-hint-dot"></span>
				<span>Pi 正在运行 · Cmd/Ctrl+Enter 打断 · Alt+Enter 排队后发</span>
			</div>
			<div id="composerResize" class="composer-resize"></div>
			<div class="composer-box">
				<div id="completionMenu" class="completion-menu" hidden>
					<div id="completionMenuBody" class="completion-menu-body"></div>
				</div>
				<div class="composer-input">
					<textarea id="input" placeholder="Describe what to build"></textarea>
				</div>
				<div class="composer-toolbar">
					<div class="composer-tools">
						<button id="new" class="tool-button" type="button" title="New chat">+</button>
						<button id="mode" class="select-trigger" type="button" title="Workspace access">
							<span class="select-icon">◇</span>
							<span id="modeLabel" class="select-label">Code</span>
						</button>
						<button id="modelStatus" class="model-status" type="button" title="Select model">Models</button>
					</div>
					<div class="composer-actions">
						<button id="stop" class="send-button" type="button" title="Stop current response" disabled hidden>■</button>
						<button id="send" class="send-button" type="button" title="Send (Cmd+Enter); Alt+Enter queues follow-up while running">↑</button>
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
