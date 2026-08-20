export type PermissionMode = "ask" | "plan" | "code";
export type ApprovalMode = "ask" | "auto";

export interface ToolMessage {
	name: string;
	status: "running" | "completed" | "failed";
	args?: string;
	output?: string;
	title?: string;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system" | "tool" | "error";
	text: string;
	working?: boolean;
	tool?: ToolMessage;
}

export type ApprovalAction = "review" | "apply" | "reject";
export type ApprovalBatchAction = "review" | "apply" | "reject";

export interface ApprovalPrompt {
	id: string;
	text: string;
	detail?: string;
	action?: string;
	target?: string;
	scope?: string;
	risk?: "normal" | "warning" | "danger";
}

export interface ModelStatus {
	label: string;
	detail: string;
}

export interface SessionSummary {
	path: string;
	label: string;
	detail: string;
	active: boolean;
}

export type HostToWebviewMessage =
	| {
			type: "state";
			messages: ChatMessage[];
			running: boolean;
			permissionMode: PermissionMode;
			approvalMode: ApprovalMode;
			approvals: ApprovalPrompt[];
			modelStatus: ModelStatus | undefined;
			sessions: SessionSummary[];
			activeSessionPath: string | undefined;
	  }
	| { type: "append"; message: ChatMessage }
	| { type: "appendDelta"; id: string; delta: string }
	| { type: "replace"; id: string; role?: ChatMessage["role"]; text: string; working?: boolean; tool?: ToolMessage }
	| { type: "running"; running: boolean }
	| { type: "modelStatus"; modelStatus: ModelStatus | undefined }
	| { type: "sessions"; sessions: SessionSummary[]; activeSessionPath: string | undefined }
	| { type: "approvalRequested"; approval: ApprovalPrompt }
	| { type: "approvalResolved"; id: string }
	| { type: "prefill"; text: string }
	| { type: "toggleSessionHistory" };

export type WebviewToHostMessage =
	| { type: "ready" }
	| { type: "send"; text: string }
	| { type: "stop" }
	| { type: "new" }
	| { type: "switchSession"; path: string }
	| { type: "setPermissionMode"; permissionMode: PermissionMode }
	| { type: "setApprovalMode"; approvalMode: ApprovalMode }
	| { type: "approvalResponse"; id: string; action: ApprovalAction }
	| { type: "approvalBatchResponse"; action: ApprovalBatchAction }
	| { type: "openFile"; path: string; line?: number; character?: number };

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function parseWebviewMessage(value: unknown): WebviewToHostMessage | undefined {
	if (!isRecord(value) || typeof value.type !== "string") {
		return undefined;
	}

	if (value.type === "ready" || value.type === "stop" || value.type === "new") {
		return { type: value.type };
	}

	if (value.type === "send" && typeof value.text === "string") {
		return { type: "send", text: value.text };
	}

	if (value.type === "switchSession" && typeof value.path === "string") {
		return { type: "switchSession", path: value.path };
	}

	if (
		value.type === "setPermissionMode" &&
		(value.permissionMode === "ask" || value.permissionMode === "plan" || value.permissionMode === "code")
	) {
		return { type: "setPermissionMode", permissionMode: value.permissionMode };
	}

	if (value.type === "setApprovalMode" && (value.approvalMode === "ask" || value.approvalMode === "auto")) {
		return { type: "setApprovalMode", approvalMode: value.approvalMode };
	}

	if (
		value.type === "approvalResponse" &&
		typeof value.id === "string" &&
		(value.action === "review" || value.action === "apply" || value.action === "reject")
	) {
		return { type: "approvalResponse", id: value.id, action: value.action };
	}

	if (
		value.type === "approvalBatchResponse" &&
		(value.action === "review" || value.action === "apply" || value.action === "reject")
	) {
		return { type: "approvalBatchResponse", action: value.action };
	}

	if (value.type === "openFile" && typeof value.path === "string") {
		const line = typeof value.line === "number" && Number.isFinite(value.line) ? value.line : undefined;
		const character =
			typeof value.character === "number" && Number.isFinite(value.character) ? value.character : undefined;
		return { type: "openFile", path: value.path, line, character };
	}

	return undefined;
}
