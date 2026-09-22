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
