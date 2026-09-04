import * as vscode from "vscode";
import { getWebviewBody } from "./markup.ts";
import { getWebviewScript } from "./script.ts";
import { getWebviewStyles } from "./styles.ts";

function nonce(): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let value = "";
	for (let i = 0; i < 32; i++) {
		value += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return value;
}

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	const scriptNonce = nonce();
	const styleNonce = nonce();
	const highlighterScriptUri = `${webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, "dist", "webview-highlighter.js"),
	)}?v=6`;
	const mermaidScriptUri = `${webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, "dist", "webview-mermaid.js"),
	)}?v=2`;
	const avatarUri = `${webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "icon.png"))}`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}' ${webview.cspSource};">
	<style nonce="${styleNonce}">
${getWebviewStyles()}
	</style>
</head>
<body>
${getWebviewBody()}
	<script nonce="${scriptNonce}">
${getWebviewScript(highlighterScriptUri, mermaidScriptUri, scriptNonce, avatarUri)}
	</script>
</body>
</html>`;
}
