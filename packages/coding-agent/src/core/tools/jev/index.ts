import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { DecisionEngine, DecisionState } from "../../decision/decision-types.ts";
import { createJevCompletionTool, jevCompletionPromptContribution } from "./completion.ts";
import { createJevDiffReviewTool, jevDiffReviewPromptContribution } from "./diff-review.ts";
import { createJevRiskEvalTool, jevRiskEvalPromptContribution } from "./risk-eval.ts";
import { createJevRouteTool, jevRoutePromptContribution } from "./route.ts";
import { createJevStatusTool, jevStatusPromptContribution } from "./status.ts";
import { createJevStrategyTool, jevStrategyPromptContribution } from "./strategy-adviser.ts";
import { createJevTestSelectTool, jevTestSelectPromptContribution } from "./test-selector.ts";

export { createJevCompletionTool, jevCompletionPromptContribution } from "./completion.ts";
export { createJevDiffReviewTool, jevDiffReviewPromptContribution } from "./diff-review.ts";
export { createJevRiskEvalTool, jevRiskEvalPromptContribution } from "./risk-eval.ts";
export { createJevRouteTool, jevRoutePromptContribution } from "./route.ts";
export { createJevStatusTool, jevStatusPromptContribution } from "./status.ts";
export { createJevStrategyTool, jevStrategyPromptContribution } from "./strategy-adviser.ts";
export { createJevTestSelectTool, jevTestSelectPromptContribution } from "./test-selector.ts";

export const JEV_TOOL_NAMES = [
	"jev_diff_review",
	"jev_strategy",
	"jev_test_select",
	"jev_status",
	"jev_route",
	"jev_risk_eval",
	"jev_completion",
] as const;

export type JevToolName = (typeof JEV_TOOL_NAMES)[number];

export const JEV_TOOL_PROMPT_CONTRIBUTIONS: Record<string, { snippet: string; guidelines: readonly string[] }> = {
	jev_diff_review: jevDiffReviewPromptContribution,
	jev_strategy: jevStrategyPromptContribution,
	jev_test_select: jevTestSelectPromptContribution,
	jev_status: jevStatusPromptContribution,
	jev_route: jevRoutePromptContribution,
	jev_risk_eval: jevRiskEvalPromptContribution,
	jev_completion: jevCompletionPromptContribution,
};

export function createJevTools(
	cwd: string,
	getState: () => DecisionState | undefined,
	getEngine: () => DecisionEngine,
): AgentTool[] {
	return [
		createJevDiffReviewTool(cwd, getState, getEngine),
		createJevStrategyTool(getState, getEngine),
		createJevTestSelectTool(cwd, getState, getEngine),
		createJevStatusTool(getState, getEngine),
		createJevRouteTool(getState, getEngine),
		createJevRiskEvalTool(getState, getEngine),
		createJevCompletionTool(getState, getEngine),
	];
}
