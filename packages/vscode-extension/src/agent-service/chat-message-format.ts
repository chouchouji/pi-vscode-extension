import { isArray, isObject, isString } from "rattail";

export function createId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function contentToText(content: unknown): string {
	if (isString(content)) {
		return content;
	}
	if (!isArray(content)) {
		return "";
	}

	return content
		.map((part: unknown) => {
			if (!isObject(part)) {
				return "";
			}
			return part.type === "text" && isString(part.text) ? part.text : "";
		})
		.join("");
}

export function formatToolOutput(result: unknown, isError: boolean): string {
	if (!isObject(result)) {
		return isError ? "Tool failed." : "Tool completed.";
	}

	const parts: readonly unknown[] = isArray(result.content) ? result.content : [];
	const content = parts
		.map((part: unknown) => {
			if (!isObject(part)) {
				return "";
			}
			return part.type === "text" && isString(part.text) ? part.text : "[image]";
		})
		.join("\n");
	return content.trim() || (isError ? "Tool failed." : "Tool completed.");
}

export function formatToolTitle(result: unknown): string | undefined {
	if (!isObject(result)) {
		return;
	}
	const details = result.details;
	if (!isObject(details)) {
		return;
	}
	const title = details.title;
	return isString(title) && title.trim() ? title : undefined;
}

export function formatUnknown(value: unknown): string | undefined {
	if (value === undefined) {
		return;
	}
	if (isString(value)) {
		return value;
	}
	try {
		return JSON.stringify(value, undefined, 2);
	} catch {
		return String(value);
	}
}
