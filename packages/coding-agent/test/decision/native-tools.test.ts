import { describe, expect, it } from "vitest";
import { createInitialDecisionState, recordContextFact } from "../../src/core/decision/decision-state.ts";
import type {
	DecisionEngine,
	DecisionQuestionsMap,
	DecisionResult,
	DecisionState,
} from "../../src/core/decision/decision-types.ts";
import {
	createJevCompletionTool,
	createJevDiffReviewTool,
	createJevRiskEvalTool,
	createJevRouteTool,
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
	it("createJevTools factory returns 7 native tools", () => {
		const state = createInitialDecisionState({ intent: "Test task" });
		const engine = new MockEngine();
		const tools = createJevTools(
			process.cwd(),
			() => state,
			() => engine,
		);

		expect(tools).toHaveLength(7);
		const names = tools.map((t) => t.name);
		expect(names).toContain("jev_diff_review");
		expect(names).toContain("jev_strategy");
		expect(names).toContain("jev_test_select");
		expect(names).toContain("jev_status");
		expect(names).toContain("jev_route");
		expect(names).toContain("jev_risk_eval");
		expect(names).toContain("jev_completion");
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

	it("jev_route evaluates task complexity and recommends tier", async () => {
		const state = createInitialDecisionState({ intent: "Refactor database pool" });
		const engine = new MockEngine();
		engine.nextAnswers = {
			modelTier: { type: "choice", choice: "reasoning" },
			complexity: { type: "score", score: 3 },
			securitySensitive: { type: "noul", noul: 0.1 },
			needsRepoSearch: { type: "noul", noul: 0.8 },
			likelyLongHorizon: { type: "noul", noul: 0.7 },
		};

		const routeTool = createJevRouteTool(
			() => state,
			() => engine,
		);
		const result = await routeTool.execute("call-5", { task: "Refactor database pool" });
		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain("**Recommended Model Tier:** `reasoning`");
		expect(text).toContain("**Exploration Needed:** Yes");
	});

	it("jev_risk_eval evaluates destructive commands and outputs safety verdict", async () => {
		const state = createInitialDecisionState({ intent: "Clean directory" });
		const engine = new MockEngine();
		engine.nextAnswers = {
			destructive: { type: "noul", noul: 0.95 },
			credentialAccess: { type: "noul", noul: 0.1 },
			networkExfiltration: { type: "noul", noul: 0.05 },
			productionImpact: { type: "noul", noul: 0.1 },
			scopeViolation: { type: "score", score: 2 },
		};

		const riskTool = createJevRiskEvalTool(
			() => state,
			() => engine,
		);
		const result = await riskTool.execute("call-6", {
			toolName: "bash",
			commandOrArgs: "rm -rf /",
		});
		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain("**Policy Verdict:** `BLOCK`");
		expect(text).toContain("Destructive Action Risk");
	});

	it("jev_completion assesses goal satisfaction and verification status", async () => {
		const state = createInitialDecisionState({ intent: "Implement caching" });
		state.verification.testStatus = "passing";
		const engine = new MockEngine();
		engine.nextAnswers = {
			goalSatisfied: { type: "noul", noul: 0.9 },
			verificationSufficient: { type: "noul", noul: 0.85 },
			remainingBlockers: { type: "noul", noul: 0.05 },
		};

		const completionTool = createJevCompletionTool(
			() => state,
			() => engine,
		);
		const result = await completionTool.execute("call-7", {
			notes: "Added Redis cache and all unit tests pass",
		});
		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain("**Overall Readiness:** `READY`");
		expect(text).toContain("Ready to Settle");
	});
});
