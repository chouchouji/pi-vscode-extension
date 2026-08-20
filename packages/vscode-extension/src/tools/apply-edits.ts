import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as vscode from "vscode";
import { planFileEdits } from "./edit-planning.ts";
import { errorResult, textResult, toWorkspacePath } from "./shared.ts";
import type { VsCodeToolOptions } from "./types.ts";

export function createApplyEditsToolDefinition(options: VsCodeToolOptions): ToolDefinition {
	return defineTool({
		name: "vscode_apply_edits",
		label: "apply edits",
		description:
			"Apply multiple exact text replacements through VS Code after one user review. Use exact oldText from the current files.",
		promptSnippet:
			"vscode_apply_edits: propose multiple exact text replacements for VS Code to review and apply together.",
		promptGuidelines: [
			"Use vscode_apply_edits for coordinated edits across multiple files.",
			"Read each target file before editing it.",
			"Provide exact oldText values; every replacement is rejected if any oldText is missing, duplicated, or overlapping.",
		],
		parameters: Type.Object({
			edits: Type.Array(
				Type.Object({
					path: Type.String({ description: "File path to edit, relative to the workspace or absolute." }),
					oldText: Type.String({ description: "Exact text to replace." }),
					newText: Type.String({ description: "Replacement text." }),
				}),
				{ minItems: 1, description: "One or more exact replacements to apply together." },
			),
		}),
		execute: async (_toolCallId, params) => {
			const planned = await planFileEdits(options.cwd, params.edits);
			if (typeof planned === "string") {
				return errorResult(planned, "apply edits");
			}

			const approved = await options.confirmApplyEdits({
				files: planned.map((plan) => ({
					filePath: plan.uri.fsPath,
					proposedText: plan.proposedText,
				})),
			});
			if (!approved) {
				return errorResult("User rejected the edits.", "apply edits");
			}

			const edit = new vscode.WorkspaceEdit();
			for (const plan of planned) {
				for (const replacement of plan.replacements) {
					edit.replace(plan.uri, replacement.range, replacement.newText);
				}
			}
			const applied = await vscode.workspace.applyEdit(edit);
			if (!applied) {
				return errorResult("VS Code did not apply the edits.", "apply edits");
			}

			const unsavedFiles: string[] = [];
			for (const plan of planned) {
				if (!(await plan.document.save())) {
					unsavedFiles.push(toWorkspacePath(options.cwd, plan.uri.fsPath));
				}
			}
			if (unsavedFiles.length > 0) {
				return errorResult(`VS Code applied the edits but did not save: ${unsavedFiles.join(", ")}`, "apply edits");
			}

			return textResult(
				`Applied and saved edits to ${planned.map((plan) => toWorkspacePath(options.cwd, plan.uri.fsPath)).join(", ")}.`,
				"apply edits",
			);
		},
	});
}
