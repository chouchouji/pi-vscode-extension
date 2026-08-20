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
	ApplyEditRequest,
	ApplyEditsRequest,
	DeleteFileRequest,
	RenameFileRequest,
	RenameSymbolRequest,
	WriteFileRequest,
} from "./vscode-tools.ts";

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

	setApprovalMode(approvalMode: ApprovalMode): void {
		this._approvalMode = approvalMode;
		if (approvalMode === "auto") {
			this.resolvePendingApprovals(true);
		}
	}

	async confirmApplyEdit(request: ApplyEditRequest): Promise<boolean> {
		if (this._approvalMode === "auto") {
			return true;
		}

		const [{ originalUri, tempUri }] = await this.createReviewFiles([
			{ filePath: request.filePath, proposedText: request.proposedText },
		]);
		const relativePath = vscode.workspace.asRelativePath(originalUri, false);

		return this.requestApproval(
			{
				text: `Pi wants to edit ${relativePath}.`,
				detail: "Review opens a diff. Apply writes and saves the file.",
			},
			async () => {
				this.reveal();
				await vscode.commands.executeCommand("vscode.diff", originalUri, tempUri, "Pi proposed edit");
			},
		);
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
			},
			async () => {
				this.reveal();
				await vscode.window.showTextDocument(targetUri, { preview: true });
			},
		);
	}

	async confirmRenameFile(request: RenameFileRequest): Promise<boolean> {
		if (this._approvalMode === "auto") {
			return true;
		}

		const oldUri = vscode.Uri.file(request.oldPath);
		const newUri = vscode.Uri.file(request.newPath);
		const oldRelativePath = vscode.workspace.asRelativePath(oldUri, false);
		const newRelativePath = vscode.workspace.asRelativePath(newUri, false);

		return this.requestApproval(
			{
				text: `Pi wants to rename ${oldRelativePath} to ${newRelativePath}.`,
				detail: request.overwrite
					? "Review opens the source file. Apply renames it and overwrites the target file."
					: "Review opens the source file. Apply renames it.",
			},
			async () => {
				this.reveal();
				await vscode.window.showTextDocument(oldUri, { preview: true });
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

	async handleApprovalResponse(id: string, action: ApprovalAction): Promise<void> {
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

	async handleApprovalBatchResponse(action: ApprovalBatchAction): Promise<void> {
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

	rejectPendingApprovals(): void {
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

	private resolveApproval(id: string, approved: boolean): void {
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

	private resolvePendingApprovals(approved: boolean): void {
		const ids = [...this.pendingApprovals.keys()];
		for (const id of ids) {
			this.resolveApproval(id, approved);
		}
	}
}
