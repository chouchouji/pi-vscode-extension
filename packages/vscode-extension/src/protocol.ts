import { isNumber, isObject, isString } from "rattail";

export type PermissionMode = "ask" | "plan" | "code";
export type ApprovalMode = "ask" | "auto";
export type StreamingBehavior = "steer" | "followUp";

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
	| { type: "queueUpdate"; steering: string[]; followUp: string[] }
	| { type: "modelStatus"; modelStatus: ModelStatus | undefined }
	| { type: "sessions"; sessions: SessionSummary[]; activeSessionPath: string | undefined }
	| { type: "approvalRequested"; approval: ApprovalPrompt }
	| { type: "approvalResolved"; id: string }
	| { type: "prefill"; text: string };

export interface WebviewRequestParams {
	ready: Record<string, never>;
	send: { text: string; streamingBehavior?: StreamingBehavior };
	stop: Record<string, never>;
	new: Record<string, never>;
	selectModel: Record<string, never>;
	showSessionPicker: Record<string, never>;
	clearQueue: Record<string, never>;
	switchSession: { path: string };
	setPermissionMode: { permissionMode: PermissionMode };
	setApprovalMode: { approvalMode: ApprovalMode };
	approvalResponse: { id: string; action: ApprovalAction };
	approvalBatchResponse: { action: ApprovalBatchAction };
	openFile: { path: string; line?: number; character?: number };
}

export type WebviewToHostMessage = {
	[Method in keyof WebviewRequestParams]: {
		method: Method;
		params: WebviewRequestParams[Method];
	};
}[keyof WebviewRequestParams];

export interface WebviewRequestEnvelope {
	kind: "request";
	id: string;
	request: WebviewToHostMessage;
}

export type WebviewResponseEnvelope =
	| { kind: "response"; id: string; ok: true; data?: unknown }
	| { kind: "response"; id: string; ok: false; error: { message: string } };

export interface HostToWebviewEventEnvelope {
	kind: "event";
	event: HostToWebviewMessage;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

export function parseWebviewMessage(value: unknown): WebviewRequestEnvelope | undefined {
	if (!isRecord(value) || value.kind !== "request" || !isString(value.id) || !isRecord(value.request)) {
		return;
	}

	const { id } = value;
	const method = value.request.method;
	const params = value.request.params;
	if (!isString(method) || !isRecord(params)) {
		return;
	}

	if (
		method === "ready" ||
		method === "stop" ||
		method === "new" ||
		method === "selectModel" ||
		method === "showSessionPicker" ||
		method === "clearQueue"
	) {
		return { kind: "request", id, request: { method, params: {} } };
	}

	if (method === "send" && isString(params.text)) {
		const streamingBehavior =
			params.streamingBehavior === "steer" || params.streamingBehavior === "followUp"
				? params.streamingBehavior
				: undefined;
		return { kind: "request", id, request: { method, params: { text: params.text, streamingBehavior } } };
	}

	if (method === "switchSession" && isString(params.path)) {
		return { kind: "request", id, request: { method, params: { path: params.path } } };
	}

	if (
		method === "setPermissionMode" &&
		(params.permissionMode === "ask" || params.permissionMode === "plan" || params.permissionMode === "code")
	) {
		return { kind: "request", id, request: { method, params: { permissionMode: params.permissionMode } } };
	}

	if (method === "setApprovalMode" && (params.approvalMode === "ask" || params.approvalMode === "auto")) {
		return { kind: "request", id, request: { method, params: { approvalMode: params.approvalMode } } };
	}

	if (
		method === "approvalResponse" &&
		isString(params.id) &&
		(params.action === "review" || params.action === "apply" || params.action === "reject")
	) {
		return { kind: "request", id, request: { method, params: { id: params.id, action: params.action } } };
	}

	if (
		method === "approvalBatchResponse" &&
		(params.action === "review" || params.action === "apply" || params.action === "reject")
	) {
		return { kind: "request", id, request: { method, params: { action: params.action } } };
	}

	if (method === "openFile" && isString(params.path)) {
		const line = isNumber(params.line) && Number.isFinite(params.line) ? params.line : undefined;
		const character = isNumber(params.character) && Number.isFinite(params.character) ? params.character : undefined;
		return { kind: "request", id, request: { method, params: { path: params.path, line, character } } };
	}

	return;
}
