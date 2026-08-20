import { getWebviewBody } from "./webview-markup.ts";
import { getWebviewScript } from "./webview-script.ts";
import { getWebviewStyles } from "./webview-styles.ts";

function nonce(): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let value = "";
	for (let i = 0; i < 32; i++) {
		value += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return value;
}

export function getWebviewHtml(): string {
	const scriptNonce = nonce();
	const styleNonce = nonce();

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${styleNonce}'; script-src 'nonce-${scriptNonce}';">
	<style nonce="${styleNonce}">
${getWebviewStyles()}
	</style>
</head>
<body>
${getWebviewBody()}
	<script nonce="${scriptNonce}">
${getWebviewScript()}
	</script>
</body>
</html>`;
}
