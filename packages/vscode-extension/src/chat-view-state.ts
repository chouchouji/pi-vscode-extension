import type { PiAgentServiceEvent } from "./pi-agent-service.ts";
import type {
	ApprovalMode,
	ApprovalPrompt,
	ChatMessage,
	HostToWebviewMessage,
	ModelStatus,
	PermissionMode,
	SessionSummary,
} from "./protocol.ts";

export class PiChatViewState {
	private readonly messages: ChatMessage[] = [];
	private modelStatus: ModelStatus | undefined;
	private sessions: SessionSummary[] = [];
	private activeSessionPath: string | undefined;
	private running = false;
	private permissionMode: PermissionMode;

	constructor(permissionMode: PermissionMode) {
		this.permissionMode = permissionMode;
	}

	get isRunning(): boolean {
		return this.running;
	}

	get currentPermissionMode(): PermissionMode {
		return this.permissionMode;
	}

	get sessionSummaries(): SessionSummary[] {
		return this.sessions;
	}

	get currentSessionPath(): string | undefined {
		return this.activeSessionPath;
	}

	setPermissionMode(permissionMode: PermissionMode) {
		this.permissionMode = permissionMode;
	}

	resetSession() {
		this.messages.length = 0;
		this.running = false;
	}

	replaceSessionMessages(messages: ChatMessage[]) {
		this.messages.length = 0;
		this.messages.push(...messages);
		this.running = false;
	}

	setSessions(sessions: SessionSummary[], activeSessionPath: string | undefined) {
		this.sessions = sessions;
		this.activeSessionPath = activeSessionPath;
	}

	clearModelStatus() {
		this.modelStatus = undefined;
	}

	applyServiceEvent(event: PiAgentServiceEvent): HostToWebviewMessage {
		switch (event.type) {
			case "append":
				this.messages.push(event.message);
				break;
			case "appendDelta": {
				const message = this.messages.find((candidate) => candidate.id === event.id);
				if (message) {
					message.text += event.delta;
				}
				break;
			}
			case "replace": {
				const message = this.messages.find((candidate) => candidate.id === event.id);
				if (message) {
					if (event.role) {
						message.role = event.role;
					}
					message.text = event.text;
					message.working = event.working;
					message.tool = event.tool;
				}
				break;
			}
			case "running":
				this.running = event.running;
				break;
			case "queueUpdate":
				break;
			case "modelStatus":
				this.modelStatus = event.modelStatus;
				break;
		}
		return event;
	}

	createSessionsEvent(): HostToWebviewMessage {
		return {
			type: "sessions",
			sessions: this.sessions,
			activeSessionPath: this.activeSessionPath,
		};
	}

	createStateMessage(approvalMode: ApprovalMode, approvals: ApprovalPrompt[]): HostToWebviewMessage {
		return {
			type: "state",
			messages: this.messages,
			running: this.running,
			permissionMode: this.permissionMode,
			approvalMode,
			approvals,
			modelStatus: this.modelStatus,
			sessions: this.sessions,
			activeSessionPath: this.activeSessionPath,
		};
	}
}
