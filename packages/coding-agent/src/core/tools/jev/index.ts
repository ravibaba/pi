import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { DecisionEngine, DecisionState } from "../../decision/decision-types.ts";
import { createJevDiffReviewTool, jevDiffReviewPromptContribution } from "./diff-review.ts";
import { createJevStatusTool, jevStatusPromptContribution } from "./status.ts";
import { createJevStrategyTool, jevStrategyPromptContribution } from "./strategy-adviser.ts";
import { createJevTestSelectTool, jevTestSelectPromptContribution } from "./test-selector.ts";

export { createJevDiffReviewTool, jevDiffReviewPromptContribution } from "./diff-review.ts";
export { createJevStatusTool, jevStatusPromptContribution } from "./status.ts";
export { createJevStrategyTool, jevStrategyPromptContribution } from "./strategy-adviser.ts";
export { createJevTestSelectTool, jevTestSelectPromptContribution } from "./test-selector.ts";

export const JEV_TOOL_NAMES = ["jev_diff_review", "jev_strategy", "jev_test_select", "jev_status"] as const;

export type JevToolName = (typeof JEV_TOOL_NAMES)[number];

export const JEV_TOOL_PROMPT_CONTRIBUTIONS: Record<string, { snippet: string; guidelines: readonly string[] }> = {
	jev_diff_review: jevDiffReviewPromptContribution,
	jev_strategy: jevStrategyPromptContribution,
	jev_test_select: jevTestSelectPromptContribution,
	jev_status: jevStatusPromptContribution,
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
	];
}
