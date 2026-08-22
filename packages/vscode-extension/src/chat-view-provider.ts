import { isAbsolute, resolve } from "node:path";
import * as vscode from "vscode";
import { EditApprovalController } from "./edit-approval-controller.ts";
import {
	getWorkspaceCwd,
	listSessionSummaries,
	type ModelSelection,
	PiAgentService,
	type PiAgentServiceEvent,
} from "./pi-agent-service.ts";
import {
	type ChatMessage,
	type HostToWebviewEventEnvelope,
	type HostToWebviewMessage,
	type ModelStatus,
	type PermissionMode,
	parseWebviewMessage,
	type SessionSummary,
	type WebviewResponseEnvelope,
	type WebviewToHostMessage,
} from "./protocol.ts";
import { getWebviewHtml } from "./webview/index.ts";

type ModelQuickPickItem = vscode.QuickPickItem & ModelSelection;
type SessionQuickPickItem = vscode.QuickPickItem & { sessionPath: string };

export class PiChatViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;
	private service?: PiAgentService;
	private readonly messages: ChatMessage[] = [];
	private readonly approvalController: EditApprovalController;
	private modelStatus: ModelStatus | undefined;
	private sessions: SessionSummary[] = [];
	private activeSessionPath: string | undefined;
	private running = false;
	private permissionMode: PermissionMode;
	private readonly extensionPath: string;
	private readonly extensionUri: vscode.Uri;

	constructor(context: vscode.ExtensionContext) {
		this.extensionPath = context.extensionPath;
		this.extensionUri = context.extensionUri;
		this.permissionMode = this.readPermissionMode();
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
					.then(() => this.respond({ kind: "response", id: parsed.id, ok: true }))
					.catch((error: unknown) =>
						this.respond({
							kind: "response",
							id: parsed.id,
							ok: false,
							error: { message: error instanceof Error ? error.message : String(error) },
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
		this.messages.length = 0;
		this.running = false;
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
		if (this.running) {
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
			await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
			return;
		}
		this.postState();
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
			permissionMode: this.permissionMode,
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
			case "modelStatus":
				this.modelStatus = event.modelStatus;
				break;
		}
		this.post(event);
	}

	private async handleWebviewMessage(message: WebviewToHostMessage) {
		switch (message.method) {
			case "ready":
				this.postState();
				break;
			case "send":
				await this.sendPrompt(message.params.text);
				break;
			case "stop":
				this.approvalController.rejectPendingApprovals();
				await this.service?.abort();
				break;
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
			case "setPermissionMode":
				this.approvalController.rejectPendingApprovals();
				this.permissionMode = message.params.permissionMode;
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
		if (!trimmed) {
			return;
		}

		const uri = vscode.Uri.file(isAbsolute(trimmed) ? trimmed : resolve(getWorkspaceCwd(), trimmed));
		const editor = await vscode.window.showTextDocument(uri, { preview: true });
		if (line === undefined) {
			return;
		}

		const targetLine = Math.max(0, Math.floor(line) - 1);
		const targetCharacter = Math.max(0, Math.floor(character ?? 1) - 1);
		const position = new vscode.Position(targetLine, targetCharacter);
		editor.selection = new vscode.Selection(position, position);
	}

	private async sendPrompt(text: string) {
		const trimmed = text.trim();
		if (!trimmed || this.running) {
			return;
		}

		const service = await this.ensureService();
		await service.prompt(trimmed);
		await this.refreshSessions();
	}

	private async switchSession(path: string) {
		if (this.running) {
			return;
		}
		try {
			this.approvalController.rejectPendingApprovals();
			const service = await this.ensureService();
			await service.switchSession(path);
			this.messages.length = 0;
			this.messages.push(...service.getSessionMessages());
			this.running = false;
			await this.refreshSessions();
			this.postState();
		} catch (error) {
			await vscode.window.showErrorMessage(
				`Failed to switch chat session: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async showSessionPicker() {
		if (this.running) {
			await vscode.window.showInformationMessage("Cannot switch chat history while Pi is running.");
			return;
		}

		await this.refreshSessions();
		const items: SessionQuickPickItem[] = this.sessions.map((session) => ({
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
		if (!picked || picked.sessionPath === this.activeSessionPath) {
			return;
		}

		await this.switchSession(picked.sessionPath);
	}

	private async refreshSessions() {
		if (this.service) {
			this.sessions = await this.service.listSessions();
			this.activeSessionPath = this.service.getActiveSessionPath();
		} else {
			this.activeSessionPath = undefined;
			this.sessions = await listSessionSummaries({
				cwd: getWorkspaceCwd(),
				agentDir: this.readAgentDir(),
				activeSessionPath: this.activeSessionPath,
			});
		}
		this.post({ type: "sessions", sessions: this.sessions, activeSessionPath: this.activeSessionPath });
	}

	private async refreshModelStatus() {
		try {
			const service = await this.ensureService();
			await service.refreshModelStatus();
		} catch (error) {
			this.modelStatus = undefined;
			await vscode.window.showErrorMessage(
				`Failed to load Pi model: ${error instanceof Error ? error.message : String(error)}`,
			);
			this.postState();
		}
	}

	private postState() {
		this.post({
			type: "state",
			messages: this.messages,
			running: this.running,
			permissionMode: this.permissionMode,
			approvalMode: this.approvalController.approvalMode,
			approvals: this.approvalController.approvals,
			modelStatus: this.modelStatus,
			sessions: this.sessions,
			activeSessionPath: this.activeSessionPath,
		});
	}

	private post(message: HostToWebviewMessage) {
		const event: HostToWebviewEventEnvelope = { kind: "event", event: message };
		void this.view?.webview.postMessage(event);
	}

	private respond(response: WebviewResponseEnvelope) {
		void this.view?.webview.postMessage(response);
	}
}
