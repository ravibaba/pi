import { describe, expect, it } from "vitest";
import { createInitialDecisionState, recordToolResultToState } from "../../src/core/decision/decision-state.ts";
import { StrategyController } from "../../src/core/decision/strategy-controller.ts";

describe("strategy-controller", () => {
	const controller = new StrategyController();

	it("should create continue directive without steering", () => {
		const state = createInitialDecisionState({ intent: "Task" });
		const directive = controller.createDirective("continue", state);

		expect(directive.action).toBe("continue");
		expect(directive.shouldInjectSteering).toBe(false);
	});

	it("should create change_strategy directive with context-aware steering message", () => {
		let state = createInitialDecisionState({ intent: "Fix race condition" });
		state = recordToolResultToState(state, {
			toolName: "bash",
			argsSummary: "npm test",
			isError: true,
			errorSnippet: "Deadlock detected",
		});
		state = recordToolResultToState(state, {
			toolName: "bash",
			argsSummary: "npm test",
			isError: true,
			errorSnippet: "Deadlock detected",
		});

		const directive = controller.createDirective("change_strategy", state);

		expect(directive.action).toBe("change_strategy");
		expect(directive.shouldInjectSteering).toBe(true);
		expect(directive.steeringMessage).toContain("execution strategy appears stalled");
		expect(directive.steeringMessage).toContain("2 consecutive failures");
	});

	it("should create escalate_model directive when task is harder than anticipated", () => {
		const state = createInitialDecisionState({ intent: "Complex refactor" });
		const directive = controller.createDirective("escalate_model", state);

		expect(directive.action).toBe("escalate_model");
		expect(directive.shouldEscalateModel).toBe(true);
		expect(directive.steeringMessage).toContain("Escalating reasoning capacity");
	});
});
