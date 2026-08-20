import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as vscode from "vscode";
import { textResult, toWorkspacePath } from "./shared.ts";
import type { VsCodeToolOptions } from "./types.ts";

export function createOpenEditorsToolDefinition(options: VsCodeToolOptions): ToolDefinition {
	return defineTool({
		name: "vscode_open_editors",
		label: "open editors",
		description:
			"List open VS Code text documents and visible editors with active, dirty, language, and line metadata.",
		promptSnippet: "vscode_open_editors: list open and visible VS Code editor documents.",
		parameters: Type.Object({}),
		execute: async () => {
			const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
			const visiblePaths = new Set(vscode.window.visibleTextEditors.map((editor) => editor.document.uri.fsPath));
			const documents = vscode.workspace.textDocuments.filter((document) => document.fileName);
			if (documents.length === 0) {
				return textResult("No open text documents.", "open editors");
			}

			const lines = documents.map((document) => {
				const markers = [
					document.uri.fsPath === activePath ? "active" : "",
					visiblePaths.has(document.uri.fsPath) ? "visible" : "",
					document.isDirty ? "dirty" : "",
					document.isUntitled ? "untitled" : "",
				].filter(Boolean);
				const markerText = markers.length > 0 ? ` [${markers.join(", ")}]` : "";
				return `${toWorkspacePath(options.cwd, document.fileName)}${markerText}\nLanguage: ${document.languageId}, lines: ${document.lineCount}`;
			});

			return textResult(lines.join("\n\n"), "open editors");
		},
	});
}
