import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as vscode from "vscode";
import {
	errorResult,
	formatDiagnostic,
	getActiveEditor,
	resolveFileUri,
	textResult,
	toWorkspacePath,
} from "./shared.ts";
import type { VsCodeToolOptions } from "./types.ts";

export function createDiagnosticsToolDefinition(options: VsCodeToolOptions): ToolDefinition {
	return defineTool({
		name: "vscode_diagnostics",
		label: "diagnostics",
		description: "Read VS Code diagnostics for the active file or for a specific file.",
		promptSnippet: "vscode_diagnostics: read VS Code diagnostics.",
		parameters: Type.Object({
			path: Type.Optional(Type.String({ description: "Optional file path. Defaults to the active editor file." })),
		}),
		execute: async (_toolCallId, params) => {
			const targetUri = params.path ? resolveFileUri(options.cwd, params.path) : getActiveEditor()?.document.uri;
			if (!targetUri) {
				return errorResult("No active editor and no path was provided.", "diagnostics");
			}

			const diagnostics = vscode.languages.getDiagnostics(targetUri);
			const filePath = toWorkspacePath(options.cwd, targetUri.fsPath);
			if (diagnostics.length === 0) {
				return textResult(`File: ${filePath}\nNo diagnostics.`, "diagnostics");
			}

			const lines = diagnostics.map((diagnostic) => formatDiagnostic(diagnostic));
			return textResult(`File: ${filePath}\n\n${lines.join("\n\n")}`, "diagnostics");
		},
	});
}
