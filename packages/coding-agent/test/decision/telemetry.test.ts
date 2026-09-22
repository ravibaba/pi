import { describe, expect, it } from "vitest";
import type { DecisionResult } from "../../src/core/decision/decision-types.ts";
import { DecisionTelemetry } from "../../src/core/decision/telemetry.ts";

describe("telemetry", () => {
	it("records decision entries and computes accurate metrics", () => {
		const telemetry = new DecisionTelemetry(10);

		const fakeResult1: DecisionResult = {
			answers: {
				modelTier: {
					type: "choice",
					choice: "standard",
					confidence: 0.95,
					probabilities: { standard: 0.95, fast: 0.05 },
				},
			},
			confidence: 0.95,
			latencyMs: 80,
			inputTokens: 110,
			costUsd: 0.0001,
			model: "jev-latest",
			fallback: false,
			stateHash: "hash-1",
		};

		const fakeResult2: DecisionResult = {
			answers: {
				destructive: { type: "noul", noul: 0.9 },
			},
			confidence: 0.85,
			latencyMs: 120,
			inputTokens: 140,
			costUsd: 0.00012,
			model: "jev-latest",
			fallback: false,
			stateHash: "hash-2",
		};

		const id1 = telemetry.record("task_routing", fakeResult1);
		const id2 = telemetry.record("tool_risk", fakeResult2);

		expect(id1).toBeDefined();
		expect(id2).toBeDefined();

		const record1 = telemetry.getRecord(id1);
		expect(record1?.decisionType).toBe("task_routing");
		expect(record1?.model).toBe("jev-latest");
		expect(record1?.prediction.modelTier).toBe("standard");

		// Record downstream outcome
		telemetry.recordOutcome(id1, {
			testsPassed: true,
			tokensSaved: 1500,
		});

		const updatedRecord1 = telemetry.getRecord(id1);
		expect(updatedRecord1?.outcome?.testsPassed).toBe(true);
		expect(updatedRecord1?.outcome?.tokensSaved).toBe(1500);

		const records = telemetry.getRecords();
		expect(records).toHaveLength(2);

		const metrics = telemetry.getMetrics();
		expect(metrics.totalDecisions).toBe(2);
		expect(metrics.averageLatencyMs).toBe(100);
		expect(metrics.totalInputTokens).toBe(250);
		expect(metrics.estimatedTokensSaved).toBe(1500);
	});

	it("respects maxRecords capacity and rotates old entries", () => {
		const telemetry = new DecisionTelemetry(3);

		for (let i = 0; i < 5; i++) {
			telemetry.record("test_decision", {
				answers: {},
				confidence: 0.9,
				latencyMs: 10,
				inputTokens: 50,
				costUsd: 0.00005,
				model: "jev-latest",
				fallback: false,
				stateHash: `hash-${i}`,
			});
		}

		const records = telemetry.getRecords();
		expect(records).toHaveLength(3);
		expect(records[records.length - 1].stateHash).toBe("hash-4");
	});
});
