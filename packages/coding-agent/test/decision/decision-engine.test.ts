import { describe, expect, it } from "vitest";
import { DecisionCache } from "../../src/core/decision/cache.ts";
import {
	CachedDecisionEngine,
	DeterministicDecisionEngine,
	JevDecisionEngine,
	StandardDecisionEngine,
} from "../../src/core/decision/decision-engine.ts";
import { createInitialDecisionState } from "../../src/core/decision/decision-state.ts";
import { TASK_ROUTING_V1, TOOL_RISK_V1 } from "../../src/core/decision/question-registry.ts";
import { DecisionTelemetry } from "../../src/core/decision/telemetry.ts";

describe("decision-engine", () => {
	const testState = createInitialDecisionState({
		intent: "Fix database connection retry logic",
	});

	it("DeterministicDecisionEngine should provide safe offline fallbacks", async () => {
		const engine = new DeterministicDecisionEngine();
		const result = await engine.decide(testState, TASK_ROUTING_V1);

		expect(result.fallback).toBe(true);
		expect(result.answers.modelTier.choice).toBe("standard");
		expect(result.answers.complexity.score).toBe(0);
		expect(result.answers.securitySensitive.noul).toBe(0.0);
	});

	it("JevDecisionEngine should evaluate questions using custom fetch adapter", async () => {
		// Mock fetch returning a valid TypeSafe /v1/systemone response
		const mockFetch = async () => {
			const body = JSON.stringify({
				model: "jev-latest",
				answers: {
					modelTier: {
						type: "choice",
						choice: "reasoning",
						confidence: 0.94,
						probabilities: { reasoning: 0.94, standard: 0.06 },
					},
					complexity: {
						type: "score",
						score: 3.2,
						confidence: 0.88,
						legend: { 0: "Trivial", 1: "Simple", 2: "Moderate", 3: "Complex", 4: "Arch" },
						probabilities: { 3: 0.8, 4: 0.2 },
					},
					securitySensitive: {
						type: "noul",
						noul: 0.12,
					},
					needsRepoSearch: {
						type: "noul",
						noul: 0.78,
					},
					likelyLongHorizon: {
						type: "noul",
						noul: 0.65,
					},
				},
				usage: {
					input_tokens: 320,
					output_tokens: 0,
				},
			});

			return new Response(body, {
				status: 200,
				headers: {
					"content-type": "application/json",
					"x-typesafe-request-id": "req-mock-12345",
				},
			});
		};

		const engine = new JevDecisionEngine({
			apiKey: "mock-key",
			fetch: mockFetch,
		});

		const result = await engine.decide(testState, TASK_ROUTING_V1);

		expect(result.fallback).toBe(false);
		expect(result.model).toBe("jev-latest");
		expect(result.requestId).toBe("req-mock-12345");
		expect(result.answers.modelTier.choice).toBe("reasoning");
		expect(result.answers.complexity.score).toBe(3.2);
		expect(result.answers.securitySensitive.noul).toBe(0.12);
		expect(result.inputTokens).toBe(320);
		expect(result.costUsd).toBeGreaterThan(0);
	});

	it("JevDecisionEngine should fall back gracefully on network or API error", async () => {
		const failingFetch = async () => {
			return new Response("Internal Server Error", { status: 500 });
		};

		const engine = new JevDecisionEngine({
			apiKey: "mock-key",
			maxRetries: 0,
			fetch: failingFetch,
		});

		const result = await engine.decide(testState, TOOL_RISK_V1);

		expect(result.fallback).toBe(true);
		expect(result.fallbackReason).toBeDefined();
		// High-risk tool fallback must fail closed (destructive = 0.85)
		expect(result.answers.destructive.noul).toBe(0.85);
	});

	it("CachedDecisionEngine should return cached results for identical state and questions", async () => {
		let callCount = 0;
		const mockFetch = async () => {
			callCount += 1;
			const body = JSON.stringify({
				model: "jev-latest",
				answers: {
					destructive: { type: "noul", noul: 0.05 },
					credentialAccess: { type: "noul", noul: 0.01 },
					networkExfiltration: { type: "noul", noul: 0.01 },
					productionImpact: { type: "noul", noul: 0.0 },
					scopeViolation: { type: "score", score: 0, confidence: 0.9, legend: {}, probabilities: {} },
				},
			});
			return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
		};

		const baseEngine = new JevDecisionEngine({ fetch: mockFetch });
		const cachedEngine = new CachedDecisionEngine(baseEngine, new DecisionCache());

		// Call 1
		const res1 = await cachedEngine.decide(testState, TOOL_RISK_V1);
		expect(callCount).toBe(1);

		// Call 2 (cached)
		const res2 = await cachedEngine.decide(testState, TOOL_RISK_V1);
		expect(callCount).toBe(1);
		expect(res2.answers.destructive.noul).toBe(res1.answers.destructive.noul);

		// Call 3 (bypass cache)
		await cachedEngine.decide(testState, TOOL_RISK_V1, { bypassCache: true });
		expect(callCount).toBe(2);
	});

	it("StandardDecisionEngine should record decisions to DecisionTelemetry", async () => {
		const telemetry = new DecisionTelemetry();
		const engine = new StandardDecisionEngine({
			mode: "off",
			telemetry,
		});

		await engine.decide(testState, TASK_ROUTING_V1);

		const metrics = telemetry.getMetrics();
		expect(metrics.totalDecisions).toBe(1);
		expect(metrics.fallbackCount).toBe(1);
	});
});
