import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { PermissionMode } from "../protocol.ts";
import { createApplyEditsToolDefinition } from "./apply-edits.ts";
import { createDefinitionToolDefinition } from "./definition.ts";
import { createDeleteFileToolDefinition } from "./delete-file.ts";
import { createDiagnosticsToolDefinition } from "./diagnostics.ts";
import { createOpenEditorsToolDefinition } from "./open-editors.ts";
import { createReferencesToolDefinition } from "./references.ts";
import { createRenameSymbolToolDefinition } from "./rename-symbol.ts";
import { createSelectionToolDefinition } from "./selection.ts";
import type { VsCodeToolOptions } from "./types.ts";
import { createWorkspaceDiagnosticsToolDefinition } from "./workspace-diagnostics.ts";
import { createWriteFileToolDefinition } from "./write-file.ts";

export type {
	ApplyEditReviewFile,
	ApplyEditsRequest,
	DeleteFileRequest,
	RenameSymbolRequest,
	VsCodeToolOptions,
	WriteFileRequest,
} from "./types.ts";

export function createVsCodeToolDefinitions(options: VsCodeToolOptions, mode: PermissionMode): ToolDefinition[] {
	const tools: ToolDefinition[] = [
		createSelectionToolDefinition(options),
		createDiagnosticsToolDefinition(options),
		createWorkspaceDiagnosticsToolDefinition(options),
		createOpenEditorsToolDefinition(options),
		createDefinitionToolDefinition(options),
		createReferencesToolDefinition(options),
	];

	if (mode === "code") {
		tools.push(
			createApplyEditsToolDefinition(options),
			createWriteFileToolDefinition(options),
			createDeleteFileToolDefinition(options),
			createRenameSymbolToolDefinition(options),
		);
	}

	return tools;
}
