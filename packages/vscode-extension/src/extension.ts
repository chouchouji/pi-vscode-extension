import * as vscode from "vscode";
import { PiChatViewProvider } from "./chat-view-provider.ts";

let provider: PiChatViewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
	provider = new PiChatViewProvider(context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("pi.chat", provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
		vscode.commands.registerCommand("pi.chat.focus", () => provider?.reveal()),
		vscode.commands.registerCommand("pi.chat.new", () => provider?.newChat()),
		vscode.commands.registerCommand("pi.chat.addSelection", () => provider?.addSelection()),
		vscode.commands.registerCommand("pi.chat.explainCurrentFile", () => provider?.explainCurrentFile()),
		vscode.commands.registerCommand("pi.chat.history", () => provider?.toggleSessionHistory()),
		vscode.commands.registerCommand("pi.chat.selectModel", () => provider?.selectModel()),
	);
}

export function deactivate() {
	provider?.dispose();
	provider = undefined;
}
