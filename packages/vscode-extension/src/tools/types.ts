export type ApprovalDecision = "approved" | "rejected" | "cancelled";

export interface VsCodeToolOptions {
	cwd: string;
	confirmApplyEdits: (request: ApplyEditsRequest) => Promise<ApprovalDecision>;
	confirmWriteFile: (request: WriteFileRequest) => Promise<ApprovalDecision>;
	confirmDeleteFile: (request: DeleteFileRequest) => Promise<ApprovalDecision>;
	confirmDeleteDirectory: (request: DeleteDirectoryRequest) => Promise<ApprovalDecision>;
	confirmRenameSymbol: (request: RenameSymbolRequest) => Promise<ApprovalDecision>;
}

export interface ApplyEditReviewFile {
	filePath: string;
	proposedText: string;
}

export interface ApplyEditsRequest {
	files: ApplyEditReviewFile[];
}

export interface WriteFileRequest {
	filePath: string;
	content: string;
	overwrite: boolean;
}

export interface DeleteFileRequest {
	filePath: string;
}

export interface DeleteDirectoryRequest {
	directoryPath: string;
	entryCount: number;
	truncated: boolean;
	samplePaths: string[];
}

export interface RenameSymbolRequest {
	filePath: string;
	line: number;
	character: number;
	newName: string;
	files: ApplyEditReviewFile[];
}
