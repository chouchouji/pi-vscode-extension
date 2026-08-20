export interface VsCodeToolOptions {
	cwd: string;
	confirmApplyEdits: (request: ApplyEditsRequest) => Promise<boolean>;
	confirmWriteFile: (request: WriteFileRequest) => Promise<boolean>;
	confirmDeleteFile: (request: DeleteFileRequest) => Promise<boolean>;
	confirmDeleteDirectory: (request: DeleteDirectoryRequest) => Promise<boolean>;
	confirmRenameSymbol: (request: RenameSymbolRequest) => Promise<boolean>;
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
