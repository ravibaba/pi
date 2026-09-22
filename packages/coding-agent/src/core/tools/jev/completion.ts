import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import { createInitialDecisionState } from "../../decision/decision-state.ts";
import type { DecisionEngine, DecisionState } from "../../decision/decision-types.ts";
import { COMPLETION_VERIFICATION_V1 } from "../../decision/question-registry.ts";

const completionSchema = Type.Object({
	notes: Type.Optional(
		Type.String({
			description: "Optional notes or implementation summary describing what was accomplished.",
		}),
	),
});

export type CompletionToolInput = Static<typeof completionSchema>;

export const jevCompletionPromptContribution = {
	snippet: "Evaluate whether acceptance criteria and task goals are fully satisfied before finishing",
	guidelines: ["Use jev_completion to verify whether implementation and testing are sufficient before concluding."],
} as const;

export function createJevCompletionTool(
	getState: () => DecisionState | undefined,
	getEngine: () => DecisionEngine,
): AgentTool<typeof completionSchema> {
	return {
		name: "jev_completion",
		label: "Jev Completion Verifier",
		description:
			"Evaluates whether user intent is fulfilled, tests/diagnostics are sufficient, and whether unresolved blockers remain via Jev System-1.",
		parameters: completionSchema,
		execute: async (_callId, input) => {
			const engine = getEngine();
			const activeState = getState();

			const notesAppend = input.notes ? `\n[Implementation Notes]:\n${input.notes}` : "";
			const evalState: DecisionState = activeState
				? {
						...activeState,
						task: {
							...activeState.task,
							intent: `${activeState.task.intent}${notesAppend}`,
						},
					}
				: createInitialDecisionState({
						intent: `Completion verification${notesAppend}`,
					});

			try {
				const result = await engine.decide(evalState, COMPLETION_VERIFICATION_V1, {
					decisionType: "completion_verification",
				});
				const answers = result.answers;

				const goalSatisfied = Number(answers.goalSatisfied?.noul ?? 0.5);
				const verificationSufficient = Number(answers.verificationSufficient?.noul ?? 0.5);
				const remainingBlockers = Number(answers.remainingBlockers?.noul ?? 0.5);

				const isReady = goalSatisfied > 0.7 && verificationSufficient > 0.6 && remainingBlockers < 0.3;

				const recommendations: string[] = [];
				if (goalSatisfied <= 0.7) {
					recommendations.push(
						"- **Goal Fulfillment Gap**: Requirements may only be partially implemented. Review the original user prompt.",
					);
				}
				if (verificationSufficient <= 0.6) {
					recommendations.push(
						"- **Insufficient Verification**: Run automated tests (`jev_test_select`) or verify diagnostics before concluding.",
					);
				}
				if (remainingBlockers >= 0.3) {
					recommendations.push(
						"- **Potential Blockers Detected**: Check for unhandled error conditions or failing assertions.",
					);
				}
				if (recommendations.length === 0) {
					recommendations.push("- **Ready to Settle**: All acceptance criteria appear satisfied.");
				}

				const output = `### Jev Completion Verification Assessment

- **Overall Readiness:** \`${isReady ? "READY" : "INCOMPLETE"}\`
- **Goal Satisfied Confidence:** ${(goalSatisfied * 100).toFixed(0)}%
- **Verification Quality:** ${(verificationSufficient * 100).toFixed(0)}%
- **Remaining Blockers Risk:** ${(remainingBlockers * 100).toFixed(0)}%
- **Verification Test Status:** \`${activeState?.verification.testStatus ?? "untested"}\`

#### Guidance:
${recommendations.join("\n")}`;

				return {
					content: [{ type: "text", text: output }],
					details: {
						isReady,
						goalSatisfied,
						verificationSufficient,
						remainingBlockers,
						latencyMs: result.latencyMs,
					},
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Completion verification failed: ${error instanceof Error ? error.message : String(error)}. Proceeding with standard completion.`,
						},
					],
					details: { fallback: true },
				};
			}
		},
	};
}
