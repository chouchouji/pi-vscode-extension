import * as vscode from "vscode";
import { formatRange } from "./shared.ts";

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

function diagnosticCodeText(code: vscode.Diagnostic["code"]): string {
	if (code === undefined) {
		return "";
	}
	if (typeof code === "object") {
		return String(code.value);
	}
	return String(code);
}

export function formatDiagnostic(diagnostic: vscode.Diagnostic): string {
	const code = diagnosticCodeText(diagnostic.code);
	const source = diagnostic.source ? ` ${diagnostic.source}` : "";
	const codeSuffix = code ? ` ${code}` : "";
	return [
		`${diagnosticSeverityLabel(diagnostic.severity)}${source}${codeSuffix} ${formatRange(diagnostic.range)}`,
		diagnostic.message,
	].join("\n");
}
