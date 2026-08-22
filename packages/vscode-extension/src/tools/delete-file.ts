import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as vscode from "vscode";
import { errorResult, resolveFileUri, textResult, toWorkspacePath } from "./shared.ts";
import type { VsCodeToolOptions } from "./types.ts";

export function createDeleteFileToolDefinition(options: VsCodeToolOptions): ToolDefinition {
	return defineTool({
		name: "vscode_delete_file",
		label: "delete file",
		description: "Move a file to the trash through VS Code after user confirmation. Directories are not supported.",
		promptSnippet: "vscode_delete_file: propose moving a file to the trash through VS Code.",
		promptGuidelines: [
			"Use vscode_delete_file only for files that should be removed from the workspace.",
			"Do not use this tool for directories.",
		],
		parameters: Type.Object({
			path: Type.String({ description: "File path to delete, relative to the workspace or absolute." }),
		}),
		execute: async (_toolCallId, params) => {
			const uri = resolveFileUri(options.cwd, params.path);
			try {
				const stat = await vscode.workspace.fs.stat(uri);
				if (stat.type !== vscode.FileType.File) {
					return errorResult("Path exists but is not a file.", "delete file");
				}
			} catch {
				return errorResult("Path does not exist.", "delete file");
			}

			const approved = await options.confirmDeleteFile({ filePath: uri.fsPath });
			if (!approved) {
				return errorResult("User rejected the file deletion.", "delete file");
			}

			await vscode.workspace.fs.delete(uri, { recursive: false, useTrash: true });
			return textResult(`Moved ${toWorkspacePath(options.cwd, uri.fsPath)} to the trash.`, "delete file");
		},
	});
}
