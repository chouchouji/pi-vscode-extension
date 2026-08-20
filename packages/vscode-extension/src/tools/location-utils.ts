import type * as vscode from "vscode";
import { formatRange, toWorkspacePath } from "./shared.ts";

export function formatLocation(cwd: string, location: vscode.Location | vscode.LocationLink): string {
	if ("targetUri" in location) {
		return `${toWorkspacePath(cwd, location.targetUri.fsPath)}:${formatRange(location.targetRange)}`;
	}
	return `${toWorkspacePath(cwd, location.uri.fsPath)}:${formatRange(location.range)}`;
}
