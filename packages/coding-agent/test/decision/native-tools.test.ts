import { describe, expect, it } from "vitest";
import { createInitialDecisionState, recordContextFact } from "../../src/core/decision/decision-state.ts";
import type {
	DecisionEngine,
	DecisionQuestionsMap,
	DecisionResult,
	DecisionState,
} from "../../src/core/decision/decision-types.ts";
import {
	createJevDiffReviewTool,
	createJevStatusTool,
	createJevStrategyTool,
	createJevTestSelectTool,
	createJevTools,
} from "../../src/core/tools/jev/index.ts";

class MockEngine implements DecisionEngine {
	public nextAnswers: Record<string, any> = {};

	async decide<Q extends DecisionQuestionsMap>(_state: DecisionState, _questions: Q): Promise<DecisionResult<Q>> {
		return {
			answers: this.nextAnswers as any,
			confidence: 0.95,
			latencyMs: 42,
			inputTokens: 100,
			costUsd: 0.00005,
			model: "jev-latest",
			fallback: false,
			stateHash: "mock-hash",
		};
	}
}

describe("native-jev-tools", () => {
	it("createJevTools factory returns 4 native tools", () => {
		const state = createInitialDecisionState({ intent: "Test task" });
		const engine = new MockEngine();
		const tools = createJevTools(
			process.cwd(),
			() => state,
			() => engine,
		);

		expect(tools).toHaveLength(4);
		const names = tools.map((t) => t.name);
		expect(names).toContain("jev_diff_review");
		expect(names).toContain("jev_strategy");
		expect(names).toContain("jev_test_select");
		expect(names).toContain("jev_status");
	});

	it("jev_diff_review evaluates git diff quality and returns actionable advice", async () => {
		const state = createInitialDecisionState({ intent: "Fix authentication bug" });
		const engine = new MockEngine();
		engine.nextAnswers = {
			scopeDrift: { type: "noul", noul: 0.8 },
			regressionRisk: { type: "score", score: 3 },
			missingTestRisk: { type: "noul", noul: 0.85 },
			taskAlignment: { type: "noul", noul: 0.6 },
		};

		const diffTool = createJevDiffReviewTool(
			process.cwd(),
			() => state,
			() => engine,
		);
		const result = await diffTool.execute("call-1", { stagedOnly: false });

		expect(result.content[0].type).toBe("text");
		const text = (result.content[0] as { text: string }).text;
		// If git diff is empty or returns report, handle both gracefully
		if (text.includes("Jev Semantic Diff Review")) {
			expect(text).toContain("Scope Drift Alert");
			expect(text).toContain("Regression Risk");
			expect(text).toContain("Test Coverage Warning");
		} else {
			expect(text).toContain("No git diff found to review");
		}
	});

	it("jev_strategy provides targeted strategic guidance and detects stalls", async () => {
		const state = createInitialDecisionState({ intent: "Implement caching" });
		state.execution.consecutiveFailures = 3;
		state.execution.oscillationCount = 2;

		const engine = new MockEngine();
		engine.nextAnswers = {
			strategyAction: { type: "choice", choice: "change_strategy" },
			isProgressing: { type: "noul", noul: 0.1 },
			isStalled: { type: "noul", noul: 0.9 },
		};

		const strategyTool = createJevStrategyTool(
			() => state,
			() => engine,
		);
		const result = await strategyTool.execute("call-2", {
			currentHypothesis: "Trying to wrap connection in Mutex",
		});

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain("**Recommended Action:** `change_strategy`");
		expect(text).toContain("**Stagnation Detected:** YES (Loop Alert)");
		expect(text).toContain("Rethink Approach");
	});

	it("jev_test_select discovers candidate tests and prioritizes execution", async () => {
		const state = createInitialDecisionState({ intent: "Update model router" });
		state.execution.filesChanged = ["src/core/decision/model-router.ts"];

		const engine = new MockEngine();
		engine.nextAnswers = {
			selectionPriority: { type: "choice", choice: "unit" },
			riskOfUnrunFailures: { type: "noul", noul: 0.15 },
		};

		const testSelectTool = createJevTestSelectTool(
			process.cwd(),
			() => state,
			() => engine,
		);
		const result = await testSelectTool.execute("call-3", { filterPattern: "model-router" });

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain("**Selection Category:** `unit`");
		expect(text).toContain("model-router.test.ts");
	});

	it("jev_status outputs snapshot of living state and preserved facts", async () => {
		let state = createInitialDecisionState({ intent: "Refactor storage" });
		state = recordContextFact(state, "PostgreSQL schema v2 is applied");
		state.execution.phase = "implement";

		const engine = new MockEngine();
		const statusTool = createJevStatusTool(
			() => state,
			() => engine,
		);
		const result = await statusTool.execute("call-4", {});

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain("**Goal / Intent:** Refactor storage");
		expect(text).toContain("**Execution Phase:** `implement`");
		expect(text).toContain("PostgreSQL schema v2 is applied");
	});
});
