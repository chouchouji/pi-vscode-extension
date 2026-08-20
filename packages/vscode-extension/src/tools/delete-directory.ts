import { isAbsolute, relative, resolve } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as vscode from "vscode";
import { errorResult, resolveFileUri, textResult, toWorkspacePath } from "./shared.ts";
import type { VsCodeToolOptions } from "./types.ts";

const MAX_REVIEW_ENTRIES = 200;
const MAX_SCAN_ENTRIES = 2_000;

interface DirectoryScan {
	entryCount: number;
	truncated: boolean;
	samplePaths: string[];
	fingerprint: string;
}

function isDirectory(fileType: vscode.FileType): boolean {
	return (fileType & vscode.FileType.Directory) !== 0;
}

function validateWorkspaceDirectory(cwd: string, uri: vscode.Uri): string | undefined {
	const relativePath = relative(resolve(cwd), resolve(uri.fsPath));
	if (relativePath === "") {
		return "Refusing to delete the workspace root directory.";
	}
	if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
		return "Refusing to delete a directory outside the workspace root.";
	}
	return undefined;
}

async function scanDirectory(uri: vscode.Uri): Promise<DirectoryScan | string> {
	const entries: string[] = [];
	const stack: { uri: vscode.Uri; pathPrefix: string }[] = [{ uri, pathPrefix: "" }];
	let entryCount = 0;
	let truncated = false;

	while (stack.length > 0) {
		const current = stack.pop()!;
		let children: [string, vscode.FileType][];
		try {
			children = await vscode.workspace.fs.readDirectory(current.uri);
		} catch {
			return `Could not read directory: ${current.uri.fsPath}`;
		}

		children.sort(([left], [right]) => left.localeCompare(right));
		for (const [name, fileType] of children) {
			const childPath = current.pathPrefix ? `${current.pathPrefix}/${name}` : name;
			const displayPath = isDirectory(fileType) ? `${childPath}/` : childPath;
			entries.push(displayPath);
			entryCount++;

			if (entryCount >= MAX_SCAN_ENTRIES) {
				truncated = true;
				break;
			}

			if (isDirectory(fileType)) {
				stack.push({ uri: vscode.Uri.joinPath(current.uri, name), pathPrefix: childPath });
			}
		}

		if (truncated) {
			break;
		}
	}

	return {
		entryCount,
		truncated: truncated || stack.length > 0,
		samplePaths: entries.slice(0, MAX_REVIEW_ENTRIES),
		fingerprint: entries.join("\n"),
	};
}

function scansMatch(left: DirectoryScan, right: DirectoryScan): boolean {
	return (
		left.entryCount === right.entryCount &&
		left.truncated === right.truncated &&
		left.fingerprint === right.fingerprint
	);
}

export function createDeleteDirectoryToolDefinition(options: VsCodeToolOptions): ToolDefinition {
	return defineTool({
		name: "vscode_delete_directory",
		label: "delete directory",
		description:
			"Move a directory and all of its contents to the trash through VS Code after user confirmation. Workspace roots cannot be deleted.",
		promptSnippet: "vscode_delete_directory: propose moving a directory tree to the trash through VS Code.",
		promptGuidelines: [
			"Use vscode_delete_directory only when the user explicitly wants a directory removed.",
			"Do not use bash rm -rf for workspace directory deletion when this tool is available.",
		],
		parameters: Type.Object({
			path: Type.String({ description: "Directory path to delete, relative to the workspace or absolute." }),
		}),
		execute: async (_toolCallId, params) => {
			const uri = resolveFileUri(options.cwd, params.path);
			const workspaceError = validateWorkspaceDirectory(options.cwd, uri);
			if (workspaceError) {
				return errorResult(workspaceError, "delete directory");
			}

			let stat: vscode.FileStat;
			try {
				stat = await vscode.workspace.fs.stat(uri);
			} catch {
				return errorResult("Path does not exist.", "delete directory");
			}
			if (!isDirectory(stat.type)) {
				return errorResult("Path is not a directory.", "delete directory");
			}

			const scan = await scanDirectory(uri);
			if (typeof scan === "string") {
				return errorResult(scan, "delete directory");
			}

			const approved = await options.confirmDeleteDirectory({
				directoryPath: uri.fsPath,
				entryCount: scan.entryCount,
				truncated: scan.truncated,
				samplePaths: scan.samplePaths,
			});
			if (!approved) {
				return errorResult("User rejected the directory deletion.", "delete directory");
			}

			const latestScan = await scanDirectory(uri);
			if (typeof latestScan === "string") {
				return errorResult(latestScan, "delete directory");
			}
			if (!scansMatch(scan, latestScan)) {
				return errorResult(
					`Directory contents changed while waiting for approval: ${toWorkspacePath(options.cwd, uri.fsPath)}. Review the directory and request deletion again.`,
					"delete directory",
				);
			}

			await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: true });
			return textResult(`Moved ${toWorkspacePath(options.cwd, uri.fsPath)} to the trash.`, "delete directory");
		},
	});
}
