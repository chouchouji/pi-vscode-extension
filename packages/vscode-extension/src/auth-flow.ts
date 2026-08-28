import type { AuthEvent, AuthInteraction, AuthPrompt, AuthType } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import * as vscode from "vscode";

const LOGIN_CANCELLED = "Login cancelled";

interface LoginProviderOption {
	id: string;
	name: string;
	authTypes: AuthType[];
	configured: boolean;
	statusLabel?: string;
}

/**
 * Providers that offer an interactive login (OAuth or API key prompt).
 * Ambient-only providers (AWS credentials, ADC files, env vars) have no
 * interactive login and are not listed.
 */
export function listLoginProviderOptions(runtime: ModelRuntime): LoginProviderOption[] {
	const options: LoginProviderOption[] = [];
	for (const provider of runtime.getProviders()) {
		const authTypes: AuthType[] = [];
		if (provider.auth.oauth) {
			authTypes.push("oauth");
		}
		if (provider.auth.apiKey?.login) {
			authTypes.push("api_key");
		}
		if (authTypes.length === 0) {
			continue;
		}
		const status = runtime.getProviderAuthStatus(provider.id);
		options.push({
			id: provider.id,
			name: provider.name,
			authTypes,
			configured: status.configured,
			statusLabel: status.configured ? (status.label ?? status.source) : undefined,
		});
	}
	return options.sort((a, b) => a.name.localeCompare(b.name));
}

/** AuthInteraction backed by VS Code input boxes, quick picks, and notifications. */
function createAuthInteraction(): AuthInteraction {
	return {
		prompt: async (prompt: AuthPrompt): Promise<string> => {
			if (prompt.type === "select") {
				const picked = await vscode.window.showQuickPick(
					prompt.options.map((option) => ({
						label: option.label,
						description: option.description,
						id: option.id,
					})),
					{ placeHolder: prompt.message, ignoreFocusOut: true },
				);
				if (!picked) {
					throw new Error(LOGIN_CANCELLED);
				}
				return picked.id;
			}
			const value = await vscode.window.showInputBox({
				prompt: prompt.message,
				placeHolder: prompt.placeholder,
				password: prompt.type === "secret",
				ignoreFocusOut: true,
				validateInput: (input) => (prompt.type === "text" || input.trim() ? undefined : "Input is required"),
			});
			if (value === undefined) {
				throw new Error(LOGIN_CANCELLED);
			}
			return value;
		},
		notify: (event: AuthEvent): void => {
			switch (event.type) {
				case "auth_url":
					void vscode.env.openExternal(vscode.Uri.parse(event.url));
					void vscode.window.showInformationMessage(
						event.instructions ?? "Opened the sign-in page in your browser.",
					);
					break;
				case "device_code":
					void vscode.env.openExternal(vscode.Uri.parse(event.verificationUri));
					void vscode.window.showInformationMessage(`Enter code ${event.userCode} to sign in.`);
					break;
				case "info":
					void vscode.window.showInformationMessage(event.message);
					break;
				case "progress":
					vscode.window.setStatusBarMessage(event.message, 5000);
					break;
			}
		},
	};
}

/**
 * Interactive login: pick a provider (unless preselected), pick an auth method
 * when the provider offers both, then run the provider's login flow.
 * Resolves true when a credential was stored.
 */
export async function runLoginFlow(runtime: ModelRuntime, preselectedProviderId?: string): Promise<boolean> {
	const options = listLoginProviderOptions(runtime);
	if (options.length === 0) {
		void vscode.window.showWarningMessage("No providers support interactive login.");
		return false;
	}

	let option = preselectedProviderId ? options.find((candidate) => candidate.id === preselectedProviderId) : undefined;
	if (!option) {
		const picked = await vscode.window.showQuickPick(
			options.map((candidate) => ({
				label: candidate.name,
				description: candidate.configured
					? `Configured${candidate.statusLabel ? ` (${candidate.statusLabel})` : ""}`
					: undefined,
				detail: candidate.id,
				option: candidate,
			})),
			{ placeHolder: "Select a provider to sign in", matchOnDetail: true },
		);
		if (!picked) {
			return false;
		}
		option = picked.option;
	}

	let authType = option.authTypes[0];
	if (option.authTypes.length > 1) {
		const provider = runtime.getProvider(option.id);
		const oauthLabel = provider?.auth.oauth?.loginLabel ?? provider?.auth.oauth?.name ?? "Sign in with an account";
		const apiKeyLabel = provider?.auth.apiKey?.name ?? "Sign in with an API key";
		const picked = await vscode.window.showQuickPick(
			[
				{ label: oauthLabel, authType: "oauth" as const },
				{ label: apiKeyLabel, authType: "api_key" as const },
			],
			{ placeHolder: `Select authentication method for ${option.name}` },
		);
		if (!picked) {
			return false;
		}
		authType = picked.authType;
	}

	try {
		await runtime.login(option.id, authType, createAuthInteraction());
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message !== LOGIN_CANCELLED) {
			void vscode.window.showErrorMessage(`Failed to sign in to ${option.name}: ${message}`);
		}
		return false;
	}
	void vscode.window.showInformationMessage(`Signed in to ${option.name}.`);
	return true;
}

/** Interactive logout: pick a stored credential and remove it. */
export async function runLogoutFlow(runtime: ModelRuntime): Promise<boolean> {
	const credentials = await runtime.listCredentials();
	if (credentials.length === 0) {
		void vscode.window.showInformationMessage("No stored credentials.");
		return false;
	}
	const picked = await vscode.window.showQuickPick(
		credentials.map((credential) => ({
			label: runtime.getProvider(credential.providerId)?.name ?? credential.providerId,
			description: credential.type === "oauth" ? "OAuth" : "API key",
			detail: credential.providerId,
			providerId: credential.providerId,
		})),
		{ placeHolder: "Select a provider to sign out", matchOnDetail: true },
	);
	if (!picked) {
		return false;
	}
	await runtime.logout(picked.providerId);
	void vscode.window.showInformationMessage(`Signed out of ${picked.label}.`);
	return true;
}
