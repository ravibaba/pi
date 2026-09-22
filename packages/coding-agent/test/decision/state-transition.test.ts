import { describe, expect, it } from "vitest";
import { createInitialDecisionState, recordToolResultToState } from "../../src/core/decision/decision-state.ts";
import { assessStateTransition } from "../../src/core/decision/state-transition.ts";

describe("state-transition", () => {
	it("should judge initial prompt as meaningful transition", () => {
		const state = createInitialDecisionState({ intent: "Do something" });
		const assessment = assessStateTransition(undefined, state);
		expect(assessment.isMeaningful).toBe(true);
		expect(assessment.reason).toBe("initial_prompt");
	});

	it("should not invoke Jev on routine progress without semantic boundary", () => {
		const state1 = createInitialDecisionState({ intent: "Read some files" });
		const state2 = recordToolResultToState(state1, {
			toolName: "read",
			argsSummary: "file1.txt",
			isError: false,
		});

		const assessment = assessStateTransition(state1, state2);
		expect(assessment.isMeaningful).toBe(false);
	});

	it("should trigger transition when consequential tool is proposed", () => {
		const state1 = createInitialDecisionState({ intent: "Clean workspace" });
		const state2 = structuredClone(state1);
		state2.proposedTool = {
			name: "bash",
			argumentsSummary: "rm -rf build/",
			paths: ["build/"],
			isDestructiveCandidate: true,
		};

		const assessment = assessStateTransition(state1, state2);
		expect(assessment.isMeaningful).toBe(true);
		expect(assessment.reason).toBe("consequential_tool_proposed");
	});

	it("should trigger transition when tool fails", () => {
		const state1 = createInitialDecisionState({ intent: "Run tests" });
		const state2 = recordToolResultToState(state1, {
			toolName: "bash",
			argsSummary: "npm test",
			isError: true,
			errorSnippet: "Test failed: Assertion error",
		});

		const assessment = assessStateTransition(state1, state2);
		expect(assessment.isMeaningful).toBe(true);
		expect(assessment.reason).toBe("tool_failure");
	});

	it("should trigger transition when edit oscillation threshold is exceeded", () => {
		let state = createInitialDecisionState({ intent: "Fix styling" });
		let prevState = state;

		// 3 edits to the same file
		for (let i = 0; i < 3; i++) {
			prevState = state;
			state = recordToolResultToState(state, {
				toolName: "edit",
				argsSummary: "style.css",
				isError: false,
				modifiedFiles: ["style.css"],
			});
		}

		expect(state.execution.oscillationCount).toBe(2);

		// 4th edit brings oscillationCount to 3
		prevState = state;
		state = recordToolResultToState(state, {
			toolName: "edit",
			argsSummary: "style.css",
			isError: false,
			modifiedFiles: ["style.css"],
		});

		expect(state.execution.oscillationCount).toBe(3);
		const assessment = assessStateTransition(prevState, state);
		expect(assessment.isMeaningful).toBe(true);
		expect(assessment.reason).toBe("edit_oscillation");
	});
});
