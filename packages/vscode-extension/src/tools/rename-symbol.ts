import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as vscode from "vscode";
import { planWorkspaceEditPreviews } from "./edit-planning.ts";
import { errorResult, positionFromOneBased, resolveFileUri, textResult, toWorkspacePath } from "./shared.ts";
import type { VsCodeToolOptions } from "./types.ts";

export function createRenameSymbolToolDefinition(options: VsCodeToolOptions): ToolDefinition {
	return defineTool({
		name: "vscode_rename_symbol",
		label: "rename symbol",
		description:
			"Rename a code symbol through VS Code language providers after user confirmation, updating all provider-reported references.",
		promptSnippet: "vscode_rename_symbol: propose a semantic symbol rename through VS Code language providers.",
		promptGuidelines: [
			"Use vscode_rename_symbol for language-aware renames of functions, classes, variables, properties, and imports.",
			"Read the relevant file or use vscode_definition/references before renaming ambiguous symbols.",
		],
		parameters: Type.Object({
			path: Type.String({ description: "File path, relative to the workspace or absolute." }),
			line: Type.Number({ description: "1-indexed line number at the symbol." }),
			character: Type.Number({ description: "1-indexed character number at the symbol." }),
			newName: Type.String({ description: "New symbol name." }),
		}),
		execute: async (_toolCallId, params) => {
			const position = positionFromOneBased(params.line, params.character);
			if (typeof position === "string") {
				return errorResult(position, "rename symbol");
			}
			const newName = params.newName.trim();
			if (!newName) {
				return errorResult("New symbol name cannot be empty.", "rename symbol");
			}

			const uri = resolveFileUri(options.cwd, params.path);
			const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit | undefined>(
				"vscode.executeDocumentRenameProvider",
				uri,
				position,
				newName,
			);
			if (!edit) {
				return textResult("No rename edit was returned by VS Code.", "rename symbol");
			}

			const files = await planWorkspaceEditPreviews(options.cwd, edit);
			if (typeof files === "string") {
				return errorResult(files, "rename symbol");
			}
			if (files.length === 0) {
				return textResult("VS Code returned an empty rename edit.", "rename symbol");
			}

			const approved = await options.confirmRenameSymbol({
				filePath: uri.fsPath,
				line: params.line,
				character: params.character,
				newName,
				files,
			});
			if (!approved) {
				return errorResult("User rejected the symbol rename.", "rename symbol");
			}

			const applied = await vscode.workspace.applyEdit(edit);
			if (!applied) {
				return errorResult("VS Code did not apply the symbol rename.", "rename symbol");
			}

			const unsavedFiles: string[] = [];
			for (const file of files) {
				const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file.filePath));
				if (!(await document.save())) {
					unsavedFiles.push(toWorkspacePath(options.cwd, file.filePath));
				}
			}
			if (unsavedFiles.length > 0) {
				return errorResult(
					`VS Code applied the symbol rename but did not save: ${unsavedFiles.join(", ")}`,
					"rename symbol",
				);
			}

			return textResult(
				`Renamed symbol at ${toWorkspacePath(options.cwd, uri.fsPath)}:${params.line}:${params.character} to ${newName} across ${files.length} files.`,
				"rename symbol",
			);
		},
	});
}
