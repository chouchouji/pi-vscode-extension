import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import * as vscode from "vscode";
import { runLoginFlow, runLogoutFlow } from "./auth-flow.ts";
import { PiChatViewState } from "./chat-view-state.ts";
import { EditApprovalController } from "./edit-approval-controller.ts";
import {
	getWorkspaceCwd,
	listSessionSummaries,
	type ModelSelection,
	PiAgentService,
	type PiAgentServiceEvent,
} from "./pi-agent-service.ts";
import {
	type FileMentionItem,
	type HostToWebviewEventEnvelope,
	type HostToWebviewMessage,
	type PermissionMode,
	parseWebviewMessage,
	type SessionSummary,
	type SlashCommandItem,
	type StreamingBehavior,
	type WebviewResponseEnvelope,
	type WebviewToHostMessage,
} from "./protocol.ts";
import { getWebviewHtml } from "./webview/index.ts";

type ModelQuickPickItem = vscode.QuickPickItem & ModelSelection;
type SessionQuickPickItem = vscode.QuickPickItem & { sessionPath: string };

export class PiChatViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;
	private service?: PiAgentService;
	private readonly approvalController: EditApprovalController;
	private readonly state: PiChatViewState;
	private readonly extensionPath: string;
	private readonly extensionUri: vscode.Uri;

	constructor(context: vscode.ExtensionContext) {
		this.extensionPath = context.extensionPath;
		this.extensionUri = context.extensionUri;
		this.state = new PiChatViewState(this.readPermissionMode());
		this.approvalController = new EditApprovalController({
			globalStorageUri: context.globalStorageUri,
			reveal: () => this.reveal(),
			post: (message) => this.post(message),
		});
	}

	resolveWebviewView(webviewView: vscode.WebviewView) {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};
		webviewView.webview.onDidReceiveMessage((message) => {
			const parsed = parseWebviewMessage(message);
			if (parsed) {
				void this.handleWebviewMessage(parsed.request)
					.then((data) =>
						this.respond({
							kind: "response",
							id: parsed.id,
							ok: true,
							...(data === undefined ? {} : { data }),
						}),
					)
					.catch((error: unknown) =>
						this.respond({
							kind: "response",
							id: parsed.id,
							ok: false,
							error: {
								message: error instanceof Error ? error.message : String(error),
							},
						}),
					);
			}
		});
		webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri);
		this.postState();
		void this.refreshSessions();
		void this.refreshModelStatus();
	}

	reveal() {
		if (this.view?.show) {
			this.view.show(true);
			return;
		}
		void vscode.commands.executeCommand("workbench.view.extension.pi");
	}

	async newChat() {
		this.approvalController.rejectPendingApprovals();
		const service = await this.ensureService();
		await service.newSession();
		this.state.resetSession();
		await this.refreshSessions();
		this.postState();
	}

	prefill(text: string) {
		this.reveal();
		this.post({ type: "prefill", text });
	}

	async toggleSessionHistory() {
		await this.showSessionPicker();
	}

	async selectModel() {
		if (this.state.isRunning) {
			await vscode.window.showInformationMessage("Cannot switch model while Pi is running.");
			return;
		}

		const service = await this.ensureService();
		const selections = await service.listModelSelections();
		if (selections.length === 0) {
			await vscode.window.showWarningMessage("No Pi models found. Configure models.json or Pi providers first.");
			return;
		}

		const items: ModelQuickPickItem[] = selections.map((selection) => ({
			...selection,
			label: selection.label,
			description: selection.configured ? undefined : "Not available",
			detail: selection.detail,
			picked: selection.active,
		}));
		const picked = await vscode.window.showQuickPick(items, {
			matchOnDescription: true,
			matchOnDetail: true,
			placeHolder: "Select Pi provider/model",
		});
		if (!picked) {
			return;
		}

		try {
			await service.selectModel(picked.provider, picked.modelId);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.startsWith("Model is not available")) {
				const action = await vscode.window.showErrorMessage(message, "Login...");
				if (action === "Login...") {
					const loggedIn = await runLoginFlow(await service.getModelRuntime(), picked.provider);
					if (loggedIn) {
						try {
							await service.selectModel(picked.provider, picked.modelId);
						} catch (retryError) {
							await vscode.window.showErrorMessage(
								retryError instanceof Error ? retryError.message : String(retryError),
							);
							return;
						}
						this.postState();
					}
				}
				return;
			}
			await vscode.window.showErrorMessage(message);
			return;
		}
		this.postState();
	}

	async login() {
		const service = await this.ensureService();
		const loggedIn = await runLoginFlow(await service.getModelRuntime());
		if (loggedIn) {
			await service.refreshModelStatus();
			this.postState();
		}
	}

	async logout() {
		const service = await this.ensureService();
		const loggedOut = await runLogoutFlow(await service.getModelRuntime());
		if (loggedOut) {
			await service.refreshModelStatus();
			this.postState();
		}
	}

	async explainCurrentFile() {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			await vscode.window.showErrorMessage("No active editor.");
			return;
		}
		const relativePath = vscode.workspace.asRelativePath(editor.document.uri, false);
		this.prefill(
			`Explain the current file @${relativePath}. Focus on structure, responsibilities, and important risks.`,
		);
	}

	async addSelection() {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			await vscode.window.showErrorMessage("No active editor.");
			return;
		}

		const selection = editor.selection;
		const relativePath = vscode.workspace.asRelativePath(editor.document.uri, false);
		if (selection.isEmpty) {
			this.prefill(`Use the current file @${relativePath} as context.`);
			return;
		}

		const selectedText = editor.document.getText(selection);
		this.prefill(
			[
				`Use this selection from ${relativePath}:${selection.start.line + 1} as context:`,
				"",
				"```",
				selectedText,
				"```",
			].join("\n"),
		);
	}

	dispose() {
		this.approvalController.rejectPendingApprovals();
		this.service?.dispose();
	}

	private readPermissionMode(): PermissionMode {
		const configured = vscode.workspace.getConfiguration("pi").get<string>("permissionMode", "code");
		return configured === "ask" || configured === "plan" || configured === "code" ? configured : "code";
	}

	private readAgentDir(): string | undefined {
		const configured = vscode.workspace.getConfiguration("pi").get<string>("agentDir", "");
		return configured.trim() || undefined;
	}

	private async ensureService(): Promise<PiAgentService> {
		if (this.service) {
			return this.service;
		}

		const service = new PiAgentService({
			cwd: getWorkspaceCwd(),
			agentDir: this.readAgentDir(),
			extensionPath: this.extensionPath,
			permissionMode: this.state.currentPermissionMode,
			onEvent: (event) => this.handleServiceEvent(event),
			confirmApplyEdits: (request) => this.approvalController.confirmApplyEdits(request),
			confirmWriteFile: (request) => this.approvalController.confirmWriteFile(request),
			confirmDeleteFile: (request) => this.approvalController.confirmDeleteFile(request),
			confirmDeleteDirectory: (request) => this.approvalController.confirmDeleteDirectory(request),
			confirmRenameSymbol: (request) => this.approvalController.confirmRenameSymbol(request),
		});
		this.service = service;
		return service;
	}

	private handleServiceEvent(event: PiAgentServiceEvent) {
		this.post(this.state.applyServiceEvent(event));
	}

	private async handleWebviewMessage(message: WebviewToHostMessage): Promise<unknown> {
		switch (message.method) {
			case "ready":
				this.postState();
				break;
			case "send":
				await this.sendPrompt(message.params.text, message.params.streamingBehavior);
				break;
			case "stop":
				this.approvalController.rejectPendingApprovals();
				await this.service?.abort();
				return this.service?.clearMessageQueue();
			case "new":
				await this.newChat();
				break;
			case "selectModel":
				await this.selectModel();
				break;
			case "switchSession":
				await this.switchSession(message.params.path);
				break;
			case "showSessionPicker":
				await this.showSessionPicker();
				break;
			case "listFiles":
				return this.listFiles(message.params.query);
			case "listCommands":
				return this.listCommands();
			case "clearQueue":
				return this.service?.clearMessageQueue();
			case "setPermissionMode":
				this.approvalController.rejectPendingApprovals();
				this.state.setPermissionMode(message.params.permissionMode);
				this.service?.setPermissionMode(message.params.permissionMode);
				this.postState();
				break;
			case "setApprovalMode":
				this.approvalController.setApprovalMode(message.params.approvalMode);
				this.postState();
				break;
			case "approvalResponse":
				await this.approvalController.handleApprovalResponse(message.params.id, message.params.action);
				break;
			case "approvalBatchResponse":
				await this.approvalController.handleApprovalBatchResponse(message.params.action);
				break;
			case "openFile":
				await this.openFileReference(message.params.path, message.params.line, message.params.character);
				break;
		}
	}

	private async openFileReference(path: string, line: number | undefined, character: number | undefined) {
		const trimmed = path.trim();
		// Strip exactly one leading "@" mention sigil; real "@" paths are written "@@path".
		const reference = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
		if (!reference) {
			return;
		}

		const uri = vscode.Uri.file(isAbsolute(reference) ? reference : resolve(getWorkspaceCwd(), reference));
		const editor = await vscode.window.showTextDocument(uri, { preview: true });
		if (line === undefined) {
			return;
		}

		const targetLine = Math.max(0, Math.floor(line) - 1);
		const targetCharacter = Math.max(0, Math.floor(character ?? 1) - 1);
		const position = new vscode.Position(targetLine, targetCharacter);
		editor.selection = new vscode.Selection(position, position);
	}

	private async listFiles(query: string): Promise<FileMentionItem[]> {
		if (!vscode.workspace.workspaceFolders?.length) {
			return [];
		}
		const sanitized = query.replace(/[*?[\]{}]/g, "").trim();
		// Match any path segment so folder queries find their contents. Use explicit
		// brace branches: VS Code glob syntax does not support empty alternates like `{,/**}`.
		const pattern = sanitized ? `{**/*${sanitized}*,**/*${sanitized}*/**}` : "**/*";
		const uris = await vscode.workspace.findFiles(pattern, "{**/node_modules/**,**/.git/**}", 50);
		const items: FileMentionItem[] = [];
		const seen = new Set<string>();
		const lowerQuery = sanitized.toLowerCase();
		for (const uri of uris) {
			const path = vscode.workspace.asRelativePath(uri, false);
			// findFiles returns files only; also surface ancestor folders matching the query.
			if (lowerQuery) {
				const segments = path.split("/");
				for (let i = 0; i < segments.length - 1; i++) {
					if (!segments[i].toLowerCase().includes(lowerQuery)) {
						continue;
					}
					const dirPath = `${segments.slice(0, i + 1).join("/")}/`;
					if (!seen.has(dirPath)) {
						seen.add(dirPath);
						items.push({ path: dirPath });
					}
				}
			}
			if (!seen.has(path)) {
				seen.add(path);
				items.push({ path });
			}
		}
		return items.slice(0, 50);
	}

	private async listCommands(): Promise<SlashCommandItem[]> {
		const service = await this.ensureService();
		return service.listSlashCommands();
	}

	private async sendPrompt(text: string, streamingBehavior?: StreamingBehavior) {
		const trimmed = text.trim();
		if (!trimmed) {
			return;
		}

		const service = await this.ensureService();
		await service.prompt(await this.expandFileMentions(trimmed), streamingBehavior);
		await this.refreshSessions();
	}

	// Expand "@path" mentions into file contents before the prompt reaches the
	// model: only tokens that resolve to real workspace files are expanded, so
	// decorators like `@Component` or emails are never mistaken for paths.
	// "@@path" is the escaped form of a real path starting with "@".
	private async expandFileMentions(text: string): Promise<string> {
		// Mentions inside code spans/blocks are literal text, not references.
		const searchable = text.replace(/```[\s\S]*?(?:```|$)/g, " ").replace(/`[^`\n]*`/g, " ");
		const files: { path: string; content: string }[] = [];
		const seen = new Set<string>();
		for (const match of searchable.matchAll(/(?:^|\s)(@@?)(\S+)/g)) {
			let candidate = match[2];
			// "@@path" is the escaped form of a real path starting with "@".
			const prefix = match[1] === "@@" ? "@" : "";
			// Trim trailing prose punctuation (e.g. "@foo.ts,") until it resolves.
			while (candidate) {
				const reference = prefix + candidate;
				const absolutePath = isAbsolute(reference) ? reference : resolve(getWorkspaceCwd(), reference);
				const uri = vscode.Uri.file(absolutePath);
				// Only expand files that are actually inside the current workspace.
				if (!vscode.workspace.getWorkspaceFolder(uri)) {
					break;
				}
				const content = await this.readMentionFile(absolutePath);
				if (content !== undefined) {
					if (!seen.has(absolutePath)) {
						seen.add(absolutePath);
						files.push({ path: absolutePath, content });
					}
					break;
				}
				candidate = candidate.replace(/[.,;:!?，。；：！？、)\]]+$/, "");
			}
		}
		if (files.length === 0) {
			return text;
		}
		const blocks = files.map((file) => {
			const name = vscode.workspace.asRelativePath(vscode.Uri.file(file.path), false);
			return `<file name="${name}">\n${file.content}\n</file>`;
		});
		return `${blocks.join("\n")}\n\n${text}`;
	}

	private async readMentionFile(absolutePath: string): Promise<string | undefined> {
		try {
			const stats = await stat(absolutePath);
			// Skip directories, empty files, and files too large to inline.
			if (!stats.isFile() || stats.size === 0 || stats.size > 512 * 1024) {
				return undefined;
			}
			const content = await readFile(absolutePath, "utf-8");
			// Binary content does not belong in the prompt.
			return content.includes("\0") ? undefined : content;
		} catch {
			return undefined;
		}
	}

	private async switchSession(path: string) {
		if (this.state.isRunning) {
			return;
		}
		try {
			this.approvalController.rejectPendingApprovals();
			const service = await this.ensureService();
			await service.switchSession(path);
			this.state.replaceSessionMessages(service.getSessionMessages());
			await this.refreshSessions();
			this.postState();
		} catch (error) {
			await vscode.window.showErrorMessage(
				`Failed to switch chat session: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async showSessionPicker() {
		if (this.state.isRunning) {
			await vscode.window.showInformationMessage("Cannot switch chat history while Pi is running.");
			return;
		}

		await this.refreshSessions();
		const items: SessionQuickPickItem[] = this.state.sessionSummaries.map((session) => ({
			sessionPath: session.path,
			label: session.active ? `$(check) ${session.label}` : session.label,
			description: session.active ? "Current" : undefined,
			detail: session.detail,
		}));

		if (items.length === 0) {
			await vscode.window.showInformationMessage("No chat history found.");
			return;
		}

		const picked = await vscode.window.showQuickPick(items, {
			matchOnDescription: true,
			matchOnDetail: true,
			placeHolder: "Switch chat session",
		});
		if (!picked || picked.sessionPath === this.state.currentSessionPath) {
			return;
		}

		await this.switchSession(picked.sessionPath);
	}

	private async refreshSessions() {
		let sessions: SessionSummary[];
		let activeSessionPath: string | undefined;
		if (this.service) {
			sessions = await this.service.listSessions();
			activeSessionPath = this.service.getActiveSessionPath();
		} else {
			activeSessionPath = undefined;
			sessions = await listSessionSummaries({
				cwd: getWorkspaceCwd(),
				agentDir: this.readAgentDir(),
				activeSessionPath,
			});
		}
		this.state.setSessions(sessions, activeSessionPath);
		this.post(this.state.createSessionsEvent());
	}

	private async refreshModelStatus() {
		try {
			const service = await this.ensureService();
			await service.refreshModelStatus();
		} catch (error) {
			this.state.clearModelStatus();
			await vscode.window.showErrorMessage(
				`Failed to load Pi model: ${error instanceof Error ? error.message : String(error)}`,
			);
			this.postState();
		}
	}

	private postState() {
		this.post(this.state.createStateMessage(this.approvalController.approvalMode, this.approvalController.approvals));
	}

	private post(message: HostToWebviewMessage) {
		const event: HostToWebviewEventEnvelope = { kind: "event", event: message };
		void this.view?.webview.postMessage(event);
	}

	private respond(response: WebviewResponseEnvelope) {
		void this.view?.webview.postMessage(response);
	}
}
