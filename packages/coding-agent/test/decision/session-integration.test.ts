import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import type {
	DecisionEngine,
	DecisionOptions,
	DecisionQuestionsMap,
	DecisionResult,
	DecisionState,
} from "../../src/core/decision/decision-types.ts";
import { TASK_ROUTING_V1, TOOL_RISK_V1 } from "../../src/core/decision/question-registry.ts";
import { createHarness, fauxModel, type Harness } from "../test-harness.ts";

/**
 * Mock DecisionEngine for deterministic, observable integration tests.
 */
class MockDecisionEngine implements DecisionEngine {
	public recordedCalls: Array<{ questions: DecisionQuestionsMap; state: DecisionState }> = [];
	public nextAnswers: Record<string, any> = {};

	async decide<Q extends DecisionQuestionsMap>(
		state: DecisionState,
		questions: Q,
		_options?: DecisionOptions,
	): Promise<DecisionResult<Q>> {
		this.recordedCalls.push({ questions, state: JSON.parse(JSON.stringify(state)) });

		const answers: Record<string, any> = {};
		for (const [name, def] of Object.entries(questions)) {
			if (this.nextAnswers[name] !== undefined) {
				answers[name] = this.nextAnswers[name];
			} else if (def.type === "noul") {
				answers[name] = { type: "noul", noul: 0.1 };
			} else if (def.type === "choice") {
				const firstKey = Object.keys(def.criteria)[0];
				answers[name] = {
					type: "choice",
					choice: firstKey,
					confidence: 0.9,
					probabilities: { [firstKey]: 0.9 },
				};
			} else if (def.type === "score") {
				answers[name] = { type: "score", score: 0.8 };
			}
		}

		return {
			answers: answers as any,
			stateHash: "mock-hash",
			latencyMs: 5,
			confidence: 0.95,
			inputTokens: 100,
			costUsd: 0.0001,
			model: "mock-jev",
			fallback: false,
		};
	}
}

describe("Session Integration with Jev Decision Subsystem", () => {
	let harness: Harness;

	afterEach(() => {
		harness?.cleanup();
	});

	it("initializes decision state and runs task routing in shadow mode", async () => {
		const mockEngine = new MockDecisionEngine();
		mockEngine.nextAnswers = {
			modelTier: {
				type: "choice",
				choice: "reasoning",
				confidence: 0.95,
				probabilities: { fast: 0.01, standard: 0.04, reasoning: 0.95, deep: 0.0 },
			},
			complexity: { type: "score", score: 0.8 },
			requiresTools: { type: "noul", noul: 0.9 },
		};

		harness = await createHarness({
			responses: ["Task completed successfully."],
			settings: {
				jev: {
					enabled: true,
					mode: "shadow",
				},
			},
			decisionEngine: mockEngine,
		});

		await harness.session.prompt("Implement a complex architectural refactor");

		// Verify decision state was created
		const decisionState = harness.session.decisionState;
		expect(decisionState).toBeDefined();
		expect(decisionState?.task.intent).toBe("Implement a complex architectural refactor");

		// In shadow mode, decision was recorded
		expect(mockEngine.recordedCalls.length).toBeGreaterThanOrEqual(1);
		const routingCall = mockEngine.recordedCalls.find(
			(c) => c.questions === TASK_ROUTING_V1 || Object.keys(c.questions).includes("modelTier"),
		);
		expect(routingCall).toBeDefined();

		// In shadow mode, tier was updated on state but active model did not change
		expect(decisionState?.model.currentTier).toBe("reasoning");
		expect(harness.session.model?.id).toBe(fauxModel.id);
	});

	it("blocks destructive tool call when in enforced mode", async () => {
		const mockEngine = new MockDecisionEngine();
		mockEngine.nextAnswers = {
			// Destructive score 0.99 exceeds the 0.80 block threshold
			destructive: { type: "noul", noul: 0.99 },
			credentialAccess: { type: "noul", noul: 0.0 },
			networkExfiltration: { type: "noul", noul: 0.0 },
			productionImpact: { type: "noul", noul: 0.0 },
		};

		let toolExecutionCount = 0;
		const bashTool: AgentTool = {
			name: "bash",
			label: "Bash",
			description: "Execute bash commands",
			parameters: Type.Object({ command: Type.String() }),
			execute: async () => {
				toolExecutionCount++;
				return { content: [{ type: "text", text: "executed" }], details: {} };
			},
		};

		harness = await createHarness({
			responses: [
				{
					text: "Running cleanup...",
					toolCalls: [{ name: "bash", args: { command: "rm -rf /critical/system/files" } }],
				},
				"Tool was blocked, stopping.",
			],
			baseToolsOverride: {
				bash: bashTool,
			},
			settings: {
				jev: {
					enabled: true,
					mode: "enforced",
				},
			},
			decisionEngine: mockEngine,
		});

		await harness.session.prompt("Delete the server filesystem");

		// Tool must NOT have been executed because beforeToolCall blocked it
		expect(toolExecutionCount).toBe(0);

		// Verify TOOL_RISK_V1 was evaluated
		const riskCall = mockEngine.recordedCalls.find(
			(c) => c.questions === TOOL_RISK_V1 || Object.keys(c.questions).includes("destructive"),
		);
		expect(riskCall).toBeDefined();

		// Verify the session emitted a tool result indicating failure / block
		const toolResultEvents = harness.eventsOfType("tool_execution_end");
		expect(toolResultEvents.length).toBe(1);
		expect(toolResultEvents[0].isError).toBe(true);
	});

	it("allows destructive tool call in shadow mode and logs decision", async () => {
		const mockEngine = new MockDecisionEngine();
		mockEngine.nextAnswers = {
			destructive: { type: "noul", noul: 0.99 },
		};

		let toolExecutionCount = 0;
		const bashTool: AgentTool = {
			name: "bash",
			label: "Bash",
			description: "Execute bash commands",
			parameters: Type.Object({ command: Type.String() }),
			execute: async () => {
				toolExecutionCount++;
				return { content: [{ type: "text", text: "executed safely" }], details: {} };
			},
		};

		harness = await createHarness({
			responses: [
				{
					text: "Running risky command...",
					toolCalls: [{ name: "bash", args: { command: "rm -rf /tmp/cache" } }],
				},
				"Completed.",
			],
			baseToolsOverride: {
				bash: bashTool,
			},
			settings: {
				jev: {
					enabled: true,
					mode: "shadow",
				},
			},
			decisionEngine: mockEngine,
		});

		await harness.session.prompt("Clean the cache directory");

		// In shadow mode, the tool is allowed to execute
		expect(toolExecutionCount).toBe(1);

		// But the risk was evaluated
		const riskCall = mockEngine.recordedCalls.find(
			(c) => c.questions === TOOL_RISK_V1 || Object.keys(c.questions).includes("destructive"),
		);
		expect(riskCall).toBeDefined();
	});

	it("tracks tool execution count and error state across turns", async () => {
		let callIndex = 0;
		const flakyTool: AgentTool = {
			name: "flaky",
			label: "Flaky Tool",
			description: "Fails first time, succeeds second time",
			parameters: Type.Object({ action: Type.String() }),
			execute: async () => {
				callIndex++;
				if (callIndex === 1) {
					throw new Error("Temporary network timeout");
				}
				return { content: [{ type: "text", text: "ok" }], details: {} };
			},
		};

		harness = await createHarness({
			responses: [
				{
					text: "Trying action...",
					toolCalls: [{ name: "flaky", args: { action: "sync" } }],
				},
				{
					text: "Retrying action...",
					toolCalls: [{ name: "flaky", args: { action: "sync" } }],
				},
				"Done.",
			],
			baseToolsOverride: {
				flaky: flakyTool,
			},
			settings: {
				jev: {
					enabled: true,
					mode: "shadow",
				},
			},
		});

		await harness.session.prompt("Perform synchronization");

		const decisionState = harness.session.decisionState;
		expect(decisionState).toBeDefined();
		expect(decisionState?.execution.turn).toBe(2);
		expect(decisionState?.execution.failedAttempts).toBe(1);
		// After success on 2nd attempt, consecutiveFailures should reset to 0
		expect(decisionState?.execution.consecutiveFailures).toBe(0);
	});

	it("routes and switches model dynamically in enforced mode", async () => {
		const reasoningModel: Model<any> = {
			...fauxModel,
			id: "faux-reasoning",
			name: "Faux Reasoning Model",
			reasoning: true,
		};

		const mockEngine = new MockDecisionEngine();
		mockEngine.nextAnswers = {
			modelTier: {
				type: "choice",
				choice: "reasoning",
				confidence: 0.95,
				probabilities: { fast: 0.0, standard: 0.05, reasoning: 0.95, deep: 0.0 },
			},
			complexity: { type: "score", score: 0.9 },
		};

		harness = await createHarness({
			responses: ["Refactoring completed using high reasoning."],
			scopedModels: [{ model: reasoningModel }],
			settings: {
				jev: {
					enabled: true,
					mode: "enforced",
					modelTiers: {
						reasoning: `${reasoningModel.provider}/${reasoningModel.id}`,
					},
				},
			},
			decisionEngine: mockEngine,
		});

		// Initially using default fauxModel
		expect(harness.session.model?.id).toBe(fauxModel.id);

		await harness.session.prompt("Perform complex distributed consensus refactor");

		// In enforced mode, it should have switched to the reasoning model
		expect(harness.session.model?.id).toBe("faux-reasoning");
		expect(harness.session.decisionState?.model.currentTier).toBe("reasoning");
	});

	it("dynamically escalates model to reasoning tier upon consecutive tool failures in enforced mode", async () => {
		const reasoningModel: Model<any> = {
			...fauxModel,
			id: "faux-reasoning",
			name: "Faux Reasoning Model",
			reasoning: true,
		};

		const failingTool: AgentTool = {
			name: "worker",
			label: "Worker Tool",
			description: "Always fails",
			parameters: Type.Object({ cmd: Type.String() }),
			execute: async () => {
				throw new Error("Compilation failure: type mismatch");
			},
		};

		const mockEngine = new MockDecisionEngine();
		mockEngine.nextAnswers = {
			strategyAction: {
				type: "choice",
				choice: "change_strategy",
				confidence: 0.9,
				probabilities: { continue: 0.05, retry: 0.05, change_strategy: 0.9, ask_user: 0.0 },
			},
		};

		harness = await createHarness({
			responses: [
				{
					text: "Attempt 1...",
					toolCalls: [{ name: "worker", args: { cmd: "build" } }],
				},
				{
					text: "Attempt 2...",
					toolCalls: [{ name: "worker", args: { cmd: "build" } }],
				},
				"Escalated and resolved.",
			],
			baseToolsOverride: {
				worker: failingTool,
			},
			scopedModels: [{ model: reasoningModel }],
			settings: {
				jev: {
					enabled: true,
					mode: "enforced",
					modelTiers: {
						reasoning: `${reasoningModel.provider}/${reasoningModel.id}`,
					},
				},
			},
			decisionEngine: mockEngine,
		});

		// Initially standard tier
		expect(harness.session.model?.id).toBe(fauxModel.id);

		await harness.session.prompt("Solve difficult type error");

		// After consecutive failures, it should have escalated to the reasoning model
		expect(harness.session.model?.id).toBe("faux-reasoning");
		expect(harness.session.decisionState?.model.currentTier).toBe("reasoning");
		expect(harness.session.decisionState?.execution.consecutiveFailures).toBeGreaterThanOrEqual(2);
	});

	it("automatically detects test command and transitions phase to verify", async () => {
		const testBashTool: AgentTool = {
			name: "bash",
			label: "Bash",
			description: "Bash execution",
			parameters: Type.Object({ command: Type.String() }),
			execute: async () => {
				return { content: [{ type: "text", text: "✓ 12 tests passed" }], details: {} };
			},
		};

		harness = await createHarness({
			responses: [
				{
					text: "Running tests...",
					toolCalls: [{ name: "bash", args: { command: "npm test" } }],
				},
				"All tests verified.",
			],
			baseToolsOverride: {
				bash: testBashTool,
			},
			settings: {
				jev: {
					enabled: true,
					mode: "shadow",
				},
			},
		});

		await harness.session.prompt("Verify the test suite");

		const decisionState = harness.session.decisionState;
		expect(decisionState?.verification.testStatus).toBe("passing");
		expect(decisionState?.execution.phase).toBe("verify");
	});
});
