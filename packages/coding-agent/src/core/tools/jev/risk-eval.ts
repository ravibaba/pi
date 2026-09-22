import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import { createInitialDecisionState } from "../../decision/decision-state.ts";
import type { DecisionEngine, DecisionState } from "../../decision/decision-types.ts";
import { TOOL_RISK_V1 } from "../../decision/question-registry.ts";

const riskEvalSchema = Type.Object({
	toolName: Type.String({
		description: "Name of the tool to preflight (e.g., bash, write, edit).",
	}),
	commandOrArgs: Type.String({
		description: "The command string, file path, or argument payload to evaluate for safety.",
	}),
});

export type RiskEvalToolInput = Static<typeof riskEvalSchema>;

export const jevRiskEvalPromptContribution = {
	snippet: "Preflight high-impact commands or file modifications via Jev System-1 risk assessment",
	guidelines: ["Use jev_risk_eval before running potentially destructive commands or wide file mutations."],
} as const;

export function createJevRiskEvalTool(
	getState: () => DecisionState | undefined,
	getEngine: () => DecisionEngine,
): AgentTool<typeof riskEvalSchema> {
	return {
		name: "jev_risk_eval",
		label: "Jev Risk Preflight",
		description:
			"Preflight tool risk evaluation for blast radius, destructive actions, credential exposure, and production impact via Jev System-1.",
		parameters: riskEvalSchema,
		execute: async (_callId, input) => {
			const engine = getEngine();
			const activeState = getState();

			const evalState: DecisionState = activeState
				? {
						...activeState,
						proposedTool: {
							name: input.toolName,
							argumentsSummary: input.commandOrArgs,
							paths: [],
							isDestructiveCandidate: false,
						},
					}
				: {
						...createInitialDecisionState({ intent: "Tool Risk Preflight" }),
						proposedTool: {
							name: input.toolName,
							argumentsSummary: input.commandOrArgs,
							paths: [],
							isDestructiveCandidate: false,
						},
					};

			try {
				const result = await engine.decide(evalState, TOOL_RISK_V1);
				const answers = result.answers;

				const destructive = Number(answers.destructive?.noul ?? 0);
				const credentialAccess = Number(answers.credentialAccess?.noul ?? 0);
				const networkExfiltration = Number(answers.networkExfiltration?.noul ?? 0);
				const productionImpact = Number(answers.productionImpact?.noul ?? 0);
				const scopeViolationScore = Number(answers.scopeViolation?.score ?? 0);

				// Deterministic composite risk formula
				const compositeScore =
					destructive * 0.35 +
					credentialAccess * 0.25 +
					networkExfiltration * 0.2 +
					productionImpact * 0.15 +
					(scopeViolationScore / 3) * 0.05;

				let verdict = "ALLOW";
				if (compositeScore >= 0.7 || destructive > 0.85 || credentialAccess > 0.85) {
					verdict = "BLOCK";
				} else if (compositeScore >= 0.4 || productionImpact > 0.5) {
					verdict = "CONFIRM";
				}

				const output = `### Jev Tool Risk Preflight Assessment

- **Policy Verdict:** \`${verdict}\`
- **Composite Risk Score:** ${(compositeScore * 100).toFixed(0)}%
- **Destructive Action Risk:** ${(destructive * 100).toFixed(0)}% (${destructive > 0.5 ? "HIGH" : "Low"})
- **Credential Access Risk:** ${(credentialAccess * 100).toFixed(0)}%
- **Network Exfiltration Risk:** ${(networkExfiltration * 100).toFixed(0)}%
- **Production Impact Risk:** ${(productionImpact * 100).toFixed(0)}%
- **Scope Violation Level:** ${scopeViolationScore}/3

#### Guidance:
${
	verdict === "BLOCK"
		? `**BLOCKED**: This action presents an unacceptable safety risk (blast radius or irreversible mutation). Do not proceed.`
		: verdict === "CONFIRM"
			? `**CONFIRMATION ADVISED**: Exercise caution. Inspect target paths and command flags before executing.`
			: `**SAFE**: Proposed tool action is within acceptable parameters.`
}`;

				return {
					content: [{ type: "text", text: output }],
					details: {
						verdict,
						compositeScore,
						destructive,
						credentialAccess,
						networkExfiltration,
						productionImpact,
						scopeViolationScore,
						latencyMs: result.latencyMs,
					},
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Risk preflight failed: ${error instanceof Error ? error.message : String(error)}. Proceed with caution.`,
						},
					],
					details: { fallback: true },
				};
			}
		},
	};
}
