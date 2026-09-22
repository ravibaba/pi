import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import { createInitialDecisionState } from "../../decision/decision-state.ts";
import type { DecisionEngine, DecisionState } from "../../decision/decision-types.ts";
import { TASK_ROUTING_V1 } from "../../decision/question-registry.ts";

const routeSchema = Type.Object({
	task: Type.Optional(
		Type.String({
			description: "Optional specific subtask or query to evaluate. Defaults to current session intent.",
		}),
	),
});

export type RouteToolInput = Static<typeof routeSchema>;

export const jevRoutePromptContribution = {
	snippet: "Query Jev System-1 task complexity and recommended model tier",
	guidelines: ["Use jev_route to evaluate subtask difficulty, risk, and recommended compute tier."],
} as const;

export function createJevRouteTool(
	getState: () => DecisionState | undefined,
	getEngine: () => DecisionEngine,
): AgentTool<typeof routeSchema> {
	return {
		name: "jev_route",
		label: "Jev Task Router",
		description:
			"Evaluates task complexity, scope, security sensitivity, and recommended model tier (fast, standard, reasoning, deep) via Jev System-1.",
		parameters: routeSchema,
		execute: async (_callId, input) => {
			const engine = getEngine();
			const activeState = getState();

			const targetIntent = input.task?.trim() || activeState?.task.intent || "Current coding task";
			const evaluationState: DecisionState = activeState
				? {
						...activeState,
						task: {
							...activeState.task,
							intent: targetIntent,
						},
					}
				: createInitialDecisionState({ intent: targetIntent });

			try {
				const result = await engine.decide(evaluationState, TASK_ROUTING_V1, { decisionType: "task_routing" });
				const answers = result.answers;

				const tier = answers.modelTier?.choice ?? "standard";
				const complexityScore = Number(answers.complexity?.score ?? 2);
				const securitySensitive = Number(answers.securitySensitive?.noul ?? 0) > 0.5;
				const needsRepoSearch = Number(answers.needsRepoSearch?.noul ?? 0) > 0.5;
				const likelyLongHorizon = Number(answers.likelyLongHorizon?.noul ?? 0) > 0.5;

				const complexityLabels = [
					"Trivial (single-line or syntax fix)",
					"Simple (single function or file update)",
					"Moderate (multi-file feature or bug fix)",
					"Complex (subsystem refactor or subtle bug)",
					"Architectural (cross-repo overhaul)",
				];
				const complexityText = complexityLabels[complexityScore] ?? "Moderate";

				const output = `### Jev System-1 Task Routing Assessment

- **Recommended Model Tier:** \`${tier}\`
- **Complexity:** ${complexityText} (level ${complexityScore + 1}/5)
- **Security Sensitive:** ${securitySensitive ? "YES (Auth/Token/Permission handling)" : "No"}
- **Exploration Needed:** ${needsRepoSearch ? "Yes (Broad symbol discovery recommended)" : "Focused"}
- **Long Horizon Horizon:** ${likelyLongHorizon ? "Yes (>5 turns anticipated)" : "Short (<5 turns)"}

#### Recommendation:
${
	tier === "deep" || tier === "reasoning"
		? `Use a high-reasoning model for this task. Ensure isolated test verification before code commits.`
		: tier === "fast"
			? `Task is straightforward. Fast execution tier is sufficient.`
			: `Standard coding tier is well-matched for this implementation.`
}`;

				return {
					content: [{ type: "text", text: output }],
					details: {
						tier,
						complexityScore,
						securitySensitive,
						needsRepoSearch,
						likelyLongHorizon,
						latencyMs: result.latencyMs,
					},
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Jev route evaluation failed: ${error instanceof Error ? error.message : String(error)}. Proceeding with standard tier.`,
						},
					],
					details: { fallback: true },
				};
			}
		},
	};
}
