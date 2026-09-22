import { createHash } from "node:crypto";
import type { DecisionState, ModelTier } from "./decision-types.ts";

export interface StateInitOptions {
	intent: string;
	workingDirectory?: string;
	branch?: string;
	dirty?: boolean;
	initialModel?: string;
	initialTier?: ModelTier;
}

/**
 * Creates a clean, structured initial DecisionState for a new user task.
 */
export function createInitialDecisionState(options: StateInitOptions): DecisionState {
	return {
		task: {
			intent: options.intent.trim(),
			complexity: 1,
			risk: 1,
			scope: "local",
			domain: [],
			requiredCapabilities: [],
		},
		repository: {
			activeFiles: [],
			relevantAreas: [],
			architecture: [],
			tests: [],
			branch: options.branch,
			dirty: options.dirty,
		},
		execution: {
			phase: "understand",
			turn: 0,
			progress: 0,
			failedAttempts: 0,
			consecutiveFailures: 0,
			retries: 0,
			strategyChanges: 0,
			filesChanged: [],
			oscillationCount: 0,
			repeatedActions: 0,
		},
		context: {
			criticalFacts: [],
			decisions: [],
			constraints: [],
			unresolvedQuestions: [],
		},
		model: {
			current: options.initialModel || "default",
			currentTier: options.initialTier || "standard",
			confidence: 1.0,
		},
		verification: {
			testStatus: "untested",
			lintsStatus: "untested",
			diffMatch: 1.0,
			acceptanceStatus: "pending",
		},
	};
}

/**
 * Deterministically records a tool execution result into DecisionState.
 * Updates consecutiveFailures, error fingerprints, active files, and file oscillation.
 */
export function recordToolResultToState(
	state: DecisionState,
	params: {
		toolName: string;
		argsSummary: string;
		isError: boolean;
		errorSnippet?: string;
		modifiedFiles?: string[];
	},
): DecisionState {
	const next = structuredClone(state);
	next.execution.turn += 1;
	next.execution.lastTool = params.toolName;
	next.execution.lastToolSuccess = !params.isError;

	if (params.isError) {
		next.execution.consecutiveFailures += 1;
		next.execution.failedAttempts += 1;
		const fingerprint = params.errorSnippet ? params.errorSnippet.slice(0, 100).trim() : "unknown_error";
		if (next.execution.lastErrorFingerprint === fingerprint) {
			next.execution.repeatedActions += 1;
		}
		next.execution.lastErrorFingerprint = fingerprint;
	} else {
		next.execution.consecutiveFailures = 0;
		next.execution.repeatedActions = 0;
	}

	if (params.modifiedFiles && params.modifiedFiles.length > 0) {
		for (const file of params.modifiedFiles) {
			if (!next.execution.filesChanged.includes(file)) {
				next.execution.filesChanged.push(file);
			}
			if (next.repository.activeFiles.includes(file)) {
				next.execution.oscillationCount += 1;
			} else {
				next.repository.activeFiles.push(file);
			}
		}
	}

	// Update phase if still in initial understand phase and files are being edited
	if (next.execution.phase === "understand" && next.execution.filesChanged.length > 0) {
		next.execution.phase = "implement";
	}

	return next;
}

/**
 * Updates verification status (e.g. after running tests or linter).
 */
export function recordVerificationToState(
	state: DecisionState,
	params: {
		testStatus?: "untested" | "passing" | "failing" | "flaky";
		lintsStatus?: "clean" | "errors" | "untested";
		acceptanceStatus?: "pending" | "satisfied" | "violated";
	},
): DecisionState {
	const next = structuredClone(state);
	if (params.testStatus) next.verification.testStatus = params.testStatus;
	if (params.lintsStatus) next.verification.lintsStatus = params.lintsStatus;
	if (params.acceptanceStatus) next.verification.acceptanceStatus = params.acceptanceStatus;

	if (next.verification.testStatus === "failing") {
		next.execution.phase = "debug";
	} else if (next.verification.testStatus === "passing" && next.execution.filesChanged.length > 0) {
		next.execution.phase = "verify";
	}

	return next;
}

/**
 * Computes a stable deterministic SHA-256 hash of core state features.
 * Used for cache keys and telemetry correlation.
 */
export function hashDecisionState(state: DecisionState): string {
	const payload = {
		intent: state.task.intent,
		phase: state.execution.phase,
		turn: state.execution.turn,
		consecutiveFailures: state.execution.consecutiveFailures,
		lastTool: state.execution.lastTool,
		lastToolSuccess: state.execution.lastToolSuccess,
		lastErrorFingerprint: state.execution.lastErrorFingerprint,
		filesChanged: [...state.execution.filesChanged].sort(),
		testStatus: state.verification.testStatus,
		proposedTool: state.proposedTool
			? {
					name: state.proposedTool.name,
					summary: state.proposedTool.argumentsSummary,
				}
			: null,
	};
	return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

/**
 * Serializes DecisionState into a compact, human-readable text payload for Jev System-1 evaluations.
 * Avoids raw transcript bloat while retaining high-fidelity semantic facts.
 */
export function serializeDecisionStateForJev(state: DecisionState): string {
	const parts: string[] = [
		`GOAL: ${state.task.intent}`,
		`PHASE: ${state.execution.phase} (Turn: ${state.execution.turn}, Progress: ${Math.round(state.execution.progress * 100)}%)`,
	];

	if (state.execution.consecutiveFailures > 0) {
		parts.push(
			`FAILURES: ${state.execution.consecutiveFailures} consecutive (Last Error: ${state.execution.lastErrorFingerprint || "unknown"})`,
		);
	}

	if (state.execution.oscillationCount > 0) {
		parts.push(`OSCILLATION: ${state.execution.oscillationCount} repeated edits on active files`);
	}

	if (state.execution.filesChanged.length > 0) {
		parts.push(`CHANGED_FILES: ${state.execution.filesChanged.join(", ")}`);
	}

	if (state.verification.testStatus !== "untested") {
		parts.push(`TEST_STATUS: ${state.verification.testStatus}`);
	}

	if (state.context.criticalFacts.length > 0) {
		parts.push(`CRITICAL_FACTS: ${state.context.criticalFacts.join("; ")}`);
	}

	if (state.proposedTool) {
		parts.push(
			`PROPOSED_TOOL: ${state.proposedTool.name} args=${state.proposedTool.argumentsSummary} (paths: ${state.proposedTool.paths.join(", ") || "none"})`,
		);
	}

	return parts.join("\n");
}
