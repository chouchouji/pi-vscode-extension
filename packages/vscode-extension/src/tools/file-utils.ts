import * as vscode from "vscode";

export async function uriExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

export async function readFileOrError(uri: vscode.Uri): Promise<Uint8Array | string> {
	try {
		return await vscode.workspace.fs.readFile(uri);
	} catch {
		return "Path does not exist or is not a file.";
	}
}
