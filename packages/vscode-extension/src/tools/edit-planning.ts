import * as vscode from "vscode";
import { resolveFileUri, toWorkspacePath } from "./shared.ts";
import type { ApplyEditReviewFile } from "./types.ts";

interface TextReplacement {
	oldText: string;
	newText: string;
	startIndex: number;
	endIndex: number;
	range: vscode.Range;
}

export interface FileEditPlan {
	uri: vscode.Uri;
	document: vscode.TextDocument;
	currentText: string;
	proposedText: string;
	replacements: TextReplacement[];
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

export async function planFileEdits(
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

export async function planWorkspaceEditPreviews(
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
