import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as vscode from "vscode";
import { errorResult, formatLocation, positionFromOneBased, resolveFileUri, textResult } from "./shared.ts";
import type { VsCodeToolOptions } from "./types.ts";

export function createDefinitionToolDefinition(options: VsCodeToolOptions): ToolDefinition {
	return defineTool({
		name: "vscode_definition",
		label: "definition",
		description: "Ask VS Code language features for definition locations at a file position.",
		promptSnippet: "vscode_definition: find symbol definitions through VS Code language providers.",
		parameters: Type.Object({
			path: Type.String({ description: "File path, relative to the workspace or absolute." }),
			line: Type.Number({ description: "1-indexed line number." }),
			character: Type.Number({ description: "1-indexed character number." }),
		}),
		execute: async (_toolCallId, params) => {
			const position = positionFromOneBased(params.line, params.character);
			if (typeof position === "string") {
				return errorResult(position, "definition");
			}

			const uri = resolveFileUri(options.cwd, params.path);
			const locations: readonly (vscode.Location | vscode.LocationLink)[] | undefined =
				await vscode.commands.executeCommand<readonly (vscode.Location | vscode.LocationLink)[] | undefined>(
					"vscode.executeDefinitionProvider",
					uri,
					position,
				);
			if (!locations || locations.length === 0) {
				return textResult("No definition found.", "definition");
			}

			return textResult(locations.map((location) => formatLocation(options.cwd, location)).join("\n"), "definition");
		},
	});
}
