import { execSync } from "node:child_process";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import { createInitialDecisionState } from "../../decision/decision-state.ts";
import type { DecisionEngine, DecisionState } from "../../decision/decision-types.ts";
import { DIFF_REVIEW_V1 } from "../../decision/question-registry.ts";

const diffReviewSchema = Type.Object({
	stagedOnly: Type.Optional(
		Type.Boolean({ description: "If true, review only staged changes (git diff --cached). Default: false." }),
	),
	path: Type.Optional(
		Type.String({ description: "Optional specific file or directory path to limit diff review to." }),
	),
});

export type DiffReviewToolInput = Static<typeof diffReviewSchema>;

export const jevDiffReviewPromptContribution = {
	snippet: "Run System-1 semantic diff review to detect scope drift, regression risk, and missing tests",
	guidelines: [
		"Use jev_diff_review after implementing significant changes before claiming completion.",
		"Inspect the scope drift and missing test warnings from jev_diff_review to ensure clean, verified PR-ready code.",
	],
} as const;

export function createJevDiffReviewTool(
	cwd: string,
	getState: () => DecisionState | undefined,
	getEngine: () => DecisionEngine,
): AgentTool<typeof diffReviewSchema> {
	return {
		name: "jev_diff_review",
		label: "Jev Semantic Diff Review",
		description:
			"Performs a fast System-1 semantic review of current git changes. Detects scope drift, regression risk, test coverage gaps, and alignment with the task intent.",
		parameters: diffReviewSchema,
		execute: async (_toolCallId, { stagedOnly, path }) => {
			const state = getState();
			const engine = getEngine();

			let diffText = "";
			try {
				const cmd = `git diff ${stagedOnly ? "--cached" : ""} ${path ? `-- "${path}"` : ""}`.trim();
				diffText = execSync(cmd, { cwd, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Failed to retrieve git diff: ${message}` }],
					details: { error: message },
				};
			}

			if (!diffText.trim()) {
				return {
					content: [
						{
							type: "text",
							text: "No git diff found to review. Working directory is clean for the specified target.",
						},
					],
					details: { clean: true },
				};
			}

			const truncatedDiff =
				diffText.length > 8000 ? `${diffText.slice(0, 8000)}\n\n[...diff truncated for review...]` : diffText;

			const reviewState: DecisionState = state
				? {
						...state,
						task: {
							...state.task,
							intent: `${state.task.intent}\n\n[Active Git Diff]:\n${truncatedDiff}`,
						},
					}
				: createInitialDecisionState({
						intent: `Review active changes:\n${truncatedDiff}`,
					});

			try {
				const result = await engine.decide(reviewState, DIFF_REVIEW_V1);
				const answers = result.answers;

				const scopeDrift = Number(answers.scopeDrift?.noul ?? 0);
				const regressionRisk = Number(answers.regressionRisk?.score ?? 1);
				const missingTestRisk = Number(answers.missingTestRisk?.noul ?? 0);
				const taskAlignment = Number(answers.taskAlignment?.noul ?? 1);

				const regressionLabels = ["Negligible", "Low", "Moderate", "High", "Critical"];
				const regressionText = regressionLabels[regressionRisk] ?? "Moderate";

				const recommendations: string[] = [];
				if (scopeDrift > 0.6) {
					recommendations.push(
						"- **Scope Drift Alert**: The diff touches areas unrelated to the user's goal. Revert unrelated files.",
					);
				}
				if (regressionRisk >= 3) {
					recommendations.push(
						`- **Regression Risk (${regressionText})**: Critical paths modified. Run full integration tests.`,
					);
				}
				if (missingTestRisk > 0.7) {
					recommendations.push(
						"- **Test Coverage Warning**: New logic detected without tests. Add automated test coverage before finishing.",
					);
				}
				if (recommendations.length === 0) {
					recommendations.push("- Changes are well-aligned with the task and ready for verification.");
				}

				const report = `### Jev Semantic Diff Review

- **Task Alignment:** ${(taskAlignment * 100).toFixed(0)}%
- **Scope Drift:** ${(scopeDrift * 100).toFixed(0)}% (${scopeDrift > 0.6 ? "HIGH" : "Acceptable"})
- **Regression Risk:** ${regressionText} (score: ${regressionRisk}/4)
- **Missing Test Risk:** ${(missingTestRisk * 100).toFixed(0)}% (${missingTestRisk > 0.7 ? "NEEDS TESTS" : "OK"})

#### Recommendations:
${recommendations.join("\n")}`;

				return {
					content: [{ type: "text", text: report }],
					details: {
						scopeDrift,
						regressionRisk,
						missingTestRisk,
						taskAlignment,
						latencyMs: result.latencyMs,
					},
				};
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{ type: "text", text: `Jev diff review fallback: Diff captured but review failed (${message}).` },
					],
					details: { fallback: true },
				};
			}
		},
	};
}
