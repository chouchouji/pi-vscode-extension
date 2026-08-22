import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as vscode from "vscode";
import { clampLimit, errorResult, formatLocation, positionFromOneBased, resolveFileUri, textResult } from "./shared.ts";
import type { VsCodeToolOptions } from "./types.ts";

export function createReferencesToolDefinition(options: VsCodeToolOptions): ToolDefinition {
	return defineTool({
		name: "vscode_references",
		label: "references",
		description: "Ask VS Code language features for reference locations at a file position.",
		promptSnippet: "vscode_references: find symbol references through VS Code language providers.",
		parameters: Type.Object({
			path: Type.String({ description: "File path, relative to the workspace or absolute." }),
			line: Type.Number({ description: "1-indexed line number." }),
			character: Type.Number({ description: "1-indexed character number." }),
			includeDeclaration: Type.Optional(
				Type.Boolean({ description: "Whether to include the symbol declaration. Defaults to false." }),
			),
			limit: Type.Optional(Type.Number({ description: "Maximum references to include. Defaults to 50." })),
		}),
		execute: async (_toolCallId, params) => {
			const position = positionFromOneBased(params.line, params.character);
			if (typeof position === "string") {
				return errorResult(position, "references");
			}

			const uri = resolveFileUri(options.cwd, params.path);
			const locations: readonly vscode.Location[] | undefined = await vscode.commands.executeCommand<
				readonly vscode.Location[] | undefined
			>("vscode.executeReferenceProvider", uri, position, {
				includeDeclaration: params.includeDeclaration === true,
			});
			if (!locations || locations.length === 0) {
				return textResult("No references found.", "references");
			}

			const limit = clampLimit(params.limit, 50, 500);
			const lines = locations.slice(0, limit).map((location) => formatLocation(options.cwd, location));
			if (locations.length > limit) {
				lines.push(`... ${locations.length - limit} more references.`);
			}

			return textResult(lines.join("\n"), "references");
		},
	});
}
