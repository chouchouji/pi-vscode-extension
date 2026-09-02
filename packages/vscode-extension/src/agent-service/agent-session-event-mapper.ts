import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ChatMessage } from "../protocol.ts";
import { contentToText, createId, formatToolOutput, formatToolTitle, formatUnknown } from "./chat-message-format.ts";
import type { PiAgentServiceEvent } from "./events.ts";

interface AgentSessionEventMapperOptions {
	onEvent: (event: PiAgentServiceEvent) => void;
	onModelChanged: () => void;
	onRunningChanged: (running: boolean) => void;
}

function formatToolResultText(event: Extract<AgentSessionEvent, { type: "tool_execution_end" }>): string {
	return formatToolOutput(event.result, event.isError);
}

export class AgentSessionEventMapper {
	private assistantMessageId: string | undefined;
	private readonly toolMessageIds = new Map<string, string>();
	private readonly toolArgs = new Map<string, string>();
	private readonly onEvent: (event: PiAgentServiceEvent) => void;
	private readonly onModelChanged: () => void;
	private readonly onRunningChanged: (running: boolean) => void;

	constructor(options: AgentSessionEventMapperOptions) {
		this.onEvent = options.onEvent;
		this.onModelChanged = options.onModelChanged;
		this.onRunningChanged = options.onRunningChanged;
	}

	reset() {
		this.assistantMessageId = undefined;
		this.toolMessageIds.clear();
		this.toolArgs.clear();
	}

	handle(event: AgentSessionEvent) {
		switch (event.type) {
			case "message_start": {
				if (event.message.role === "assistant") {
					const id = createId("assistant");
					this.assistantMessageId = id;
					this.onEvent({
						type: "append",
						message: {
							id,
							role: "assistant",
							text: "",
							working: true,
							timestamp: event.message.timestamp,
						},
					});
				} else if (event.message.role === "user") {
					const text = contentToText(event.message.content);
					if (text.trim()) {
						this.onEvent({
							type: "append",
							message: { id: createId("user"), role: "user", text, timestamp: event.message.timestamp },
						});
					}
				}
				break;
			}
			case "message_update": {
				if (event.assistantMessageEvent.type === "text_delta" && this.assistantMessageId) {
					this.onEvent({
						type: "appendDelta",
						id: this.assistantMessageId,
						delta: event.assistantMessageEvent.delta,
					});
				}
				break;
			}
			case "message_end": {
				if (event.message.role === "assistant" && this.assistantMessageId) {
					const chatMessageId = this.assistantMessageId;
					const failed = event.message.stopReason === "error";
					const text = failed
						? (event.message.errorMessage ?? "Request failed")
						: contentToText(event.message.content);
					this.onEvent({
						type: "replace",
						id: chatMessageId,
						...(failed ? { role: "error" as const } : {}),
						text,
						working: false,
						timestamp: event.message.timestamp,
					});
					this.assistantMessageId = undefined;
				}
				break;
			}
			case "tool_execution_start": {
				const id = createId("tool");
				const args = formatUnknown(event.args);
				this.toolMessageIds.set(event.toolCallId, id);
				if (args) {
					this.toolArgs.set(event.toolCallId, args);
				}
				this.onEvent({
					type: "append",
					message: {
						id,
						role: "tool",
						text: `Running ${event.toolName}...`,
						working: true,
						timestamp: Date.now(),
						tool: {
							name: event.toolName,
							status: "running",
							args,
						},
					},
				});
				break;
			}
			case "tool_execution_update": {
				const id = this.toolMessageIds.get(event.toolCallId);
				if (!id) {
					break;
				}
				const args = formatUnknown(event.args) ?? this.toolArgs.get(event.toolCallId);
				if (args) {
					this.toolArgs.set(event.toolCallId, args);
				}
				this.onEvent({
					type: "replace",
					id,
					text: `Running ${event.toolName}...`,
					working: true,
					tool: {
						name: event.toolName,
						status: "running",
						args,
						output: formatToolOutput(event.partialResult, false),
						title: formatToolTitle(event.partialResult),
					},
				});
				break;
			}
			case "tool_execution_end": {
				const id = this.toolMessageIds.get(event.toolCallId);
				this.toolMessageIds.delete(event.toolCallId);
				const args = this.toolArgs.get(event.toolCallId);
				this.toolArgs.delete(event.toolCallId);
				const output = formatToolResultText(event);
				const message: ChatMessage = {
					id: id ?? createId("tool"),
					role: event.isError ? "error" : "tool",
					text: `${event.toolName}: ${output}`,
					working: false,
					timestamp: Date.now(),
					tool: {
						name: event.toolName,
						status: event.isError ? "failed" : "completed",
						args,
						output,
						title: formatToolTitle(event.result),
					},
				};
				if (id) {
					this.onEvent({
						type: "replace",
						id,
						role: message.role,
						text: message.text,
						working: message.working,
						tool: message.tool,
					});
				} else {
					this.onEvent({ type: "append", message });
				}
				break;
			}
			case "agent_end":
			case "agent_settled":
				this.onRunningChanged(false);
				this.onEvent({ type: "running", running: false });
				break;
			case "queue_update":
				this.onEvent({
					type: "queueUpdate",
					steering: [...event.steering],
					followUp: [...event.followUp],
				});
				break;
			case "entry_appended":
				if (event.entry.type === "model_change") {
					this.onModelChanged();
				}
				break;
			case "thinking_level_changed":
				this.onModelChanged();
				break;
		}
	}
}
