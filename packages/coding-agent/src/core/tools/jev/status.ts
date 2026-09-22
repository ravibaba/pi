import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { DecisionEngine, DecisionState } from "../../decision/decision-types.ts";

const statusSchema = Type.Object({});

export type StatusToolInput = Static<typeof statusSchema>;

export const jevStatusPromptContribution = {
	snippet: "Inspect living System-1 decision state, execution phase, churn metrics, and telemetry",
	guidelines: [
		"Use jev_status to check the current execution phase, verified test status, and preserved architectural facts.",
	],
} as const;

export function createJevStatusTool(
	getState: () => DecisionState | undefined,
	getEngine: () => DecisionEngine,
): AgentTool<typeof statusSchema> {
	return {
		name: "jev_status",
		label: "Jev Decision State & Telemetry Status",
		description:
			"Returns an inspectable snapshot of the agent's living DecisionState, execution phase, file churn, verified test status, and telemetry metrics.",
		parameters: statusSchema,
		execute: async () => {
			const state = getState();
			const engine = getEngine();

			if (!state) {
				return {
					content: [{ type: "text", text: "No active DecisionState found for this session." }],
					details: { initialized: false },
				};
			}

			const telemetry = (engine as { telemetry?: { getMetrics: () => any } }).telemetry;
			const metrics = telemetry?.getMetrics();

			const facts = state.context?.criticalFacts ?? [];
			const decisions = state.context?.decisions ?? [];
			const constraints = state.context?.constraints ?? [];

			const factsText = facts.length > 0 ? facts.map((f) => `- ${f}`).join("\n") : "*(none)*";
			const decisionsText = decisions.length > 0 ? decisions.map((d) => `- ${d}`).join("\n") : "*(none)*";
			const constraintsText = constraints.length > 0 ? constraints.map((c) => `- ${c}`).join("\n") : "*(none)*";

			const metricsSection = metrics
				? `
#### System-1 Telemetry:
- **Total Decisions:** ${metrics.totalDecisions}
- **Average Latency:** ${metrics.averageLatencyMs.toFixed(1)}ms
- **Average Confidence:** ${(metrics.averageConfidence * 100).toFixed(0)}%
- **Estimated Tokens Saved:** ~${metrics.estimatedTokensSaved.toLocaleString()} tokens
- **Total Micro-Call Cost:** $${metrics.totalCostUsd.toFixed(5)} USD`
				: "";

			const escalationInfo = state.model.escalatedFrom ? `, escalated from ${state.model.escalatedFrom}` : "";
			const output = `### Living System-1 Decision State

- **Goal / Intent:** ${state.task.intent}
- **Execution Phase:** \`${state.execution.phase}\`
- **Active Model Tier:** \`${state.model.currentTier}\` (confidence: ${(state.model.confidence * 100).toFixed(0)}%${escalationInfo})
- **Files Modified:** ${state.execution.filesChanged.length > 0 ? state.execution.filesChanged.join(", ") : "(none)"}
- **File Oscillation Count:** ${state.execution.oscillationCount}
- **Consecutive Failures:** ${state.execution.consecutiveFailures}
- **Verification Test Status:** \`${state.verification.testStatus}\`

#### Preserved Architectural Facts:
${factsText}

#### Preserved Decisions:
${decisionsText}

#### Preserved Constraints:
${constraintsText}
${metricsSection}`;

			return {
				content: [{ type: "text", text: output }],
				details: {
					phase: state.execution.phase,
					tier: state.model.currentTier,
					testStatus: state.verification.testStatus,
					filesChanged: state.execution.filesChanged,
					metrics,
				},
			};
		},
	};
}
