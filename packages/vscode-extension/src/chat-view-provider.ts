import { isAbsolute, resolve } from "node:path";
import * as vscode from "vscode";
import { EditApprovalController } from "./edit-approval-controller.ts";
import { getWorkspaceCwd, listSessionSummaries, PiAgentService, type PiAgentServiceEvent } from "./pi-agent-service.ts";
import {
	type ChatMessage,
	type HostToWebviewMessage,
	type ModelStatus,
	type PermissionMode,
	parseWebviewMessage,
	type SessionSummary,
	type WebviewToHostMessage,
} from "./protocol.ts";
import { getWebviewHtml } from "./webview.ts";

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

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};
		webviewView.webview.html = getWebviewHtml();
		webviewView.webview.onDidReceiveMessage((message) => {
			const parsed = parseWebviewMessage(message);
			if (parsed) {
				void this.handleWebviewMessage(parsed);
			}
		});
		this.postState();
		void this.refreshSessions();
	}

	reveal(): void {
		if (this.view?.show) {
			this.view.show(true);
			return;
		}
		void vscode.commands.executeCommand("workbench.view.extension.pi");
	}

	async newChat(): Promise<void> {
		this.approvalController.rejectPendingApprovals();
		const service = await this.ensureService();
		await service.newSession();
		this.messages.length = 0;
		this.running = false;
		await this.refreshSessions();
		this.postState();
	}

	prefill(text: string): void {
		this.reveal();
		this.post({ type: "prefill", text });
	}

	async explainCurrentFile(): Promise<void> {
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

	async addSelection(): Promise<void> {
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

	dispose(): void {
		this.approvalController.rejectPendingApprovals();
		this.service?.dispose();
	}

	private readPermissionMode(): PermissionMode {
		const configured = vscode.workspace.getConfiguration("pi").get<string>("permissionMode", "ask");
		return configured === "plan" || configured === "code" ? configured : "ask";
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
			confirmApplyEdit: (request) => this.approvalController.confirmApplyEdit(request),
			confirmApplyEdits: (request) => this.approvalController.confirmApplyEdits(request),
			confirmWriteFile: (request) => this.approvalController.confirmWriteFile(request),
			confirmDeleteFile: (request) => this.approvalController.confirmDeleteFile(request),
			confirmRenameFile: (request) => this.approvalController.confirmRenameFile(request),
			confirmRenameSymbol: (request) => this.approvalController.confirmRenameSymbol(request),
		});
		this.service = service;
		return service;
	}

	private handleServiceEvent(event: PiAgentServiceEvent): void {
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

	private async handleWebviewMessage(message: WebviewToHostMessage): Promise<void> {
		switch (message.type) {
			case "ready":
				this.postState();
				break;
			case "send":
				await this.sendPrompt(message.text);
				break;
			case "stop":
				this.approvalController.rejectPendingApprovals();
				await this.service?.abort();
				break;
			case "new":
				await this.newChat();
				break;
			case "switchSession":
				await this.switchSession(message.path);
				break;
			case "setPermissionMode":
				this.approvalController.rejectPendingApprovals();
				this.permissionMode = message.permissionMode;
				this.service?.setPermissionMode(message.permissionMode);
				this.postState();
				break;
			case "setApprovalMode":
				this.approvalController.setApprovalMode(message.approvalMode);
				this.postState();
				break;
			case "approvalResponse":
				await this.approvalController.handleApprovalResponse(message.id, message.action);
				break;
			case "approvalBatchResponse":
				await this.approvalController.handleApprovalBatchResponse(message.action);
				break;
			case "openFile":
				await this.openFileReference(message.path, message.line, message.character);
				break;
		}
	}

	private async openFileReference(
		path: string,
		line: number | undefined,
		character: number | undefined,
	): Promise<void> {
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

	private async sendPrompt(text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed || this.running) {
			return;
		}

		const service = await this.ensureService();
		await service.prompt(trimmed);
		await this.refreshSessions();
	}

	private async switchSession(path: string): Promise<void> {
		if (this.running) {
			return;
		}
		this.approvalController.rejectPendingApprovals();
		const service = await this.ensureService();
		await service.switchSession(path);
		this.messages.length = 0;
		this.messages.push(...service.getSessionMessages());
		this.running = false;
		await this.refreshSessions();
		this.postState();
	}

	private async refreshSessions(): Promise<void> {
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

	private postState(): void {
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

	private post(message: HostToWebviewMessage | PiAgentServiceEvent): void {
		void this.view?.webview.postMessage(message);
	}
}
