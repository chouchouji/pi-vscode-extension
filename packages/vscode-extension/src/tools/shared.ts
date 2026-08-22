import { isAbsolute, relative, resolve } from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { clamp } from "rattail";
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
	return clamp(Math.floor(value), 1, maxValue);
}

export function formatRange(range: vscode.Range): string {
	return `${range.start.line + 1}:${range.start.character + 1}-${range.end.line + 1}:${range.end.character + 1}`;
}

export function diagnosticSeverityLabel(severity: vscode.DiagnosticSeverity): string {
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

export function formatDiagnostic(diagnostic: vscode.Diagnostic): string {
	const code =
		diagnostic.code === undefined
			? ""
			: String(typeof diagnostic.code === "object" ? diagnostic.code.value : diagnostic.code);
	const source = diagnostic.source ? ` ${diagnostic.source}` : "";
	const codeSuffix = code ? ` ${code}` : "";
	return [
		`${diagnosticSeverityLabel(diagnostic.severity)}${source}${codeSuffix} ${formatRange(diagnostic.range)}`,
		diagnostic.message,
	].join("\n");
}

export function toWorkspacePath(cwd: string, filePath: string): string {
	const absolutePath = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
	return relative(cwd, absolutePath) || ".";
}

export function formatLocation(cwd: string, location: vscode.Location | vscode.LocationLink): string {
	if ("targetUri" in location) {
		return `${toWorkspacePath(cwd, location.targetUri.fsPath)}:${formatRange(location.targetRange)}`;
	}
	return `${toWorkspacePath(cwd, location.uri.fsPath)}:${formatRange(location.range)}`;
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
