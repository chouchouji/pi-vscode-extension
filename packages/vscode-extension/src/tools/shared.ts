import { isAbsolute, relative, resolve } from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import * as vscode from "vscode";

interface ToolDetails {
	title: string;
}

export function textResult(text: string, title: string): AgentToolResult<ToolDetails> {
	return {
		content: [{ type: "text", text }],
		details: { title },
	};
}

export function errorResult(text: string, title: string): AgentToolResult<ToolDetails> {
	return textResult(`Error: ${text}`, title);
}

export function getActiveEditor(): vscode.TextEditor | undefined {
	return vscode.window.activeTextEditor;
}

export function clampLimit(value: number | undefined, defaultValue: number, maxValue: number): number {
	if (value === undefined || !Number.isFinite(value)) {
		return defaultValue;
	}
	return Math.min(Math.max(Math.floor(value), 1), maxValue);
}

export function formatRange(range: vscode.Range): string {
	return `${range.start.line + 1}:${range.start.character + 1}-${range.end.line + 1}:${range.end.character + 1}`;
}

export function toWorkspacePath(cwd: string, filePath: string): string {
	const absolutePath = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
	return relative(cwd, absolutePath) || ".";
}

export function resolveFileUri(cwd: string, filePath: string): vscode.Uri {
	return vscode.Uri.file(isAbsolute(filePath) ? filePath : resolve(cwd, filePath));
}

export function positionFromOneBased(line: number, character: number): vscode.Position | string {
	if (!Number.isFinite(line) || !Number.isFinite(character) || line < 1 || character < 1) {
		return "Line and character must be 1-indexed positive numbers.";
	}
	return new vscode.Position(Math.floor(line) - 1, Math.floor(character) - 1);
}
