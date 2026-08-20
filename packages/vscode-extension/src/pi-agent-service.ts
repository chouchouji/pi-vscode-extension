import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
	type AgentSession,
	type AgentSessionEvent,
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	type SessionEntry,
	type SessionInfo,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import mcpAdapter from "@earendil-works/pi-mcp-adapter";
import * as vscode from "vscode";
import type {
	ChatMessage,
	FeedbackRating,
	ModelStatus,
	PermissionMode,
	SessionSummary,
	ToolMessage,
} from "./protocol.ts";
import {
	type ApplyEditRequest,
	type ApplyEditsRequest,
	createVsCodeToolDefinitions,
	type DeleteFileRequest,
	type RenameFileRequest,
	type RenameSymbolRequest,
	type WriteFileRequest,
} from "./vscode-tools.ts";

export type PiAgentServiceEvent =
	| { type: "append"; message: ChatMessage }
	| { type: "appendDelta"; id: string; delta: string }
	| { type: "replace"; id: string; role?: ChatMessage["role"]; text: string; working?: boolean; tool?: ToolMessage }
	| { type: "running"; running: boolean }
	| { type: "modelStatus"; modelStatus: ModelStatus | undefined };

export interface PiAgentServiceOptions {
	cwd: string;
	agentDir?: string;
	extensionPath: string;
	permissionMode: PermissionMode;
	onEvent: (event: PiAgentServiceEvent) => void;
	confirmApplyEdit: (request: ApplyEditRequest) => Promise<boolean>;
	confirmApplyEdits: (request: ApplyEditsRequest) => Promise<boolean>;
	confirmWriteFile: (request: WriteFileRequest) => Promise<boolean>;
	confirmDeleteFile: (request: DeleteFileRequest) => Promise<boolean>;
	confirmRenameFile: (request: RenameFileRequest) => Promise<boolean>;
	confirmRenameSymbol: (request: RenameSymbolRequest) => Promise<boolean>;
}

const FEEDBACK_UPLOAD_URL = "https://pi.dev/api/feedback";

interface FeedbackBundle {
	version: 1;
	feedbackEventId: string;
	createdAt: string;
	rating: FeedbackRating;
	target: {
		entryId: string;
		entryIndex: number;
		entry: SessionEntry;
	};
	generationContext: {
		entries: SessionEntry[];
	};
	feedbackContext: {
		lastEntryIdAtFeedback: string | undefined;
		entryCountAtFeedback: number;
	};
}

function createId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function contentToText(content: AgentSessionEvent extends never ? never : unknown): string {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.map((part: unknown) => {
			if (typeof part !== "object" || part === null) {
				return "";
			}
			const record = part as Record<string, unknown>;
			return record.type === "text" && typeof record.text === "string" ? record.text : "";
		})
		.join("");
}

function messageContentToText(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}
	return content
		.map((part: unknown) => {
			if (typeof part !== "object" || part === null) {
				return "";
			}
			const record = part as Record<string, unknown>;
			return record.type === "text" && typeof record.text === "string" ? record.text : "";
		})
		.join("");
}

function formatToolResultText(event: Extract<AgentSessionEvent, { type: "tool_execution_end" }>): string {
	return formatToolOutput(event.result, event.isError);
}

function formatToolOutput(result: unknown, isError: boolean): string {
	if (typeof result !== "object" || result === null) {
		return isError ? "Tool failed." : "Tool completed.";
	}

	const record = result as Record<string, unknown>;
	const parts: readonly unknown[] = Array.isArray(record.content) ? record.content : [];
	const content = parts
		.map((part: unknown) => {
			if (typeof part !== "object" || part === null) {
				return "";
			}
			const record = part as Record<string, unknown>;
			return record.type === "text" && typeof record.text === "string" ? record.text : "[image]";
		})
		.join("\n");
	return content.trim() || (isError ? "Tool failed." : "Tool completed.");
}

function formatToolTitle(result: unknown): string | undefined {
	if (typeof result !== "object" || result === null) {
		return undefined;
	}
	const record = result as Record<string, unknown>;
	const details = record.details;
	if (typeof details !== "object" || details === null) {
		return undefined;
	}
	const title = (details as Record<string, unknown>).title;
	return typeof title === "string" && title.trim() ? title : undefined;
}

function formatUnknown(value: unknown): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value, undefined, 2);
	} catch {
		return String(value);
	}
}

function sessionLabel(session: SessionInfo): string {
	const name = session.name?.trim();
	if (name) {
		return name;
	}
	const firstMessage = session.firstMessage.trim().split("\n")[0]?.trim();
	if (firstMessage) {
		return firstMessage.length > 48 ? `${firstMessage.slice(0, 45)}...` : firstMessage;
	}
	return `Session ${session.id.slice(0, 8)}`;
}

function sessionDetail(session: SessionInfo): string {
	return `${session.modified.toISOString()} - ${session.messageCount} messages`;
}

function chatMessagesFromEntries(entries: SessionEntry[]): ChatMessage[] {
	const messages: ChatMessage[] = [];
	for (const entry of entries) {
		if (entry.type !== "message") {
			continue;
		}

		const message = entry.message;
		switch (message.role) {
			case "user":
				messages.push({
					id: entry.id,
					role: "user",
					text: messageContentToText(message.content),
				});
				break;
			case "assistant":
				messages.push({
					id: entry.id,
					role: message.errorMessage ? "error" : "assistant",
					text: message.errorMessage ?? messageContentToText(message.content),
				});
				break;
			case "toolResult": {
				const output = messageContentToText(message.content);
				messages.push({
					id: entry.id,
					role: message.isError ? "error" : "tool",
					text: `${message.toolName}: ${output}`,
					tool: {
						name: message.toolName,
						status: message.isError ? "failed" : "completed",
						output,
					},
				});
				break;
			}
			case "bashExecution":
				messages.push({
					id: entry.id,
					role: message.exitCode === 0 && !message.cancelled ? "tool" : "error",
					text: `bash: ${message.output}`,
					tool: {
						name: "bash",
						status: message.exitCode === 0 && !message.cancelled ? "completed" : "failed",
						args: message.command,
						output: message.output,
					},
				});
				break;
			case "custom":
				if (message.display) {
					messages.push({
						id: entry.id,
						role: "system",
						text: messageContentToText(message.content),
					});
				}
				break;
		}
	}
	return messages;
}

const READ_ONLY_TOOL_NAMES = ["read", "ls", "find", "grep"];
const CODE_TOOL_NAMES = [...READ_ONLY_TOOL_NAMES, "bash"];
const MUTATING_BUILTIN_TOOL_NAMES = ["edit", "write"];

function getModelStatus(session: AgentSession): ModelStatus | undefined {
	const model = session.model;
	if (!model) {
		return undefined;
	}

	const thinkingSuffix = session.thinkingLevel === "off" ? "" : `, thinking ${session.thinkingLevel}`;
	return {
		label: `${model.provider}/${model.name || model.id}`,
		detail: `${model.provider}/${model.id}${thinkingSuffix}`,
	};
}

export class PiAgentService {
	private session?: AgentSession;
	private sessionManager?: SessionManager;
	private unsubscribe?: () => void;
	private assistantMessageId?: string;
	private readonly chatMessageEntryIds = new Map<string, string>();
	private readonly pendingAssistantMessageEntryIndexes = new Map<string, number>();
	private readonly toolMessageIds = new Map<string, string>();
	private running = false;
	private readonly cwd: string;
	private readonly agentDir?: string;
	private readonly extensionPath: string;
	private permissionMode: PermissionMode;
	private readonly onEvent: (event: PiAgentServiceEvent) => void;
	private readonly confirmApplyEdit: (request: ApplyEditRequest) => Promise<boolean>;
	private readonly confirmApplyEdits: (request: ApplyEditsRequest) => Promise<boolean>;
	private readonly confirmWriteFile: (request: WriteFileRequest) => Promise<boolean>;
	private readonly confirmDeleteFile: (request: DeleteFileRequest) => Promise<boolean>;
	private readonly confirmRenameFile: (request: RenameFileRequest) => Promise<boolean>;
	private readonly confirmRenameSymbol: (request: RenameSymbolRequest) => Promise<boolean>;

	constructor(options: PiAgentServiceOptions) {
		this.cwd = resolve(options.cwd);
		this.agentDir = options.agentDir;
		this.extensionPath = options.extensionPath;
		this.permissionMode = options.permissionMode;
		this.onEvent = options.onEvent;
		this.confirmApplyEdit = options.confirmApplyEdit;
		this.confirmApplyEdits = options.confirmApplyEdits;
		this.confirmWriteFile = options.confirmWriteFile;
		this.confirmDeleteFile = options.confirmDeleteFile;
		this.confirmRenameFile = options.confirmRenameFile;
		this.confirmRenameSymbol = options.confirmRenameSymbol;
	}

	setPermissionMode(permissionMode: PermissionMode): void {
		if (this.permissionMode === permissionMode) {
			return;
		}
		this.permissionMode = permissionMode;
		this.disposeSession();
	}

	async newSession(): Promise<void> {
		const session = await this.ensureSession();
		const sessionDir = session.sessionManager.getSessionDir();
		this.disposeSession();
		this.chatMessageEntryIds.clear();
		this.pendingAssistantMessageEntryIndexes.clear();
		this.sessionManager = SessionManager.create(this.cwd, sessionDir);
		await this.ensureSession();
	}

	async switchSession(path: string): Promise<void> {
		const sessionDir = this.sessionManager?.getSessionDir();
		this.disposeSession();
		this.chatMessageEntryIds.clear();
		this.pendingAssistantMessageEntryIndexes.clear();
		this.sessionManager = SessionManager.open(path, sessionDir, this.cwd);
		await this.ensureSession();
	}

	async listSessions(): Promise<SessionSummary[]> {
		const session = await this.ensureSession();
		const currentPath = this.sessionManager?.getSessionFile();
		const sessions = await SessionManager.list(this.cwd, session.sessionManager.getSessionDir());
		return sessions.slice(0, 30).map((session) => ({
			path: session.path,
			label: sessionLabel(session),
			detail: sessionDetail(session),
			active: currentPath === session.path,
		}));
	}

	getActiveSessionPath(): string | undefined {
		return this.sessionManager?.getSessionFile();
	}

	getSessionMessages(): ChatMessage[] {
		return this.sessionManager ? chatMessagesFromEntries(this.sessionManager.buildContextEntries()) : [];
	}

	async rateMessage(chatMessageId: string, rating: FeedbackRating): Promise<FeedbackRating> {
		const session = await this.ensureSession();
		const sessionManager = session.sessionManager;
		const entries = sessionManager.getEntries();
		const contextEntries = sessionManager.buildContextEntries();
		const targetEntryId = this.resolveFeedbackTargetEntryId(chatMessageId, entries);
		const targetEntry = entries.find((entry) => entry.id === targetEntryId);
		if (!targetEntry || targetEntry.type !== "message" || targetEntry.message.role !== "assistant") {
			throw new Error("Only assistant messages can be rated.");
		}

		const createdAt = new Date().toISOString();
		const bundle = this.createFeedbackBundle(rating, targetEntry, entries, contextEntries, createdAt);
		void this.uploadFeedbackBundle(bundle);
		return rating;
	}

	async prompt(text: string): Promise<void> {
		const session = await this.ensureSession();
		this.running = true;
		this.onEvent({ type: "running", running: true });
		try {
			await session.prompt(text, { source: "interactive" });
		} catch (error) {
			this.onEvent({
				type: "append",
				message: {
					id: createId("error"),
					role: "error",
					text: error instanceof Error ? error.message : String(error),
				},
			});
			this.running = false;
			this.onEvent({ type: "running", running: false });
		}
	}

	async abort(): Promise<void> {
		if (!this.session || !this.running) {
			return;
		}
		await this.session.abort();
		this.running = false;
		this.onEvent({ type: "running", running: false });
	}

	dispose(): void {
		this.disposeSession();
	}

	private async ensureSession(): Promise<AgentSession> {
		if (this.session) {
			return this.session;
		}

		const customTools = createVsCodeToolDefinitions(
			{
				cwd: this.cwd,
				confirmApplyEdit: this.confirmApplyEdit,
				confirmApplyEdits: this.confirmApplyEdits,
				confirmWriteFile: this.confirmWriteFile,
				confirmDeleteFile: this.confirmDeleteFile,
				confirmRenameFile: this.confirmRenameFile,
				confirmRenameSymbol: this.confirmRenameSymbol,
			},
			this.permissionMode,
		);
		const agentDir = this.agentDir ? resolve(this.agentDir) : getAgentDir();
		const bundledSkillPaths = this.getBundledSkillPaths();
		const resourceLoader = new DefaultResourceLoader({
			cwd: this.cwd,
			agentDir,
			extensionFactories: [mcpAdapter],
			additionalSkillPaths: bundledSkillPaths,
			appendSystemPrompt: this.getPermissionModeSystemPrompt(),
		});
		await resourceLoader.reload();

		const activeBuiltinToolNames = this.permissionMode === "code" ? CODE_TOOL_NAMES : READ_ONLY_TOOL_NAMES;
		const result = await createAgentSession({
			cwd: this.cwd,
			agentDir,
			excludeTools:
				this.permissionMode === "code" ? MUTATING_BUILTIN_TOOL_NAMES : [...MUTATING_BUILTIN_TOOL_NAMES, "bash"],
			customTools,
			resourceLoader,
			sessionManager: this.sessionManager,
			sessionStartEvent: { type: "session_start", reason: "startup" },
		});
		await result.session.bindExtensions({
			onError: (error) => {
				console.warn(`Extension error (${error.extensionPath}): ${error.error}`);
			},
		});
		result.session.setActiveToolsByName([
			...activeBuiltinToolNames,
			...result.session
				.getAllTools()
				.filter((tool) => tool.sourceInfo.source !== "builtin")
				.map((tool) => tool.name),
		]);
		this.session = result.session;
		this.sessionManager = result.session.sessionManager;
		this.unsubscribe = result.session.subscribe((event) => this.handleSessionEvent(event));
		this.emitModelStatus();
		for (const diagnostic of result.session.modelRuntime ? [] : []) {
			console.warn(diagnostic);
		}
		if (result.modelFallbackMessage) {
			this.onEvent({
				type: "append",
				message: { id: createId("system"), role: "system", text: result.modelFallbackMessage },
			});
		}
		return result.session;
	}

	private resolveFeedbackTargetEntryId(chatMessageId: string, entries: SessionEntry[]): string {
		this.bindAssistantMessageEntry(chatMessageId);

		const mapped = this.chatMessageEntryIds.get(chatMessageId);
		if (mapped) {
			return mapped;
		}

		const direct = entries.find((entry) => entry.id === chatMessageId);
		if (direct) {
			return direct.id;
		}

		throw new Error("Could not resolve rated message in the current session.");
	}

	private bindAssistantMessageEntry(chatMessageId: string): void {
		const sessionManager = this.sessionManager;
		const entryIndex = this.pendingAssistantMessageEntryIndexes.get(chatMessageId);
		if (!sessionManager || entryIndex === undefined) {
			return;
		}
		const entries = sessionManager.getEntries();
		for (const entry of entries.slice(entryIndex)) {
			if (entry.type !== "message" || entry.message.role !== "assistant") {
				continue;
			}
			this.chatMessageEntryIds.set(chatMessageId, entry.id);
			this.pendingAssistantMessageEntryIndexes.delete(chatMessageId);
			return;
		}
	}

	private createFeedbackBundle(
		rating: FeedbackRating,
		targetEntry: SessionEntry,
		entries: SessionEntry[],
		contextEntries: SessionEntry[],
		createdAt: string,
	): FeedbackBundle {
		const targetEntryIndex = entries.indexOf(targetEntry);
		const targetContextEntryIndex = contextEntries.findIndex((entry) => entry.id === targetEntry.id);
		if (targetEntryIndex < 0 || targetContextEntryIndex < 0) {
			throw new Error("Could not resolve rated message in the current session.");
		}
		return {
			version: 1,
			feedbackEventId: createId("feedback"),
			createdAt,
			rating,
			target: {
				entryId: targetEntry.id,
				entryIndex: targetEntryIndex,
				entry: targetEntry,
			},
			generationContext: {
				entries: contextEntries.slice(0, targetContextEntryIndex + 1),
			},
			feedbackContext: {
				lastEntryIdAtFeedback: entries.at(-1)?.id,
				entryCountAtFeedback: entries.length,
			},
		};
	}

	private async uploadFeedbackBundle(bundle: FeedbackBundle): Promise<void> {
		try {
			const response = await fetch(FEEDBACK_UPLOAD_URL, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(bundle),
			});
			if (!response.ok) {
				console.warn(`Failed to upload feedback: HTTP ${response.status}`);
			}
		} catch (error) {
			console.warn("Failed to upload feedback.", error);
		}
	}

	private getBundledSkillPaths(): string[] {
		const skillRoot = resolve(this.extensionPath, "skills");
		if (!existsSync(skillRoot)) {
			return [];
		}

		if (existsSync(resolve(skillRoot, "SKILL.md"))) {
			return [skillRoot];
		}
		return readdirSync(skillRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => resolve(skillRoot, entry.name))
			.filter((skillPath) => existsSync(resolve(skillPath, "SKILL.md")));
	}

	private getPermissionModeSystemPrompt(): string[] {
		if (this.permissionMode === "ask") {
			return [
				[
					"You are in ask mode.",
					"Use read-only tools to inspect the workspace when needed.",
					"Answer questions, explain code, and identify risks, but do not claim that files were changed.",
					"If implementation is needed, ask the user to switch to code mode.",
				].join("\n"),
			];
		}

		if (this.permissionMode === "plan") {
			return [
				[
					"You are in plan mode.",
					"Use read-only tools to inspect the workspace.",
					"Do not edit files, run shell commands, or claim that changes were made.",
					"Produce a concrete implementation plan with affected files, risks, and verification steps.",
					"Wait for the user to switch to code mode before making changes.",
				].join("\n"),
			];
		}

		return [];
	}

	private disposeSession(): void {
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.session?.dispose();
		this.session = undefined;
		this.assistantMessageId = undefined;
		this.chatMessageEntryIds.clear();
		this.pendingAssistantMessageEntryIndexes.clear();
		this.toolMessageIds.clear();
		this.running = false;
		this.onEvent({ type: "running", running: false });
		this.emitModelStatus();
	}

	private handleSessionEvent(event: AgentSessionEvent): void {
		switch (event.type) {
			case "message_start": {
				if (event.message.role === "assistant") {
					const id = createId("assistant");
					this.assistantMessageId = id;
					this.onEvent({ type: "append", message: { id, role: "assistant", text: "", working: true } });
				} else if (event.message.role === "user") {
					const text = contentToText(event.message.content);
					if (text.trim()) {
						this.onEvent({ type: "append", message: { id: createId("user"), role: "user", text } });
					}
				}
				break;
			}
			case "message_update": {
				if (event.assistantMessageEvent.type === "text_delta" && this.assistantMessageId) {
					this.onEvent({
						type: "appendDelta",
						id: this.assistantMessageId,
						delta: event.assistantMessageEvent.delta,
					});
				}
				break;
			}
			case "message_end": {
				if (event.message.role === "assistant" && this.assistantMessageId) {
					const chatMessageId = this.assistantMessageId;
					const text = contentToText(event.message.content);
					const entryIndex = this.sessionManager?.getEntries().length;
					if (entryIndex !== undefined) {
						this.pendingAssistantMessageEntryIndexes.set(chatMessageId, entryIndex);
					}
					this.onEvent({
						type: "replace",
						id: chatMessageId,
						text,
						working: false,
					});
					setTimeout(() => this.bindAssistantMessageEntry(chatMessageId), 0);
					this.assistantMessageId = undefined;
				}
				break;
			}
			case "tool_execution_start": {
				const id = createId("tool");
				this.toolMessageIds.set(event.toolCallId, id);
				this.onEvent({
					type: "append",
					message: {
						id,
						role: "tool",
						text: `Running ${event.toolName}...`,
						working: true,
						tool: {
							name: event.toolName,
							status: "running",
							args: formatUnknown(event.args),
						},
					},
				});
				break;
			}
			case "tool_execution_update": {
				const id = this.toolMessageIds.get(event.toolCallId);
				if (!id) {
					break;
				}
				this.onEvent({
					type: "replace",
					id,
					text: `Running ${event.toolName}...`,
					working: true,
					tool: {
						name: event.toolName,
						status: "running",
						args: formatUnknown(event.args),
						output: formatToolOutput(event.partialResult, false),
						title: formatToolTitle(event.partialResult),
					},
				});
				break;
			}
			case "tool_execution_end": {
				const id = this.toolMessageIds.get(event.toolCallId);
				this.toolMessageIds.delete(event.toolCallId);
				const output = formatToolResultText(event);
				const message: ChatMessage = {
					id: id ?? createId("tool"),
					role: event.isError ? "error" : "tool",
					text: `${event.toolName}: ${output}`,
					working: false,
					tool: {
						name: event.toolName,
						status: event.isError ? "failed" : "completed",
						output,
						title: formatToolTitle(event.result),
					},
				};
				if (id) {
					this.onEvent({
						type: "replace",
						id,
						role: message.role,
						text: message.text,
						working: message.working,
						tool: message.tool,
					});
				} else {
					this.onEvent({ type: "append", message });
				}
				break;
			}
			case "agent_end":
			case "agent_settled":
				this.running = false;
				this.onEvent({ type: "running", running: false });
				break;
			case "entry_appended":
				if (event.entry.type === "model_change") {
					this.emitModelStatus();
				}
				break;
			case "thinking_level_changed":
				this.emitModelStatus();
				break;
		}
	}

	private emitModelStatus(): void {
		const session = this.session;
		this.onEvent({ type: "modelStatus", modelStatus: session ? getModelStatus(session) : undefined });
	}
}

export function getWorkspaceCwd(): string {
	const folder = vscode.workspace.workspaceFolders?.[0];
	return folder?.uri.fsPath ?? process.cwd();
}
