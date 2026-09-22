import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { DecisionEngine, DecisionState } from "../../decision/decision-types.ts";
import { STRATEGY_SUPERVISOR_V1 } from "../../decision/question-registry.ts";

const strategySchema = Type.Object({
	currentHypothesis: Type.Optional(
		Type.String({
			description: "Brief summary of what hypothesis or approach the agent is currently testing or attempting.",
		}),
	),
});

export type StrategyToolInput = Static<typeof strategySchema>;

export const jevStrategyPromptContribution = {
	snippet: "Consult System-1 strategy advisor when facing obstacles, repeated test failures, or deciding next steps",
	guidelines: [
		"Use jev_strategy when unsure whether to continue with the current approach or pivot to an alternative.",
		"Follow jev_strategy recommendations when encountering 2 or more consecutive tool or test failures.",
	],
} as const;

export function createJevStrategyTool(
	getState: () => DecisionState | undefined,
	getEngine: () => DecisionEngine,
): AgentTool<typeof strategySchema> {
	return {
		name: "jev_strategy",
		label: "Jev Strategy Advisor",
		description:
			"Queries the System-1 supervisor to evaluate current trajectory, detect stagnation or loops, and recommend the best strategic next action (continue, retry, change_strategy, escalate_model, or stop_and_verify).",
		parameters: strategySchema,
		execute: async (_toolCallId, { currentHypothesis }) => {
			const state = getState();
			const engine = getEngine();

			if (!state) {
				return {
					content: [
						{
							type: "text",
							text: "No active DecisionState found. Proceed with standard troubleshooting.",
						},
					],
					details: { fallback: true },
				};
			}

			if (currentHypothesis) {
				state.task.intent = `${state.task.intent} (Hypothesis: ${currentHypothesis})`;
			}

			try {
				const result = await engine.decide(state, STRATEGY_SUPERVISOR_V1, { decisionType: "strategy_supervisor" });
				const answers = result.answers;

				const action = answers.strategyAction?.choice ?? "continue";
				const isProgressing = Number(answers.isProgressing?.noul ?? 0.8) > 0.5;
				const isStalled = Number(answers.isStalled?.noul ?? 0.2) > 0.6;

				let actionGuidance = "";
				switch (action) {
					case "change_strategy":
						actionGuidance =
							"**Rethink Approach**: Step back from editing current code. Inspect dependency interfaces, read official examples, or trace inputs from scratch.";
						break;
					case "retry":
						actionGuidance =
							"**Surgical Retry**: The failure appeared transient or syntax-specific. Make a targeted adjustment and re-run.";
						break;
					case "escalate_model":
						actionGuidance =
							"**Escalate Reasoning**: The problem involves subtle edge cases or distributed complexity. Deeper reasoning is recommended.";
						break;
					case "stop_and_verify":
						actionGuidance =
							"**Verify Solution**: The implementation appears complete. Run existing unit tests or test manually before adding more code.";
						break;
					default:
						actionGuidance =
							"**Stay the Course**: You are making steady progress. Continue implementing the plan.";
						break;
				}

				const output = `### Jev System-1 Strategy Assessment

- **Recommended Action:** \`${action}\`
- **Trajectory Progressing:** ${isProgressing ? "Yes" : "No"}
- **Stagnation Detected:** ${isStalled ? "YES (Loop Alert)" : "No"}
- **Consecutive Failures:** ${state.execution.consecutiveFailures}
- **Oscillation Count:** ${state.execution.oscillationCount}

#### Directive:
${actionGuidance}`;

				return {
					content: [{ type: "text", text: output }],
					details: {
						action,
						isProgressing,
						isStalled,
						latencyMs: result.latencyMs,
					},
				};
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Jev strategy advisor fallback (${message}). Recommend continuing.` }],
					details: { fallback: true },
				};
			}
		},
	};
}
