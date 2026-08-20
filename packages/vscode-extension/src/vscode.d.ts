declare module "vscode" {
	export interface Disposable {
		dispose(): void;
	}

	export class Uri {
		readonly fsPath: string;
		readonly path: string;
		static file(path: string): Uri;
		static joinPath(base: Uri, ...pathSegments: string[]): Uri;
	}

	export class Position {
		readonly line: number;
		readonly character: number;
		constructor(line: number, character: number);
	}

	export class Range {
		readonly start: Position;
		readonly end: Position;
		constructor(start: Position, end: Position);
	}

	export class Selection extends Range {
		readonly isEmpty: boolean;
	}

	export class WorkspaceEdit {
		replace(uri: Uri, range: Range, newText: string): void;
		insert(uri: Uri, position: Position, newText: string): void;
		entries(): [Uri, TextEdit[]][];
	}

	export type ViewColumn = -2;
	export const ViewColumn: {
		readonly Beside: -2;
	};

	export type DiagnosticSeverity = 0 | 1 | 2 | 3;
	export const DiagnosticSeverity: {
		readonly Error: 0;
		readonly Warning: 1;
		readonly Information: 2;
		readonly Hint: 3;
	};

	export interface TextLine {
		readonly text: string;
	}

	export interface TextDocument {
		readonly uri: Uri;
		readonly fileName: string;
		readonly languageId: string;
		readonly lineCount: number;
		readonly isDirty: boolean;
		readonly isUntitled: boolean;
		getText(range?: Range): string;
		lineAt(line: number): TextLine;
		offsetAt(position: Position): number;
		save(): Thenable<boolean>;
	}

	export interface TextEditor {
		readonly document: TextDocument;
		selection: Selection;
	}

	export interface Diagnostic {
		readonly range: Range;
		readonly message: string;
		readonly severity: DiagnosticSeverity;
		readonly source?: string;
		readonly code?: string | number | { value: string | number };
	}

	export interface TextEdit {
		readonly range: Range;
		readonly newText: string;
	}

	export interface Location {
		readonly uri: Uri;
		readonly range: Range;
	}

	export interface LocationLink {
		readonly targetUri: Uri;
		readonly targetRange: Range;
		readonly targetSelectionRange?: Range;
		readonly originSelectionRange?: Range;
	}

	export interface Webview {
		options: WebviewOptions;
		html: string;
		postMessage(message: unknown): Thenable<boolean>;
		onDidReceiveMessage(listener: (message: unknown) => void): Disposable;
		asWebviewUri(localResource: Uri): Uri;
		cspSource: string;
	}

	export interface WebviewOptions {
		enableScripts?: boolean;
		localResourceRoots?: Uri[];
	}

	export interface WebviewView {
		readonly webview: Webview;
		show?(preserveFocus?: boolean): void;
	}

	export interface WebviewViewProvider {
		resolveWebviewView(webviewView: WebviewView): void | Thenable<void>;
	}

	export interface WebviewViewProviderOptions {
		webviewOptions?: {
			retainContextWhenHidden?: boolean;
		};
	}

	export interface ExtensionContext {
		readonly extensionUri: Uri;
		readonly extensionPath: string;
		readonly globalStorageUri: Uri;
		readonly subscriptions: Disposable[];
	}

	export interface WorkspaceFolder {
		readonly uri: Uri;
		readonly name: string;
	}

	export interface Configuration {
		get<T>(section: string, defaultValue: T): T;
	}

	export namespace window {
		export const activeTextEditor: TextEditor | undefined;
		export const visibleTextEditors: readonly TextEditor[];
		export function registerWebviewViewProvider(
			viewId: string,
			provider: WebviewViewProvider,
			options?: WebviewViewProviderOptions,
		): Disposable;
		export function showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>;
		export function showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
		export function showTextDocument(
			uri: Uri,
			options?: { preview?: boolean; viewColumn?: ViewColumn },
		): Thenable<TextEditor>;
		export function createTextEditorDecorationType(options: unknown): Disposable;
	}

	export namespace workspace {
		export const workspaceFolders: readonly WorkspaceFolder[] | undefined;
		export const textDocuments: readonly TextDocument[];
		export function getConfiguration(section?: string): Configuration;
		export const fs: {
			readFile(uri: Uri): Thenable<Uint8Array>;
			stat(uri: Uri): Thenable<unknown>;
			createDirectory(uri: Uri): Thenable<void>;
			writeFile(uri: Uri, content: Uint8Array): Thenable<void>;
			delete(uri: Uri, options?: { recursive?: boolean; useTrash?: boolean }): Thenable<void>;
			rename(source: Uri, target: Uri, options?: { overwrite?: boolean }): Thenable<void>;
		};
		export function applyEdit(edit: WorkspaceEdit): Thenable<boolean>;
		export function openTextDocument(uri: Uri): Thenable<TextDocument>;
		export function asRelativePath(pathOrUri: string | Uri, includeWorkspaceFolder?: boolean): string;
	}

	export namespace commands {
		export function registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable;
		export function executeCommand<T = unknown>(command: string, ...rest: unknown[]): Thenable<T>;
	}

	export namespace languages {
		export function getDiagnostics(uri: Uri): Diagnostic[];
		export function getDiagnostics(): [Uri, Diagnostic[]][];
	}
}
