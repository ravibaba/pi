import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { DecisionState } from "./decision-types.ts";

/**
 * Builds a structured semantic preamble from DecisionState to be preserved
 * into the session context during compaction.
 *
 * This ensures facts, decisions, and constraints survive independently of transcript token pruning.
 */
export function buildSemanticCompactionPreamble(state: DecisionState): string {
	const sections: string[] = ["### Semantic State (Preserved by Decision Engine)"];

	sections.push(`- **Goal:** ${state.task.intent}`);
	sections.push(`- **Current Phase:** ${state.execution.phase}`);

	if (state.execution.filesChanged.length > 0) {
		sections.push(`- **Files Modified:** ${state.execution.filesChanged.join(", ")}`);
	}

	if (state.context.criticalFacts.length > 0) {
		sections.push(`- **Key Facts:**\n${state.context.criticalFacts.map((f) => `  * ${f}`).join("\n")}`);
	}

	if (state.context.decisions.length > 0) {
		sections.push(`- **Architecture Decisions:**\n${state.context.decisions.map((d) => `  * ${d}`).join("\n")}`);
	}

	if (state.context.constraints.length > 0) {
		sections.push(`- **Active Constraints:**\n${state.context.constraints.map((c) => `  * ${c}`).join("\n")}`);
	}

	if (state.context.unresolvedQuestions.length > 0) {
		sections.push(`- **Unresolved Issues:**\n${state.context.unresolvedQuestions.map((q) => `  * ${q}`).join("\n")}`);
	}

	return sections.join("\n\n");
}

/**
 * Scans historical messages for decisions, facts, and constraints to store into DecisionState
 * before history is truncated or summarized.
 */
export function extractContextFromMessages(state: DecisionState, messages: AgentMessage[]): DecisionState {
	const next = structuredClone(state);

	for (const msg of messages) {
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block.type === "text" && typeof block.text === "string") {
					// Identify decision statements (e.g. "We will use...", "Decided to...", "Pattern chosen:")
					const decisionMatch = block.text.match(
						/(?:decided to|chosen pattern:|architectural decision:)\s*([^\n.]+)/i,
					);
					if (decisionMatch?.[1]) {
						const d = decisionMatch[1].trim();
						if (!next.context.decisions.includes(d)) {
							next.context.decisions.push(d);
						}
					}
				}
			}
		}
	}

	return next;
}

/**
 * Selectively prunes bloated historical tool outputs (such as large directory listings or grep matches)
 * when Jev compaction advisor indicates tool outputs are not critical context.
 */
export function pruneRedundantToolOutputsForCompaction(
	messages: AgentMessage[],
	advice: { retainToolOutputs?: boolean } = {},
): AgentMessage[] {
	if (advice.retainToolOutputs === true) {
		return messages;
	}

	return messages.map((msg) => {
		if (msg.role === "toolResult" && Array.isArray(msg.content)) {
			const prunedContent = msg.content.map((c) => {
				if (c.type === "text" && typeof c.text === "string" && c.text.length > 400) {
					return {
						type: "text" as const,
						text: `${c.text.slice(0, 150)}\n... [Remaining ${c.text.length - 150} chars pruned by System-1 Semantic Compactor]`,
					};
				}
				return c;
			});
			return {
				...msg,
				content: prunedContent,
			};
		}
		return msg;
	});
}
