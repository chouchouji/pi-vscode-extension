import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import * as vscode from "vscode";
import type {
	ApprovalAction,
	ApprovalBatchAction,
	ApprovalMode,
	ApprovalPrompt,
	HostToWebviewMessage,
} from "./protocol.ts";
import type {
	ApplyEditsRequest,
	DeleteDirectoryRequest,
	DeleteFileRequest,
	RenameSymbolRequest,
	WriteFileRequest,
} from "./tools/index.ts";

interface PendingApproval {
	resolve: (approved: boolean) => void;
	review: () => Promise<void>;
}

interface EditApprovalControllerOptions {
	globalStorageUri: vscode.Uri;
	reveal: () => void;
	post: (message: HostToWebviewMessage) => void;
}

export class EditApprovalController {
	private readonly pendingApprovals = new Map<string, PendingApproval>();
	private readonly globalStorageUri: vscode.Uri;
	private readonly reveal: () => void;
	private readonly post: (message: HostToWebviewMessage) => void;
	private readonly _approvals: ApprovalPrompt[] = [];
	private _approvalMode: ApprovalMode = "ask";

	constructor(options: EditApprovalControllerOptions) {
		this.globalStorageUri = options.globalStorageUri;
		this.reveal = options.reveal;
		this.post = options.post;
	}

	get approvals(): ApprovalPrompt[] {
		return this._approvals;
	}

	get approvalMode(): ApprovalMode {
		return this._approvalMode;
	}

	setApprovalMode(approvalMode: ApprovalMode) {
		this._approvalMode = approvalMode;
		if (approvalMode === "auto") {
			this.resolvePendingApprovals(true);
		}
	}

	async confirmApplyEdits(request: ApplyEditsRequest): Promise<boolean> {
		if (this._approvalMode === "auto") {
			return true;
		}

		const reviewFiles = await this.createReviewFiles(request.files);
		const fileCount = reviewFiles.length;
		const relativePaths = reviewFiles.map(({ originalUri }) => vscode.workspace.asRelativePath(originalUri, false));

		return this.requestApproval(
			{
				text: `Pi wants to edit ${fileCount} files.`,
				detail: `Review opens ${fileCount} diffs. Apply writes and saves all files: ${relativePaths.join(", ")}`,
				action: "Edit",
				target: fileCount === 1 ? relativePaths[0] : `${fileCount} files`,
				scope: relativePaths.join(", "),
				risk: "normal",
			},
			async () => {
				this.reveal();
				for (const { originalUri, tempUri } of reviewFiles) {
					const relativePath = vscode.workspace.asRelativePath(originalUri, false);
					await vscode.commands.executeCommand(
						"vscode.diff",
						originalUri,
						tempUri,
						`Pi proposed edit: ${relativePath}`,
					);
				}
			},
		);
	}

	async confirmWriteFile(request: WriteFileRequest): Promise<boolean> {
		if (this._approvalMode === "auto") {
			return true;
		}

		const targetUri = vscode.Uri.file(request.filePath);
		const tempUri = await this.createReviewFile(request.filePath, request.content);
		const action = request.overwrite ? "overwrite" : "create";
		const relativePath = vscode.workspace.asRelativePath(targetUri, false);

		return this.requestApproval(
			{
				text: `Pi wants to ${action} ${relativePath}.`,
				detail: request.overwrite
					? "Review opens a diff. Apply overwrites and saves the file."
					: "Review opens the proposed file. Apply creates it.",
				action: request.overwrite ? "Overwrite file" : "Create file",
				target: relativePath,
				scope: request.overwrite ? "Full file replacement" : "New file",
				risk: request.overwrite ? "danger" : "normal",
			},
			async () => {
				this.reveal();
				if (request.overwrite) {
					await vscode.commands.executeCommand("vscode.diff", targetUri, tempUri, "Pi proposed file write");
				} else {
					await vscode.window.showTextDocument(tempUri, { preview: true });
				}
			},
		);
	}

	async confirmDeleteFile(request: DeleteFileRequest): Promise<boolean> {
		if (this._approvalMode === "auto") {
			return true;
		}

		const targetUri = vscode.Uri.file(request.filePath);
		const relativePath = vscode.workspace.asRelativePath(targetUri, false);

		return this.requestApproval(
			{
				text: `Pi wants to delete ${relativePath}.`,
				detail: "Review opens the file. Apply moves it to the trash.",
				action: "Delete file",
				target: relativePath,
				scope: "Move to Trash",
				risk: "danger",
			},
			async () => {
				this.reveal();
				await vscode.window.showTextDocument(targetUri, { preview: true });
			},
		);
	}

	async confirmDeleteDirectory(request: DeleteDirectoryRequest): Promise<boolean> {
		if (this._approvalMode === "auto") {
			return true;
		}

		const targetUri = vscode.Uri.file(request.directoryPath);
		const relativePath = vscode.workspace.asRelativePath(targetUri, false);
		const entryText = request.truncated ? `at least ${request.entryCount} entries` : `${request.entryCount} entries`;
		const reviewContent = [
			`Directory: ${relativePath}`,
			`Contents: ${entryText}`,
			"",
			request.samplePaths.length > 0 ? "Entries:" : "Entries: (empty directory)",
			...request.samplePaths.map((path) => `- ${path}`),
			request.truncated ? "" : undefined,
			request.truncated
				? `Only the first ${request.samplePaths.length} entries are shown. Apply moves the whole directory tree to the trash.`
				: undefined,
		]
			.filter((line): line is string => line !== undefined)
			.join("\n");
		const reviewUri = await this.createReviewFile(request.directoryPath, reviewContent);

		return this.requestApproval(
			{
				text: `Pi wants to delete directory ${relativePath}.`,
				detail: `Review opens a directory summary. Apply moves ${entryText} to the trash.`,
				action: "Delete directory",
				target: relativePath,
				scope: entryText,
				risk: "danger",
			},
			async () => {
				this.reveal();
				await vscode.window.showTextDocument(reviewUri, { preview: true });
			},
		);
	}

	async confirmRenameSymbol(request: RenameSymbolRequest): Promise<boolean> {
		if (this._approvalMode === "auto") {
			return true;
		}

		const reviewFiles = await this.createReviewFiles(request.files);
		const targetUri = vscode.Uri.file(request.filePath);
		const relativePath = vscode.workspace.asRelativePath(targetUri, false);
		const fileCount = reviewFiles.length;

		return this.requestApproval(
			{
				text: `Pi wants to rename a symbol at ${relativePath}:${request.line}:${request.character} to ${request.newName}.`,
				detail: `Review opens ${fileCount} diffs. Apply writes and saves all affected files.`,
				action: "Rename symbol",
				target: `${relativePath}:${request.line}:${request.character}`,
				scope: `${fileCount} files`,
				risk: "warning",
			},
			async () => {
				this.reveal();
				for (const { originalUri, tempUri } of reviewFiles) {
					const reviewPath = vscode.workspace.asRelativePath(originalUri, false);
					await vscode.commands.executeCommand(
						"vscode.diff",
						originalUri,
						tempUri,
						`Pi proposed symbol rename: ${reviewPath}`,
					);
				}
			},
		);
	}

	async handleApprovalResponse(id: string, action: ApprovalAction) {
		const pending = this.pendingApprovals.get(id);
		if (!pending) {
			return;
		}
		if (action === "review") {
			try {
				await pending.review();
			} catch (error) {
				await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
			}
			return;
		}

		this.resolveApproval(id, action === "apply");
	}

	async handleApprovalBatchResponse(action: ApprovalBatchAction) {
		if (action === "review") {
			for (const pending of this.pendingApprovals.values()) {
				try {
					await pending.review();
				} catch (error) {
					await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
				}
			}
			return;
		}

		this.resolvePendingApprovals(action === "apply");
	}

	rejectPendingApprovals() {
		this.resolvePendingApprovals(false);
	}

	private async createReviewFiles(files: readonly { filePath: string; proposedText: string }[]): Promise<
		{
			originalUri: vscode.Uri;
			tempUri: vscode.Uri;
		}[]
	> {
		const reviewFiles: { originalUri: vscode.Uri; tempUri: vscode.Uri }[] = [];
		for (const file of files) {
			reviewFiles.push({
				originalUri: vscode.Uri.file(file.filePath),
				tempUri: await this.createReviewFile(file.filePath, file.proposedText),
			});
		}
		return reviewFiles;
	}

	private async createReviewFile(filePath: string, content: string): Promise<vscode.Uri> {
		const reviewDir = join(this.globalStorageUri.fsPath, "review");
		await mkdir(reviewDir, { recursive: true });
		const tempPath = join(
			reviewDir,
			`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${basename(filePath).replace(/[^\w.-]/g, "_")}`,
		);
		await writeFile(tempPath, content, "utf8");
		return vscode.Uri.file(tempPath);
	}

	private requestApproval(prompt: Omit<ApprovalPrompt, "id">, review: () => Promise<void>): Promise<boolean> {
		this.reveal();
		return new Promise((resolve) => {
			const approval = {
				id: `approval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
				...prompt,
			};
			this._approvals.push(approval);
			this.pendingApprovals.set(approval.id, { resolve, review });
			this.post({ type: "approvalRequested", approval });
		});
	}

	private resolveApproval(id: string, approved: boolean) {
		const pending = this.pendingApprovals.get(id);
		if (!pending) {
			return;
		}

		this.pendingApprovals.delete(id);
		const approvalIndex = this._approvals.findIndex((approval) => approval.id === id);
		if (approvalIndex !== -1) {
			this._approvals.splice(approvalIndex, 1);
		}
		this.post({ type: "approvalResolved", id });
		pending.resolve(approved);
	}

	private resolvePendingApprovals(approved: boolean) {
		const ids = [...this.pendingApprovals.keys()];
		for (const id of ids) {
			this.resolveApproval(id, approved);
		}
	}
}
