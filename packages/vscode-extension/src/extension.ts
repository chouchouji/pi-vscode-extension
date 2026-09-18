import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import * as vscode from "vscode";
import { PiChatViewProvider } from "./chat-view-provider.ts";

let provider: PiChatViewProvider | undefined;

const runCommand = (fn: () => Promise<void> | void) => async () => {
	try {
		await fn();
	} catch (error) {
		await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
	}
};

export function activate(context: vscode.ExtensionContext) {
	// OAuth flow modules use bundler-opaque dynamic imports that cannot resolve
	// inside the esbuild bundle; register them statically instead.
	registerBunOAuthFlows();
	provider = new PiChatViewProvider(context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("pi.chat", provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
		vscode.commands.registerCommand(
			"pi.chat.focus",
			runCommand(() => provider?.reveal()),
		),
		vscode.commands.registerCommand(
			"pi.chat.new",
			runCommand(() => provider?.newChat()),
		),
		vscode.commands.registerCommand(
			"pi.chat.addSelection",
			runCommand(() => provider?.addSelection()),
		),
		vscode.commands.registerCommand(
			"pi.chat.explainCurrentFile",
			runCommand(() => provider?.explainCurrentFile()),
		),
		vscode.commands.registerCommand(
			"pi.chat.history",
			runCommand(() => provider?.toggleSessionHistory()),
		),
		vscode.commands.registerCommand(
			"pi.chat.selectModel",
			runCommand(() => provider?.selectModel()),
		),
		vscode.commands.registerCommand(
			"pi.chat.login",
			runCommand(() => provider?.login()),
		),
		vscode.commands.registerCommand(
			"pi.chat.logout",
			runCommand(() => provider?.logout()),
		),
	);
}

export function deactivate() {
	provider?.dispose();
	provider = undefined;
}
