import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { errorResult, formatRange, getActiveEditor, textResult, toWorkspacePath } from "./shared.ts";
import type { VsCodeToolOptions } from "./types.ts";

export function createSelectionToolDefinition(options: VsCodeToolOptions): ToolDefinition {
	return defineTool({
		name: "vscode_selection",
		label: "selection",
		description: "Read the active VS Code editor selection and its location.",
		promptSnippet: "vscode_selection: read the active selection in VS Code.",
		parameters: Type.Object({}),
		execute: async () => {
			const editor = getActiveEditor();
			if (!editor) {
				return errorResult("No active editor.", "selection");
			}

			const document = editor.document;
			const selection = editor.selection;
			const filePath = toWorkspacePath(options.cwd, document.fileName);
			if (selection.isEmpty) {
				return textResult(`File: ${filePath}\nSelection: empty at ${formatRange(selection)}`, "selection");
			}

			return textResult(
				[`File: ${filePath}`, `Range: ${formatRange(selection)}`, "", document.getText(selection)].join("\n"),
				"selection",
			);
		},
	});
}
