import type { DecisionState } from "./decision-types.ts";

export type TransitionReason =
	| "initial_prompt"
	| "phase_change"
	| "consequential_tool_proposed"
	| "tool_failure"
	| "edit_oscillation"
	| "potential_completion"
	| "repeated_actions"
	| "stalled_strategy";

export interface StateTransitionAssessment {
	readonly isMeaningful: boolean;
	readonly reason?: TransitionReason;
	readonly description: string;
}

/**
 * Enforces the Intelligence Budget:
 * "One Jev invocation per meaningful state transition, NOT one Jev invocation per event."
 *
 * Deterministic code handles bounds, arithmetic, missing files, and obvious safety.
 * Jev is invoked only when state semantics cross an actionable decision boundary.
 */
export function assessStateTransition(
	previous: DecisionState | undefined,
	current: DecisionState,
): StateTransitionAssessment {
	// 1. Initial task kickoff: always meaningful for initial task fingerprint and capability routing
	if (!previous) {
		return {
			isMeaningful: true,
			reason: "initial_prompt",
			description: "Initial task state requires capability and model tier classification",
		};
	}

	// 2. Consequential tool proposed: requires semantic risk evaluation
	if (current.proposedTool?.isDestructiveCandidate) {
		return {
			isMeaningful: true,
			reason: "consequential_tool_proposed",
			description: `Proposed tool '${current.proposedTool.name}' touches sensitive paths or commands`,
		};
	}

	// 3. Consecutive failures incremented: failure classification and retry guidance needed
	if (
		current.execution.consecutiveFailures > previous.execution.consecutiveFailures &&
		current.execution.consecutiveFailures >= 1
	) {
		return {
			isMeaningful: true,
			reason: "tool_failure",
			description: `Failure detected (consecutive: ${current.execution.consecutiveFailures}) with error signature`,
		};
	}

	// 4. Execution phase change (e.g., understand -> implement or test -> debug)
	if (current.execution.phase !== previous.execution.phase) {
		return {
			isMeaningful: true,
			reason: "phase_change",
			description: `Execution phase transitioned from ${previous.execution.phase} to ${current.execution.phase}`,
		};
	}

	// 5. High oscillation detected (editing the same file repeatedly)
	if (
		current.execution.oscillationCount >= 3 &&
		current.execution.oscillationCount > previous.execution.oscillationCount
	) {
		return {
			isMeaningful: true,
			reason: "edit_oscillation",
			description: `Oscillatory edits detected on active files (${current.execution.oscillationCount} repeated edits)`,
		};
	}

	// 6. Repeated identical actions counter incremented
	if (
		current.execution.repeatedActions >= 2 &&
		current.execution.repeatedActions > previous.execution.repeatedActions
	) {
		return {
			isMeaningful: true,
			reason: "repeated_actions",
			description: `Repeated tool execution without state progress (${current.execution.repeatedActions} repeats)`,
		};
	}

	// 7. Potential completion (assistant emitted text without tool calls during implementation/verification)
	if (
		(current.execution.phase === "implement" ||
			current.execution.phase === "debug" ||
			current.execution.phase === "verify") &&
		current.verification.testStatus === "passing" &&
		current.execution.turn > 1 &&
		current.verification.acceptanceStatus === "pending"
	) {
		return {
			isMeaningful: true,
			reason: "potential_completion",
			description: "Candidate completion state reached with passing tests",
		};
	}

	return {
		isMeaningful: false,
		description: "Minor progression or routine read; deterministic path handles execution without Jev",
	};
}
