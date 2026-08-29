import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
	type AgentSession,
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	getDefaultSessionDir,
	ModelRuntime,
	SessionManager,
	SettingsManager,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { createMcpAdapter } from "@earendil-works/pi-mcp-adapter";
import * as vscode from "vscode";
import { AgentSessionEventMapper } from "./agent-service/agent-session-event-mapper.ts";
import { createId } from "./agent-service/chat-message-format.ts";
import type { PiAgentServiceEvent } from "./agent-service/events.ts";
import { chatMessagesFromEntries, listSessionSummaries } from "./agent-service/session-history.ts";
import type {
	ChatMessage,
	ModelStatus,
	PermissionMode,
	SessionSummary,
	SlashCommandItem,
	StreamingBehavior,
} from "./protocol.ts";
import {
	type ApplyEditsRequest,
	createApplyEditsToolDefinition,
	createDefinitionToolDefinition,
	createDeleteDirectoryToolDefinition,
	createDeleteFileToolDefinition,
	createDiagnosticsToolDefinition,
	createOpenEditorsToolDefinition,
	createReferencesToolDefinition,
	createRenameSymbolToolDefinition,
	createSelectionToolDefinition,
	createWorkspaceDiagnosticsToolDefinition,
	createWriteFileToolDefinition,
	type DeleteDirectoryRequest,
	type DeleteFileRequest,
	type RenameSymbolRequest,
	type WriteFileRequest,
} from "./tools/index.ts";

export type { PiAgentServiceEvent } from "./agent-service/events.ts";
export { listSessionSummaries } from "./agent-service/session-history.ts";

export interface PiAgentServiceOptions {
	cwd: string;
	agentDir?: string;
	extensionPath: string;
	permissionMode: PermissionMode;
	onEvent: (event: PiAgentServiceEvent) => void;
	confirmApplyEdits: (request: ApplyEditsRequest) => Promise<boolean>;
	confirmWriteFile: (request: WriteFileRequest) => Promise<boolean>;
	confirmDeleteFile: (request: DeleteFileRequest) => Promise<boolean>;
	confirmDeleteDirectory: (request: DeleteDirectoryRequest) => Promise<boolean>;
	confirmRenameSymbol: (request: RenameSymbolRequest) => Promise<boolean>;
}

export interface ModelSelection {
	provider: string;
	modelId: string;
	label: string;
	detail: string;
	configured: boolean;
	active: boolean;
}

type RuntimeModel = ReturnType<ModelRuntime["getModels"]>[number];

const READ_ONLY_TOOL_NAMES = ["read", "ls", "find", "grep"];
const CODE_TOOL_NAMES = [...READ_ONLY_TOOL_NAMES, "bash"];
const MUTATING_BUILTIN_TOOL_NAMES = ["edit", "write"];

function getModelStatus(session: AgentSession): ModelStatus | undefined {
	const model = session.model;
	if (!model) {
		return;
	}

	return modelStatusFromModel(
		model,
		session.thinkingLevel === "off" ? undefined : `thinking ${session.thinkingLevel}`,
	);
}

function modelStatusFromModel(model: RuntimeModel, suffix?: string): ModelStatus {
	return {
		label: model.name || model.id,
		detail: [model.provider, model.id].join("/").concat(suffix ? `, ${suffix}` : ""),
	};
}

function modelKey(provider: string, modelId: string): string {
	return `${provider}/${modelId}`;
}

export class PiAgentService {
	private session?: AgentSession;
	private sessionManager?: SessionManager;
	private unsubscribe?: () => void;
	private readonly eventMapper: AgentSessionEventMapper;
	private running = false;
	private readonly cwd: string;
	private readonly agentDir?: string;
	private readonly extensionPath: string;
	private permissionMode: PermissionMode;
	private modelRuntimePromise: Promise<ModelRuntime> | undefined;
	private readonly onEvent: (event: PiAgentServiceEvent) => void;
	private readonly confirmApplyEdits: (request: ApplyEditsRequest) => Promise<boolean>;
	private readonly confirmWriteFile: (request: WriteFileRequest) => Promise<boolean>;
	private readonly confirmDeleteFile: (request: DeleteFileRequest) => Promise<boolean>;
	private readonly confirmDeleteDirectory: (request: DeleteDirectoryRequest) => Promise<boolean>;
	private readonly confirmRenameSymbol: (request: RenameSymbolRequest) => Promise<boolean>;

	constructor(options: PiAgentServiceOptions) {
		this.cwd = resolve(options.cwd);
		this.agentDir = options.agentDir;
		this.extensionPath = options.extensionPath;
		this.permissionMode = options.permissionMode;
		this.onEvent = options.onEvent;
		this.confirmApplyEdits = options.confirmApplyEdits;
		this.confirmWriteFile = options.confirmWriteFile;
		this.confirmDeleteFile = options.confirmDeleteFile;
		this.confirmDeleteDirectory = options.confirmDeleteDirectory;
		this.confirmRenameSymbol = options.confirmRenameSymbol;
		this.eventMapper = new AgentSessionEventMapper({
			onEvent: (event) => this.onEvent(event),
			onModelChanged: () => this.emitModelStatus(),
			onRunningChanged: (running) => {
				this.running = running;
			},
		});
	}

	setPermissionMode(permissionMode: PermissionMode) {
		if (this.permissionMode === permissionMode) {
			return;
		}
		this.permissionMode = permissionMode;
		this.disposeSession();
	}

	async refreshModelStatus() {
		const sessionStatus = this.session ? getModelStatus(this.session) : undefined;
		if (sessionStatus) {
			this.onEvent({ type: "modelStatus", modelStatus: sessionStatus });
			return;
		}
		this.onEvent({
			type: "modelStatus",
			modelStatus: await this.getConfiguredModelStatus(),
		});
	}

	async listModelSelections(): Promise<ModelSelection[]> {
		const runtime = await this.ensureModelRuntime();
		const availableModels = [...(await runtime.getAvailable())];
		const availableKeys = new Set(availableModels.map((model) => modelKey(model.provider, model.id)));
		const models = availableModels.length > 0 ? availableModels : [...runtime.getModels()];
		const activeModel = this.session?.model;
		const activeKey = activeModel ? modelKey(activeModel.provider, activeModel.id) : this.getConfiguredModelKey();

		return models
			.map((model) => {
				const provider = runtime.getProvider(model.provider);
				const key = modelKey(model.provider, model.id);
				const configured = availableKeys.has(key);
				const label = `${model.provider}/${model.name || model.id}`;
				const detailParts = [provider?.name ?? model.provider, model.id];
				if (!configured && availableModels.length === 0) {
					detailParts.push("not available");
				}
				return {
					provider: model.provider,
					modelId: model.id,
					label,
					detail: detailParts.join(" - "),
					configured,
					active: key === activeKey,
				};
			})
			.sort((a, b) => a.label.localeCompare(b.label));
	}

	async selectModel(provider: string, modelId: string) {
		const runtime = await this.ensureModelRuntime();
		const model = runtime.getModel(provider, modelId);
		if (!model) {
			throw new Error(`Model not found: ${provider}/${modelId}`);
		}
		if (!(await runtime.checkAuth(model.provider))) {
			throw new Error(`Model is not available: ${provider}/${modelId}`);
		}
		if (this.session) {
			await this.session.setModel(model);
		} else {
			this.createFileSettingsManager().setDefaultModelAndProvider(provider, modelId);
		}
		this.onEvent({
			type: "modelStatus",
			modelStatus: modelStatusFromModel(model),
		});
	}

	async newSession() {
		const session = await this.ensureSession();
		const sessionDir = session.sessionManager.getSessionDir();
		this.disposeSession();
		this.sessionManager = SessionManager.create(this.cwd, sessionDir);
		await this.ensureSession();
	}

	async switchSession(path: string) {
		const sessionDir = this.getSessionDir();
		this.disposeSession();
		this.sessionManager = SessionManager.open(path, sessionDir, this.cwd);
		await this.ensureSession();
	}

	async listSessions(): Promise<SessionSummary[]> {
		const currentPath = this.sessionManager?.getSessionFile();
		return listSessionSummaries({
			cwd: this.cwd,
			agentDir: this.agentDir,
			activeSessionPath: currentPath,
		});
	}

	getActiveSessionPath(): string | undefined {
		return this.sessionManager?.getSessionFile();
	}

	getSessionMessages(): ChatMessage[] {
		return this.sessionManager ? chatMessagesFromEntries(this.sessionManager.buildContextEntries()) : [];
	}

	async listSlashCommands(): Promise<SlashCommandItem[]> {
		const session = await this.ensureSession();
		const templates = session.promptTemplates.map((template) => ({
			name: template.name,
			description: template.description,
		}));
		const skills = session.resourceLoader.getSkills().skills.map((skill) => ({
			name: `skill:${skill.name}`,
			description: skill.description,
		}));
		return [...templates, ...skills];
	}

	async prompt(text: string, streamingBehavior?: StreamingBehavior) {
		const session = await this.ensureSession();
		this.running = true;
		this.onEvent({ type: "running", running: true });
		try {
			await session.prompt(text, { source: "interactive", streamingBehavior });
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

	clearMessageQueue(): { steering: string[]; followUp: string[] } {
		return this.session?.clearQueue() ?? { steering: [], followUp: [] };
	}

	async abort() {
		if (!this.session || !this.running) {
			return;
		}
		await this.session.abort();
		this.running = false;
		this.onEvent({ type: "running", running: false });
	}

	dispose() {
		this.disposeSession();
	}

	private getResolvedAgentDir(): string {
		return this.agentDir ? resolve(this.agentDir) : getAgentDir();
	}

	async getModelRuntime(): Promise<ModelRuntime> {
		return this.ensureModelRuntime();
	}

	private ensureModelRuntime(): Promise<ModelRuntime> {
		if (!this.modelRuntimePromise) {
			const agentDir = this.agentDir ? resolve(this.agentDir) : undefined;
			this.modelRuntimePromise = ModelRuntime.create({
				authPath: agentDir ? resolve(agentDir, "auth.json") : undefined,
				modelsPath: agentDir ? resolve(agentDir, "models.json") : undefined,
			});
		}
		return this.modelRuntimePromise;
	}

	private createFileSettingsManager(): SettingsManager {
		return SettingsManager.create(this.cwd, this.getResolvedAgentDir());
	}

	private createSessionSettingsManager(): SettingsManager {
		return this.createFileSettingsManager();
	}

	private getConfiguredDefaultModelConfig(): {
		defaultProvider?: string;
		defaultModel?: string;
	} {
		const settingsManager = this.createFileSettingsManager();
		return {
			defaultProvider: settingsManager.getDefaultProvider(),
			defaultModel: settingsManager.getDefaultModel(),
		};
	}

	private getConfiguredModelKey(): string | undefined {
		const config = this.getConfiguredDefaultModelConfig();
		return config.defaultProvider && config.defaultModel
			? modelKey(config.defaultProvider, config.defaultModel)
			: undefined;
	}

	private async getConfiguredModelStatus(): Promise<ModelStatus | undefined> {
		const config = this.getConfiguredDefaultModelConfig();
		if (!config.defaultProvider || !config.defaultModel) {
			return;
		}
		const runtime = await this.ensureModelRuntime();
		const model = runtime.getModel(config.defaultProvider, config.defaultModel);
		return model ? modelStatusFromModel(model) : undefined;
	}

	private createCustomTools(): ToolDefinition[] {
		const toolOptions = {
			cwd: this.cwd,
			confirmApplyEdits: this.confirmApplyEdits,
			confirmWriteFile: this.confirmWriteFile,
			confirmDeleteFile: this.confirmDeleteFile,
			confirmDeleteDirectory: this.confirmDeleteDirectory,
			confirmRenameSymbol: this.confirmRenameSymbol,
		};
		const customTools = [
			createSelectionToolDefinition(toolOptions),
			createDiagnosticsToolDefinition(toolOptions),
			createWorkspaceDiagnosticsToolDefinition(toolOptions),
			createOpenEditorsToolDefinition(toolOptions),
			createDefinitionToolDefinition(toolOptions),
			createReferencesToolDefinition(toolOptions),
		];
		if (this.permissionMode === "code") {
			customTools.push(
				createApplyEditsToolDefinition(toolOptions),
				createWriteFileToolDefinition(toolOptions),
				createDeleteFileToolDefinition(toolOptions),
				createDeleteDirectoryToolDefinition(toolOptions),
				createRenameSymbolToolDefinition(toolOptions),
			);
		}
		return customTools;
	}

	private async ensureSession(): Promise<AgentSession> {
		if (this.session) {
			return this.session;
		}

		const customTools = this.createCustomTools();
		const agentDir = this.agentDir ? resolve(this.agentDir) : getAgentDir();
		const settingsManager = this.createSessionSettingsManager();
		const modelRuntime = await this.ensureModelRuntime();
		const bundledSkillPaths = this.getBundledSkillPaths();
		const resourceLoader = new DefaultResourceLoader({
			cwd: this.cwd,
			agentDir,
			settingsManager,
			extensionFactories: [createMcpAdapter({ cwd: this.cwd })],
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
			modelRuntime,
			resourceLoader,
			settingsManager,
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
		this.unsubscribe = result.session.subscribe((event) => this.eventMapper.handle(event));
		this.emitModelStatus();
		if (result.modelFallbackMessage) {
			this.onEvent({
				type: "append",
				message: {
					id: createId("system"),
					role: "system",
					text: result.modelFallbackMessage,
				},
			});
		}
		return result.session;
	}

	private getSessionDir(): string {
		if (this.sessionManager) {
			return this.sessionManager.getSessionDir();
		}
		const agentDir = this.agentDir ? resolve(this.agentDir) : getAgentDir();
		return getDefaultSessionDir(this.cwd, agentDir);
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

	private disposeSession() {
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.session?.dispose();
		this.session = undefined;
		this.eventMapper.reset();
		this.running = false;
		this.onEvent({ type: "running", running: false });
		this.emitModelStatus();
	}

	private emitModelStatus() {
		const session = this.session;
		if (session) {
			this.onEvent({
				type: "modelStatus",
				modelStatus: getModelStatus(session),
			});
			return;
		}
		void this.refreshModelStatus();
	}
}

export function getWorkspaceCwd(): string {
	const folder = vscode.workspace.workspaceFolders?.[0];
	return folder?.uri.fsPath ?? process.cwd();
}
