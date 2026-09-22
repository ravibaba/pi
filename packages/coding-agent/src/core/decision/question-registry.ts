import type { ChoiceQuestionDef, NoulQuestionDef, ScoreQuestionDef } from "./decision-types.ts";

/** Helper constructor functions for question definitions */
export function noul(instructions: string, criteria?: { true?: string; false?: string }): NoulQuestionDef {
	return {
		type: "noul",
		instructions,
		criteria,
	};
}

export function choice<T extends Record<string, string>>(instructions: string, criteria: T): ChoiceQuestionDef<T> {
	return {
		type: "choice",
		instructions,
		criteria,
	};
}

export function score(instructions: string, criteria: readonly [string, string, ...string[]]): ScoreQuestionDef {
	return {
		type: "score",
		instructions,
		criteria,
	};
}

/**
 * Task Routing Bundle (v1):
 * Evaluates task difficulty, capability requirements, security sensitivity, and recommended model tier
 * in a SINGLE parallel Jev call.
 */
export const TASK_ROUTING_V1 = {
	modelTier: choice("What compute/reasoning tier is most appropriate for this coding task?", {
		fast: "Trivial edits, single-file typo fixes, documentation updates, mechanical changes",
		standard: "Standard feature implementation, straightforward bug fixes, unit test writing",
		reasoning: "Complex debugging, distributed concurrency, deep multi-file architectural refactors",
		deep: "Extreme complexity, formal verification, full subsystem migration or security auditing",
	}),
	complexity: score("Rate the technical difficulty and scope of the requested coding task:", [
		"Trivial (single-line or syntax fix)",
		"Simple (single function or file update)",
		"Moderate (multi-file feature or clear bug fix)",
		"Complex (subsystem refactor or subtle bug)",
		"Architectural (cross-repo architectural overhaul)",
	]),
	securitySensitive: noul(
		"Does this task involve credentials, secrets, auth tokens, permission changes, or sensitive network security?",
	),
	needsRepoSearch: noul(
		"Does completing this task require exploring unknown codebase architecture or broad symbol searches?",
	),
	likelyLongHorizon: noul("Is this task likely to require more than 5 tool turns or extensive iterative debugging?"),
} as const;

/**
 * Tool Risk Bundle (v1):
 * Evaluates semantic danger of proposed command or file mutation in a SINGLE Jev call.
 */
export const TOOL_RISK_V1 = {
	destructive: noul(
		"Would executing this tool action delete, overwrite, or destroy code, git history, or workspace state irreversibly?",
	),
	credentialAccess: noul(
		"Does this tool action attempt to read, display, export, or transmit credentials, private keys, or API tokens?",
	),
	networkExfiltration: noul(
		"Does this command attempt to send local files, environmental secrets, or repository data to an external network host?",
	),
	productionImpact: noul(
		"Does this command appear targeted at a live production server, database, or deployed cloud infrastructure?",
	),
	scopeViolation: score("Rate whether this tool action operates outside the expected scope of the user's task:", [
		"None (strictly within target task scope)",
		"Minor (touches closely related workspace utilities)",
		"Moderate (modifies files unrelated to the user's request)",
		"Severe (operates globally on system directories or root paths)",
	]),
} as const;

/**
 * Strategy & Stall Supervisor Bundle (v1):
 * Detects whether the agent is progressing or trapped in an unproductive loop,
 * and recommends the next strategic action.
 */
export const STRATEGY_SUPERVISOR_V1 = {
	strategyAction: choice("What strategic action should the agent runtime take next?", {
		continue: "The agent is making steady, meaningful progress toward the objective",
		retry: "The previous failure was actionable and a surgical retry is justified",
		change_strategy: "The current approach has stalled or failed repeatedly; step back and rethink approach",
		escalate_model: "The task is significantly harder than anticipated; escalate to a deeper reasoning model",
		stop_and_verify: "Implementation appears complete; proceed to test verification or prompt the user",
	}),
	isProgressing: noul("Is the agent making measurable forward progress toward satisfying the user's objective?"),
	isStalled: noul(
		"Is the agent stalled, looping on identical errors, or repeatedly modifying the same files without success?",
	),
} as const;

/**
 * Completion Verification Bundle (v1):
 * Independent judge assessing whether acceptance criteria are satisfied.
 */
export const COMPLETION_VERIFICATION_V1 = {
	goalSatisfied: noul("Has the primary objective requested by the user been fully and correctly implemented?"),
	verificationSufficient: noul(
		"Have the changes been adequately tested or verified with passing test results or clean diagnostics?",
	),
	remainingBlockers: noul("Are there unresolved compiler errors, failing tests, or unhandled edge cases remaining?"),
} as const;

/**
 * Semantic Compaction Advisor (v1):
 * Assesses whether context compaction is safe and beneficial given the current state.
 */
export const COMPACTION_ADVISOR_V1 = {
	shouldCompact: noul(
		"Is the current context cluttered with obsolete tool outputs such that semantic compaction is beneficial?",
	),
	riskOfContextLoss: noul(
		"Is the agent in the middle of a delicate active debugging sequence where compaction risks losing critical trace evidence?",
	),
} as const;

/**
 * Semantic Diff Review Bundle (v1):
 * Assesses git diff quality, task alignment, scope drift, and test coverage risk.
 */
export const DIFF_REVIEW_V1 = {
	scopeDrift: noul(
		"Does this git diff modify files, functions, or configurations that are unrelated to the stated task objective?",
	),
	regressionRisk: score(
		"Rate the risk that this diff unintentionally breaks existing contracts or introduces regressions:",
		[
			"Negligible (pure documentation or trivial comment)",
			"Low (isolated bug fix with clean contracts)",
			"Moderate (shared logic or modified interfaces)",
			"High (wide architectural impact or critical path)",
			"Critical (breaking protocol, auth, or schema change)",
		],
	),
	missingTestRisk: noul(
		"Does this diff introduce new logic, branches, or API behavior without corresponding test coverage?",
	),
	taskAlignment: noul("Does this diff faithfully and cleanly fulfill the user's intended goal?"),
} as const;

/**
 * Intelligent Test Selection Bundle (v1):
 * Evaluates changed files against test candidates to prioritize the minimal sufficient verification set.
 */
export const TEST_SELECTION_V1 = {
	selectionPriority: choice("Which test category is most urgently impacted by this change?", {
		unit: "Unit tests directly covering the modified files or functions",
		integration: "Integration tests exercising interactions between modified modules",
		full_suite: "Broad test suite required due to core API or shared dependency changes",
		none: "No tests needed (documentation, comments, or mechanical formatting only)",
	}),
	riskOfUnrunFailures: noul(
		"Is it likely that tests outside the immediate unit scope could fail due to these changes?",
	),
} as const;
