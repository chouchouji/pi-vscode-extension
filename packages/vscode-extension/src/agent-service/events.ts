import type { ChatMessage, ModelStatus, ToolMessage } from "../protocol.ts";

export type PiAgentServiceEvent =
	| { type: "append"; message: ChatMessage }
	| { type: "appendDelta"; id: string; delta: string }
	| {
			type: "replace";
			id: string;
			role?: ChatMessage["role"];
			text: string;
			working?: boolean;
			tool?: ToolMessage;
			timestamp?: number;
	  }
	| { type: "running"; running: boolean }
	| { type: "queueUpdate"; steering: string[]; followUp: string[] }
	| { type: "modelStatus"; modelStatus: ModelStatus | undefined };
