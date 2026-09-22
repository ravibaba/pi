import { describe, expect, it } from "vitest";
import {
	createInitialDecisionState,
	hashDecisionState,
	recordToolResultToState,
	recordVerificationToState,
	serializeDecisionStateForJev,
} from "../../src/core/decision/decision-state.ts";

describe("decision-state", () => {
	it("should create initial structured state", () => {
		const state = createInitialDecisionState({
			intent: "Fix bug in authentication middleware",
			initialModel: "gpt-4o",
			initialTier: "standard",
			branch: "main",
			dirty: false,
		});

		expect(state.task.intent).toBe("Fix bug in authentication middleware");
		expect(state.execution.phase).toBe("understand");
		expect(state.execution.turn).toBe(0);
		expect(state.execution.consecutiveFailures).toBe(0);
		expect(state.execution.oscillationCount).toBe(0);
		expect(state.model.currentTier).toBe("standard");
		expect(state.verification.testStatus).toBe("untested");
	});

	it("should record tool execution and track error fingerprints and oscillation", () => {
		let state = createInitialDecisionState({
			intent: "Implement feature X",
		});

		// 1. Successful file edit
		state = recordToolResultToState(state, {
			toolName: "edit",
			argsSummary: "src/auth.ts",
			isError: false,
			modifiedFiles: ["src/auth.ts"],
		});

		expect(state.execution.turn).toBe(1);
		expect(state.execution.lastToolSuccess).toBe(true);
		expect(state.execution.filesChanged).toContain("src/auth.ts");
		expect(state.execution.phase).toBe("implement");
		expect(state.execution.oscillationCount).toBe(0);

		// 2. Edit same file again (oscillation)
		state = recordToolResultToState(state, {
			toolName: "edit",
			argsSummary: "src/auth.ts",
			isError: false,
			modifiedFiles: ["src/auth.ts"],
		});
		expect(state.execution.oscillationCount).toBe(1);

		// 3. Command fails
		state = recordToolResultToState(state, {
			toolName: "bash",
			argsSummary: "npm test",
			isError: true,
			errorSnippet: "TypeError: auth is undefined",
		});

		expect(state.execution.consecutiveFailures).toBe(1);
		expect(state.execution.failedAttempts).toBe(1);
		expect(state.execution.lastErrorFingerprint).toBe("TypeError: auth is undefined");
		expect(state.execution.repeatedActions).toBe(0);

		// 4. Same command fails with identical fingerprint
		state = recordToolResultToState(state, {
			toolName: "bash",
			argsSummary: "npm test",
			isError: true,
			errorSnippet: "TypeError: auth is undefined",
		});

		expect(state.execution.consecutiveFailures).toBe(2);
		expect(state.execution.repeatedActions).toBe(1);

		// 5. Subsequent success resets consecutive failures
		state = recordToolResultToState(state, {
			toolName: "edit",
			argsSummary: "src/auth.ts",
			isError: false,
		});
		expect(state.execution.consecutiveFailures).toBe(0);
		expect(state.execution.repeatedActions).toBe(0);
	});

	it("should update verification status and adjust execution phase", () => {
		let state = createInitialDecisionState({ intent: "Add unit tests" });
		state = recordToolResultToState(state, {
			toolName: "write",
			argsSummary: "test.ts",
			isError: false,
			modifiedFiles: ["test.ts"],
		});

		// Failing test -> debug phase
		state = recordVerificationToState(state, { testStatus: "failing" });
		expect(state.verification.testStatus).toBe("failing");
		expect(state.execution.phase).toBe("debug");

		// Passing test -> verify phase
		state = recordVerificationToState(state, { testStatus: "passing" });
		expect(state.verification.testStatus).toBe("passing");
		expect(state.execution.phase).toBe("verify");
	});

	it("should produce deterministic state hash and compact serialized representation", () => {
		const state = createInitialDecisionState({ intent: "Test hashing" });
		const hash1 = hashDecisionState(state);
		const hash2 = hashDecisionState(state);
		expect(hash1).toBe(hash2);
		expect(hash1.length).toBe(16);

		const serialized = serializeDecisionStateForJev(state);
		expect(serialized).toContain("GOAL: Test hashing");
		expect(serialized).toContain("PHASE: understand");
	});
});
