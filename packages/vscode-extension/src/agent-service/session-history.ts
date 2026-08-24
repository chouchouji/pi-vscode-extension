import { resolve } from "node:path";
import {
	getAgentDir,
	getDefaultSessionDir,
	type SessionEntry,
	type SessionInfo,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { ChatMessage, SessionSummary } from "../protocol.ts";
import { contentToText, formatUnknown } from "./chat-message-format.ts";

interface ListSessionSummariesOptions {
	cwd: string;
	agentDir?: string;
	activeSessionPath?: string;
}

function sessionLabel(session: SessionInfo): string {
	const name = session.name?.trim();
	if (name) {
		return name;
	}
	const firstMessage = session.firstMessage.trim().split("\n")[0]?.trim();
	if (firstMessage) {
		return firstMessage.length > 48 ? `${firstMessage.slice(0, 45)}...` : firstMessage;
	}
	return `Session ${session.id.slice(0, 8)}`;
}

function sessionDetail(session: SessionInfo): string {
	const modifiedDate = [
		session.modified.getFullYear(),
		String(session.modified.getMonth() + 1).padStart(2, "0"),
		String(session.modified.getDate()).padStart(2, "0"),
	].join("/");
	return `${modifiedDate} - ${session.messageCount} messages`;
}

export async function listSessionSummaries(options: ListSessionSummariesOptions): Promise<SessionSummary[]> {
	const cwd = resolve(options.cwd);
	const agentDir = options.agentDir ? resolve(options.agentDir) : getAgentDir();
	const sessions = await SessionManager.list(cwd, getDefaultSessionDir(cwd, agentDir));
	return sessions.slice(0, 30).map((session) => ({
		path: session.path,
		label: sessionLabel(session),
		detail: sessionDetail(session),
		active: options.activeSessionPath === session.path,
	}));
}

export function chatMessagesFromEntries(entries: SessionEntry[]): ChatMessage[] {
	const messages: ChatMessage[] = [];
	const toolArgsById = new Map<string, string>();
	for (const entry of entries) {
		if (entry.type !== "message" || entry.message.role !== "assistant") {
			continue;
		}
		for (const part of entry.message.content) {
			if (part.type === "toolCall") {
				const args = formatUnknown(part.arguments);
				if (args) {
					toolArgsById.set(part.id, args);
				}
			}
		}
	}

	for (const entry of entries) {
		if (entry.type !== "message") {
			continue;
		}

		const message = entry.message;
		const timestamp = new Date(entry.timestamp).getTime();
		switch (message.role) {
			case "user":
				messages.push({
					id: entry.id,
					role: "user",
					text: contentToText(message.content),
					timestamp,
				});
				break;
			case "assistant":
				messages.push({
					id: entry.id,
					role: message.errorMessage ? "error" : "assistant",
					text: message.errorMessage ?? contentToText(message.content),
					timestamp,
				});
				break;
			case "toolResult": {
				const output = contentToText(message.content);
				messages.push({
					id: entry.id,
					role: message.isError ? "error" : "tool",
					text: `${message.toolName}: ${output}`,
					tool: {
						name: message.toolName,
						status: message.isError ? "failed" : "completed",
						args: toolArgsById.get(message.toolCallId),
						output,
					},
					timestamp,
				});
				break;
			}
			case "bashExecution":
				messages.push({
					id: entry.id,
					role: message.exitCode === 0 && !message.cancelled ? "tool" : "error",
					text: `bash: ${message.output}`,
					tool: {
						name: "bash",
						status: message.exitCode === 0 && !message.cancelled ? "completed" : "failed",
						args: message.command,
						output: message.output,
					},
					timestamp,
				});
				break;
			case "custom":
				if (message.display) {
					messages.push({
						id: entry.id,
						role: "system",
						text: contentToText(message.content),
						timestamp,
					});
				}
				break;
		}
	}
	return messages;
}
