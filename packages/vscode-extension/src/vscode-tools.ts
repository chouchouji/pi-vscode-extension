import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { AgentToolResult, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as vscode from "vscode";
import type { PermissionMode } from "./protocol.ts";

export interface VsCodeToolOptions {
	cwd: string;
	confirmApplyEdit: (request: ApplyEditRequest) => Promise<boolean>;
	confirmApplyEdits: (request: ApplyEditsRequest) => Promise<boolean>;
	confirmWriteFile: (request: WriteFileRequest) => Promise<boolean>;
	confirmDeleteFile: (request: DeleteFileRequest) => Promise<boolean>;
	confirmRenameFile: (request: RenameFileRequest) => Promise<boolean>;
	confirmRenameSymbol: (request: RenameSymbolRequest) => Promise<boolean>;
}

export interface ApplyEditRequest {
	filePath: string;
	oldText: string;
	newText: string;
	proposedText: string;
}

export interface ApplyEditReviewFile {
	filePath: string;
	proposedText: string;
}

export interface ApplyEditsRequest {
	files: ApplyEditReviewFile[];
}

export interface WriteFileRequest {
	filePath: string;
	content: string;
	overwrite: boolean;
}

export interface DeleteFileRequest {
	filePath: string;
}

export interface RenameFileRequest {
	oldPath: string;
	newPath: string;
	overwrite: boolean;
}

export interface RenameSymbolRequest {
	filePath: string;
	line: number;
	character: number;
	newName: string;
	files: ApplyEditReviewFile[];
}

interface ToolDetails {
	title: string;
}

interface TextReplacement {
	oldText: string;
	newText: string;
	startIndex: number;
	endIndex: number;
	range: vscode.Range;
}

interface FileEditPlan {
	uri: vscode.Uri;
	document: vscode.TextDocument;
	currentText: string;
	proposedText: string;
	replacements: TextReplacement[];
}

function textResult(text: string, title: string): AgentToolResult<ToolDetails> {
	return {
		content: [{ type: "text", text }],
		details: { title },
	};
}

function errorResult(text: string, title: string): AgentToolResult<ToolDetails> {
	return textResult(`Error: ${text}`, title);
}

function getActiveEditor(): vscode.TextEditor | undefined {
	return vscode.window.activeTextEditor;
}

function clampLimit(value: number | undefined, defaultValue: number, maxValue: number): number {
	if (value === undefined || !Number.isFinite(value)) {
		return defaultValue;
	}
	return Math.min(Math.max(Math.floor(value), 1), maxValue);
}

function formatRange(range: vscode.Range): string {
	return `${range.start.line + 1}:${range.start.character + 1}-${range.end.line + 1}:${range.end.character + 1}`;
}

function toWorkspacePath(cwd: string, filePath: string): string {
	const absolutePath = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
	return relative(cwd, absolutePath) || ".";
}

function resolveFileUri(cwd: string, filePath: string): vscode.Uri {
	return vscode.Uri.file(isAbsolute(filePath) ? filePath : resolve(cwd, filePath));
}

function positionFromOneBased(line: number, character: number): vscode.Position | string {
	if (!Number.isFinite(line) || !Number.isFinite(character) || line < 1 || character < 1) {
		return "Line and character must be 1-indexed positive numbers.";
	}
	return new vscode.Position(Math.floor(line) - 1, Math.floor(character) - 1);
}

function rangeForTextIndex(text: string, startIndex: number, oldText: string): vscode.Range {
	const before = text.slice(0, startIndex);
	const startLine = before.split("\n").length - 1;
	const startCharacter = startIndex - before.lastIndexOf("\n") - 1;
	const oldLines = oldText.split("\n");
	const endLine = startLine + oldLines.length - 1;
	const endCharacter =
		oldLines.length === 1 ? startCharacter + oldLines[0].length : oldLines[oldLines.length - 1].length;
	return new vscode.Range(new vscode.Position(startLine, startCharacter), new vscode.Position(endLine, endCharacter));
}

function textEditStart(document: vscode.TextDocument, edit: vscode.TextEdit): number {
	return document.offsetAt(edit.range.start);
}

function textEditEnd(document: vscode.TextDocument, edit: vscode.TextEdit): number {
	return document.offsetAt(edit.range.end);
}

function applyReplacementPreview(currentText: string, replacements: readonly TextReplacement[]): string {
	let proposedText = currentText;
	for (const replacement of [...replacements].sort((left, right) => right.startIndex - left.startIndex)) {
		proposedText = `${proposedText.slice(0, replacement.startIndex)}${replacement.newText}${proposedText.slice(replacement.endIndex)}`;
	}
	return proposedText;
}

async function planFileEdits(
	cwd: string,
	edits: readonly { path: string; oldText: string; newText: string }[],
): Promise<FileEditPlan[] | string> {
	const groupedEdits = new Map<string, { uri: vscode.Uri; edits: { oldText: string; newText: string }[] }>();
	for (const edit of edits) {
		const uri = resolveFileUri(cwd, edit.path);
		const existing = groupedEdits.get(uri.fsPath);
		if (existing) {
			existing.edits.push({ oldText: edit.oldText, newText: edit.newText });
		} else {
			groupedEdits.set(uri.fsPath, { uri, edits: [{ oldText: edit.oldText, newText: edit.newText }] });
		}
	}

	const plans: FileEditPlan[] = [];
	for (const group of groupedEdits.values()) {
		const document = await vscode.workspace.openTextDocument(group.uri);
		const currentText = document.getText();
		const replacements: TextReplacement[] = [];
		for (const edit of group.edits) {
			const firstIndex = currentText.indexOf(edit.oldText);
			if (firstIndex === -1) {
				return `oldText was not found in ${toWorkspacePath(cwd, group.uri.fsPath)}.`;
			}
			if (currentText.indexOf(edit.oldText, firstIndex + edit.oldText.length) !== -1) {
				return `oldText appears more than once in ${toWorkspacePath(cwd, group.uri.fsPath)}. Provide a larger unique replacement range.`;
			}
			replacements.push({
				oldText: edit.oldText,
				newText: edit.newText,
				startIndex: firstIndex,
				endIndex: firstIndex + edit.oldText.length,
				range: rangeForTextIndex(currentText, firstIndex, edit.oldText),
			});
		}

		const sorted = [...replacements].sort((left, right) => left.startIndex - right.startIndex);
		for (let index = 1; index < sorted.length; index++) {
			if (sorted[index].startIndex < sorted[index - 1].endIndex) {
				return `Edits overlap in ${toWorkspacePath(cwd, group.uri.fsPath)}. Provide non-overlapping replacements.`;
			}
		}

		plans.push({
			uri: group.uri,
			document,
			currentText,
			proposedText: applyReplacementPreview(currentText, replacements),
			replacements,
		});
	}

	return plans;
}

async function planWorkspaceEditPreviews(
	cwd: string,
	edit: vscode.WorkspaceEdit,
): Promise<ApplyEditReviewFile[] | string> {
	const files: ApplyEditReviewFile[] = [];
	for (const [uri, textEdits] of edit.entries()) {
		if (textEdits.length === 0) {
			continue;
		}

		const document = await vscode.workspace.openTextDocument(uri);
		const currentText = document.getText();
		const replacements = textEdits.map((textEdit) => ({
			oldText: currentText.slice(textEditStart(document, textEdit), textEditEnd(document, textEdit)),
			newText: textEdit.newText,
			startIndex: textEditStart(document, textEdit),
			endIndex: textEditEnd(document, textEdit),
			range: textEdit.range,
		}));
		const sorted = [...replacements].sort((left, right) => left.startIndex - right.startIndex);
		for (let index = 1; index < sorted.length; index++) {
			if (sorted[index].startIndex < sorted[index - 1].endIndex) {
				return `Rename edits overlap in ${toWorkspacePath(cwd, uri.fsPath)}.`;
			}
		}

		files.push({
			filePath: uri.fsPath,
			proposedText: applyReplacementPreview(currentText, replacements),
		});
	}

	return files;
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

async function readFileOrError(uri: vscode.Uri): Promise<Uint8Array | string> {
	try {
		return await vscode.workspace.fs.readFile(uri);
	} catch {
		return "Path does not exist or is not a file.";
	}
}

function diagnosticSeverityLabel(severity: vscode.DiagnosticSeverity): string {
	switch (severity) {
		case vscode.DiagnosticSeverity.Error:
			return "error";
		case vscode.DiagnosticSeverity.Warning:
			return "warning";
		case vscode.DiagnosticSeverity.Information:
			return "info";
		case vscode.DiagnosticSeverity.Hint:
			return "hint";
		default:
			return "unknown";
	}
}

function diagnosticCodeText(code: vscode.Diagnostic["code"]): string {
	if (code === undefined) {
		return "";
	}
	if (typeof code === "object") {
		return String(code.value);
	}
	return String(code);
}

function formatDiagnostic(diagnostic: vscode.Diagnostic): string {
	const code = diagnosticCodeText(diagnostic.code);
	const source = diagnostic.source ? ` ${diagnostic.source}` : "";
	const codeSuffix = code ? ` ${code}` : "";
	return [
		`${diagnosticSeverityLabel(diagnostic.severity)}${source}${codeSuffix} ${formatRange(diagnostic.range)}`,
		diagnostic.message,
	].join("\n");
}

function formatLocation(cwd: string, location: vscode.Location | vscode.LocationLink): string {
	if ("targetUri" in location) {
		return `${toWorkspacePath(cwd, location.targetUri.fsPath)}:${formatRange(location.targetRange)}`;
	}
	return `${toWorkspacePath(cwd, location.uri.fsPath)}:${formatRange(location.range)}`;
}

export function createVsCodeToolDefinitions(options: VsCodeToolOptions, mode: PermissionMode): ToolDefinition[] {
	const tools: ToolDefinition[] = [
		defineTool({
			name: "vscode_current_file",
			label: "current file",
			description: "Read the currently active VS Code editor file, including file path, language, and full text.",
			promptSnippet: "vscode_current_file: read the active VS Code editor file.",
			parameters: Type.Object({}),
			execute: async () => {
				const editor = getActiveEditor();
				if (!editor) {
					return errorResult("No active editor.", "current file");
				}

				const document = editor.document;
				const filePath = toWorkspacePath(options.cwd, document.fileName);
				return textResult(
					[
						`File: ${filePath}`,
						`Language: ${document.languageId}`,
						`Lines: ${document.lineCount}`,
						"",
						document.getText(),
					].join("\n"),
					"current file",
				);
			},
		}),
		defineTool({
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
		}),
		defineTool({
			name: "vscode_diagnostics",
			label: "diagnostics",
			description: "Read VS Code diagnostics for the active file or for a specific file.",
			promptSnippet: "vscode_diagnostics: read VS Code diagnostics.",
			parameters: Type.Object({
				path: Type.Optional(
					Type.String({ description: "Optional file path. Defaults to the active editor file." }),
				),
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
		}),
		defineTool({
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
		}),
		defineTool({
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
		}),
		defineTool({
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

				return textResult(
					locations.map((location) => formatLocation(options.cwd, location)).join("\n"),
					"definition",
				);
			},
		}),
		defineTool({
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
		}),
	];

	if (mode === "code") {
		tools.push(
			defineTool({
				name: "vscode_apply_edit",
				label: "apply edit",
				description:
					"Apply a text replacement to a file through VS Code after user confirmation. Use exact oldText from the current file.",
				promptSnippet: "vscode_apply_edit: propose an exact text replacement for VS Code to review and apply.",
				promptGuidelines: [
					"Use vscode_apply_edit only after reading the target file.",
					"Provide exact oldText from the file; the edit is rejected if the text is not found exactly once.",
				],
				parameters: Type.Object({
					path: Type.String({ description: "File path to edit, relative to the workspace or absolute." }),
					oldText: Type.String({ description: "Exact text to replace." }),
					newText: Type.String({ description: "Replacement text." }),
				}),
				execute: async (_toolCallId, params) => {
					const planned = await planFileEdits(options.cwd, [
						{ path: params.path, oldText: params.oldText, newText: params.newText },
					]);
					if (typeof planned === "string") {
						return errorResult(planned, "apply edit");
					}
					const plan = planned[0];

					const approved = await options.confirmApplyEdit({
						filePath: plan.uri.fsPath,
						oldText: params.oldText,
						newText: params.newText,
						proposedText: plan.proposedText,
					});
					if (!approved) {
						return errorResult("User rejected the edit.", "apply edit");
					}

					const edit = new vscode.WorkspaceEdit();
					const replacement = plan.replacements[0];
					edit.replace(plan.uri, replacement.range, replacement.newText);
					const applied = await vscode.workspace.applyEdit(edit);
					if (!applied) {
						return errorResult("VS Code did not apply the edit.", "apply edit");
					}
					const saved = await plan.document.save();
					if (!saved) {
						return errorResult("VS Code applied the edit but did not save the file.", "apply edit");
					}

					return textResult(
						`Applied and saved edit to ${toWorkspacePath(options.cwd, plan.uri.fsPath)}.`,
						"apply edit",
					);
				},
			}),
			defineTool({
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
						return errorResult(
							`VS Code applied the edits but did not save: ${unsavedFiles.join(", ")}`,
							"apply edits",
						);
					}

					return textResult(
						`Applied and saved edits to ${planned.map((plan) => toWorkspacePath(options.cwd, plan.uri.fsPath)).join(", ")}.`,
						"apply edits",
					);
				},
			}),
			defineTool({
				name: "vscode_write_file",
				label: "write file",
				description:
					"Create a new file, fill an empty existing file, or overwrite an existing file through VS Code after user confirmation. Parent directories are created automatically.",
				promptSnippet: "vscode_write_file: propose creating or replacing an entire file for VS Code to review.",
				promptGuidelines: [
					"Use vscode_write_file when creating a new file or filling an empty existing file.",
					"Use vscode_apply_edit for targeted changes to an existing file.",
					"Set overwrite=true only when intentionally replacing a non-empty existing file in full.",
				],
				parameters: Type.Object({
					path: Type.String({
						description: "File path to create or overwrite, relative to the workspace or absolute.",
					}),
					content: Type.String({ description: "Full file content to write." }),
					overwrite: Type.Optional(
						Type.Boolean({ description: "Allow replacing an existing file. Defaults to false." }),
					),
				}),
				execute: async (_toolCallId, params) => {
					const uri = resolveFileUri(options.cwd, params.path);
					const exists = await uriExists(uri);
					const overwrite = params.overwrite === true;
					const existingText = exists ? new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)) : "";
					const canFillEmptyFile = exists && existingText.length === 0;
					if (exists && !overwrite && !canFillEmptyFile) {
						return errorResult(
							"File already exists and is not empty. Use vscode_apply_edit for targeted edits, or set overwrite=true to replace it in full.",
							"write file",
						);
					}

					const approved = await options.confirmWriteFile({
						filePath: uri.fsPath,
						content: params.content,
						overwrite: exists,
					});
					if (!approved) {
						return errorResult("User rejected the file write.", "write file");
					}

					await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirname(uri.fsPath)));
					await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(params.content));
					await vscode.window.showTextDocument(uri, { preview: false });

					const verb = exists ? (canFillEmptyFile ? "Filled" : "Overwrote") : "Created";
					return textResult(`${verb} ${toWorkspacePath(options.cwd, uri.fsPath)}.`, "write file");
				},
			}),
			defineTool({
				name: "vscode_delete_file",
				label: "delete file",
				description:
					"Move a file to the trash through VS Code after user confirmation. Directories are not supported.",
				promptSnippet: "vscode_delete_file: propose moving a file to the trash through VS Code.",
				promptGuidelines: [
					"Use vscode_delete_file only for files that should be removed from the workspace.",
					"Do not use this tool for directories.",
				],
				parameters: Type.Object({
					path: Type.String({ description: "File path to delete, relative to the workspace or absolute." }),
				}),
				execute: async (_toolCallId, params) => {
					const uri = resolveFileUri(options.cwd, params.path);
					const existing = await readFileOrError(uri);
					if (typeof existing === "string") {
						return errorResult(existing, "delete file");
					}

					const approved = await options.confirmDeleteFile({ filePath: uri.fsPath });
					if (!approved) {
						return errorResult("User rejected the file deletion.", "delete file");
					}

					await vscode.workspace.fs.delete(uri, { recursive: false, useTrash: true });
					return textResult(`Moved ${toWorkspacePath(options.cwd, uri.fsPath)} to the trash.`, "delete file");
				},
			}),
			defineTool({
				name: "vscode_rename_file",
				label: "rename file",
				description:
					"Rename or move a file through VS Code after user confirmation. Parent directories are created automatically.",
				promptSnippet: "vscode_rename_file: propose renaming or moving a file through VS Code.",
				promptGuidelines: [
					"Use vscode_rename_file only for files, not directories.",
					"Set overwrite=true only when intentionally replacing an existing target file.",
				],
				parameters: Type.Object({
					oldPath: Type.String({
						description: "Current file path, relative to the workspace or absolute.",
					}),
					newPath: Type.String({
						description: "New file path, relative to the workspace or absolute.",
					}),
					overwrite: Type.Optional(
						Type.Boolean({ description: "Allow replacing an existing target file. Defaults to false." }),
					),
				}),
				execute: async (_toolCallId, params) => {
					const oldUri = resolveFileUri(options.cwd, params.oldPath);
					const newUri = resolveFileUri(options.cwd, params.newPath);
					if (oldUri.fsPath === newUri.fsPath) {
						return errorResult("Old path and new path are the same.", "rename file");
					}

					const existingSource = await readFileOrError(oldUri);
					if (typeof existingSource === "string") {
						return errorResult(existingSource, "rename file");
					}

					const overwrite = params.overwrite === true;
					const targetExists = await uriExists(newUri);
					if (targetExists && !overwrite) {
						return errorResult("Target path already exists. Set overwrite=true to replace it.", "rename file");
					}
					if (targetExists) {
						const existingTarget = await readFileOrError(newUri);
						if (typeof existingTarget === "string") {
							return errorResult("Target path exists but is not a file.", "rename file");
						}
					}

					const approved = await options.confirmRenameFile({
						oldPath: oldUri.fsPath,
						newPath: newUri.fsPath,
						overwrite,
					});
					if (!approved) {
						return errorResult("User rejected the file rename.", "rename file");
					}

					await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirname(newUri.fsPath)));
					await vscode.workspace.fs.rename(oldUri, newUri, { overwrite });
					await vscode.window.showTextDocument(newUri, { preview: false });

					return textResult(
						`Renamed ${toWorkspacePath(options.cwd, oldUri.fsPath)} to ${toWorkspacePath(options.cwd, newUri.fsPath)}.`,
						"rename file",
					);
				},
			}),
			defineTool({
				name: "vscode_rename_symbol",
				label: "rename symbol",
				description:
					"Rename a code symbol through VS Code language providers after user confirmation, updating all provider-reported references.",
				promptSnippet: "vscode_rename_symbol: propose a semantic symbol rename through VS Code language providers.",
				promptGuidelines: [
					"Use vscode_rename_symbol for language-aware renames of functions, classes, variables, properties, and imports.",
					"Use vscode_rename_file for file path renames.",
					"Read the relevant file or use vscode_definition/references before renaming ambiguous symbols.",
				],
				parameters: Type.Object({
					path: Type.String({ description: "File path, relative to the workspace or absolute." }),
					line: Type.Number({ description: "1-indexed line number at the symbol." }),
					character: Type.Number({ description: "1-indexed character number at the symbol." }),
					newName: Type.String({ description: "New symbol name." }),
				}),
				execute: async (_toolCallId, params) => {
					const position = positionFromOneBased(params.line, params.character);
					if (typeof position === "string") {
						return errorResult(position, "rename symbol");
					}
					const newName = params.newName.trim();
					if (!newName) {
						return errorResult("New symbol name cannot be empty.", "rename symbol");
					}

					const uri = resolveFileUri(options.cwd, params.path);
					const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit | undefined>(
						"vscode.executeDocumentRenameProvider",
						uri,
						position,
						newName,
					);
					if (!edit) {
						return textResult("No rename edit was returned by VS Code.", "rename symbol");
					}

					const files = await planWorkspaceEditPreviews(options.cwd, edit);
					if (typeof files === "string") {
						return errorResult(files, "rename symbol");
					}
					if (files.length === 0) {
						return textResult("VS Code returned an empty rename edit.", "rename symbol");
					}

					const approved = await options.confirmRenameSymbol({
						filePath: uri.fsPath,
						line: params.line,
						character: params.character,
						newName,
						files,
					});
					if (!approved) {
						return errorResult("User rejected the symbol rename.", "rename symbol");
					}

					const applied = await vscode.workspace.applyEdit(edit);
					if (!applied) {
						return errorResult("VS Code did not apply the symbol rename.", "rename symbol");
					}

					const unsavedFiles: string[] = [];
					for (const file of files) {
						const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file.filePath));
						if (!(await document.save())) {
							unsavedFiles.push(toWorkspacePath(options.cwd, file.filePath));
						}
					}
					if (unsavedFiles.length > 0) {
						return errorResult(
							`VS Code applied the symbol rename but did not save: ${unsavedFiles.join(", ")}`,
							"rename symbol",
						);
					}

					return textResult(
						`Renamed symbol at ${toWorkspacePath(options.cwd, uri.fsPath)}:${params.line}:${params.character} to ${newName} across ${files.length} files.`,
						"rename symbol",
					);
				},
			}),
		);
	}

	return tools;
}
