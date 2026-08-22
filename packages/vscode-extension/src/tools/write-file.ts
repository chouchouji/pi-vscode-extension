import { dirname } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as vscode from "vscode";
import { errorResult, resolveFileUri, textResult, toWorkspacePath } from "./shared.ts";
import type { VsCodeToolOptions } from "./types.ts";

interface ExistingFileText {
	exists: boolean;
	text: string;
}

async function readExistingFileText(uri: vscode.Uri): Promise<ExistingFileText | string> {
	try {
		return {
			exists: true,
			text: new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)),
		};
	} catch {
		try {
			await vscode.workspace.fs.stat(uri);
			return "Path exists but is not a readable file.";
		} catch {
			return { exists: false, text: "" };
		}
	}
}

export function createWriteFileToolDefinition(options: VsCodeToolOptions): ToolDefinition {
	return defineTool({
		name: "vscode_write_file",
		label: "write file",
		description:
			"Create a new file, fill an empty existing file, or overwrite an existing file through VS Code after user confirmation. Parent directories are created automatically.",
		promptSnippet: "vscode_write_file: propose creating or replacing an entire file for VS Code to review.",
		promptGuidelines: [
			"Use vscode_write_file when creating a new file or filling an empty existing file.",
			"Use vscode_apply_edits for targeted changes to existing files.",
			"Set overwrite=true only when intentionally replacing a non-empty existing file in full.",
		],
		parameters: Type.Object({
			path: Type.String({
				description: "File path to create or overwrite, relative to the workspace or absolute.",
			}),
			content: Type.String({ description: "Full file content to write." }),
			overwrite: Type.Optional(
				Type.Boolean({ description: "Allow replacing an existing file. Defaults to false." }),
			),
		}),
		execute: async (_toolCallId, params) => {
			const uri = resolveFileUri(options.cwd, params.path);
			const initial = await readExistingFileText(uri);
			if (typeof initial === "string") {
				return errorResult(initial, "write file");
			}
			const exists = initial.exists;
			const overwrite = params.overwrite === true;
			const existingText = initial.text;
			const canFillEmptyFile = exists && existingText.length === 0;
			if (exists && !overwrite && !canFillEmptyFile) {
				return errorResult(
					"File already exists and is not empty. Use vscode_apply_edits for targeted edits, or set overwrite=true to replace it in full.",
					"write file",
				);
			}

			const approved = await options.confirmWriteFile({
				filePath: uri.fsPath,
				content: params.content,
				overwrite: exists,
			});
			if (!approved) {
				return errorResult("User rejected the file write.", "write file");
			}

			const latest = await readExistingFileText(uri);
			if (typeof latest === "string") {
				return errorResult(latest, "write file");
			}
			if (latest.exists !== exists || latest.text !== existingText) {
				return errorResult(
					`File content changed while waiting for approval: ${toWorkspacePath(options.cwd, uri.fsPath)}. Re-read the file and propose the write again.`,
					"write file",
				);
			}

			await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirname(uri.fsPath)));
			await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(params.content));
			await vscode.window.showTextDocument(uri, { preview: false });

			const verb = exists ? (canFillEmptyFile ? "Filled" : "Overwrote") : "Created";
			return textResult(`${verb} ${toWorkspacePath(options.cwd, uri.fsPath)}.`, "write file");
		},
	});
}
