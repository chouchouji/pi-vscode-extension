import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as vscode from "vscode";
import { clampLimit, diagnosticSeverityLabel, formatDiagnostic, textResult, toWorkspacePath } from "./shared.ts";
import type { VsCodeToolOptions } from "./types.ts";

export function createWorkspaceDiagnosticsToolDefinition(options: VsCodeToolOptions): ToolDefinition {
	return defineTool({
		name: "vscode_workspace_diagnostics",
		label: "workspace diagnostics",
		description: "Read VS Code diagnostics across the workspace, grouped by file.",
		promptSnippet: "vscode_workspace_diagnostics: read workspace-wide VS Code diagnostics.",
		parameters: Type.Object({
			maxFiles: Type.Optional(Type.Number({ description: "Maximum files to include. Defaults to 20." })),
			maxPerFile: Type.Optional(
				Type.Number({ description: "Maximum diagnostics to include per file. Defaults to 5." }),
			),
		}),
		execute: async (_toolCallId, params) => {
			const maxFiles = clampLimit(params.maxFiles, 20, 100);
			const maxPerFile = clampLimit(params.maxPerFile, 5, 50);
			const entries = vscode.languages
				.getDiagnostics()
				.filter((entry) => entry[1].length > 0)
				.sort((left, right) => {
					const leftErrors = left[1].filter(
						(diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error,
					).length;
					const rightErrors = right[1].filter(
						(diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error,
					).length;
					return rightErrors - leftErrors || left[0].fsPath.localeCompare(right[0].fsPath);
				});

			if (entries.length === 0) {
				return textResult("No workspace diagnostics.", "workspace diagnostics");
			}

			const counts = {
				error: 0,
				warning: 0,
				info: 0,
				hint: 0,
			};
			for (const [, diagnostics] of entries) {
				for (const diagnostic of diagnostics) {
					const severity = diagnosticSeverityLabel(diagnostic.severity);
					if (severity === "error" || severity === "warning" || severity === "info" || severity === "hint") {
						counts[severity]++;
					}
				}
			}

			const lines = [
				`Summary: ${counts.error} errors, ${counts.warning} warnings, ${counts.info} infos, ${counts.hint} hints across ${entries.length} files.`,
			];
			for (const [uri, diagnostics] of entries.slice(0, maxFiles)) {
				lines.push("", `File: ${toWorkspacePath(options.cwd, uri.fsPath)} (${diagnostics.length})`);
				for (const diagnostic of diagnostics.slice(0, maxPerFile)) {
					lines.push(formatDiagnostic(diagnostic));
				}
				if (diagnostics.length > maxPerFile) {
					lines.push(`... ${diagnostics.length - maxPerFile} more diagnostics in this file.`);
				}
			}
			if (entries.length > maxFiles) {
				lines.push("", `... ${entries.length - maxFiles} more files with diagnostics.`);
			}

			return textResult(lines.join("\n"), "workspace diagnostics");
		},
	});
}
