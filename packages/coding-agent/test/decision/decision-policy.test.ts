import { describe, expect, it } from "vitest";
import { DecisionPolicy } from "../../src/core/decision/decision-policy.ts";

describe("decision-policy", () => {
	const policy = new DecisionPolicy();

	describe("evaluateToolRisk", () => {
		it("should allow safe low-risk tool call", () => {
			const result = policy.evaluateToolRisk({
				destructive: { type: "noul", noul: 0.05 },
				credentialAccess: { type: "noul", noul: 0.01 },
				networkExfiltration: { type: "noul", noul: 0.02 },
				productionImpact: { type: "noul", noul: 0.0 },
				scopeViolation: {
					type: "score",
					score: 0,
					confidence: 0.95,
					legend: { 0: "none" },
					probabilities: { 0: 1.0 },
				},
			});

			expect(result.authorization).toBe("allow");
		});

		it("should require user approval when credential access is elevated", () => {
			const result = policy.evaluateToolRisk({
				destructive: { type: "noul", noul: 0.05 },
				credentialAccess: { type: "noul", noul: 0.35 }, // above threshold 0.20
				networkExfiltration: { type: "noul", noul: 0.05 },
				productionImpact: { type: "noul", noul: 0.0 },
			});

			expect(result.authorization).toBe("ask_user");
			expect(result.reason).toContain("credential access risk");
		});

		it("should require user approval when destructive risk is high", () => {
			const result = policy.evaluateToolRisk({
				destructive: { type: "noul", noul: 0.85 }, // above threshold 0.75
				credentialAccess: { type: "noul", noul: 0.02 },
				networkExfiltration: { type: "noul", noul: 0.01 },
				productionImpact: { type: "noul", noul: 0.0 },
			});

			expect(result.authorization).toBe("ask_user");
			expect(result.reason).toContain("destructive action");
		});

		it("should block when production impact is detected", () => {
			const result = policy.evaluateToolRisk({
				destructive: { type: "noul", noul: 0.2 },
				credentialAccess: { type: "noul", noul: 0.05 },
				networkExfiltration: { type: "noul", noul: 0.1 },
				productionImpact: { type: "noul", noul: 0.9 }, // >= 0.85
			});

			expect(result.authorization).toBe("block");
			expect(result.reason).toContain("production infrastructure");
		});
	});

	describe("evaluateModelTierRouting", () => {
		it("should route to model tier when confidence meets threshold", () => {
			const result = policy.evaluateModelTierRouting(
				{
					modelTier: {
						type: "choice",
						choice: "reasoning",
						confidence: 0.92,
						probabilities: { reasoning: 0.92, standard: 0.08, fast: 0.0, deep: 0.0 },
					},
				},
				"standard",
			);

			expect(result.tier).toBe("reasoning");
			expect(result.isEscalation).toBe(true);
		});

		it("should maintain current tier when confidence is low", () => {
			const result = policy.evaluateModelTierRouting(
				{
					modelTier: {
						type: "choice",
						choice: "deep",
						confidence: 0.65, // below threshold 0.85
						probabilities: { deep: 0.65, reasoning: 0.35, fast: 0.0, standard: 0.0 },
					},
				},
				"standard",
			);

			expect(result.tier).toBe("standard");
			expect(result.isEscalation).toBe(false);
			expect(result.reason).toContain("below routing threshold");
		});
	});

	describe("evaluateStrategyAction", () => {
		it("should override continue action to change_strategy when stalled probability is high", () => {
			const result = policy.evaluateStrategyAction({
				strategyAction: {
					type: "choice",
					choice: "continue",
					confidence: 0.7,
					probabilities: {
						continue: 0.7,
						retry: 0.1,
						change_strategy: 0.1,
						escalate_model: 0.1,
						stop_and_verify: 0.0,
					},
				},
				isStalled: { type: "noul", noul: 0.88 }, // >= stallProbability (0.75)
			});

			expect(result.action).toBe("change_strategy");
			expect(result.isStalled).toBe(true);
		});
	});

	describe("evaluateCompletion", () => {
		it("should mark incomplete if remaining blockers exist", () => {
			const result = policy.evaluateCompletion({
				goalSatisfied: { type: "noul", noul: 0.95 },
				verificationSufficient: { type: "noul", noul: 0.9 },
				remainingBlockers: { type: "noul", noul: 0.7 },
			});

			expect(result.isComplete).toBe(false);
			expect(result.reason).toContain("unresolved blockers");
		});

		it("should verify complete when goal is satisfied and verification is sufficient", () => {
			const result = policy.evaluateCompletion({
				goalSatisfied: { type: "noul", noul: 0.95 },
				verificationSufficient: { type: "noul", noul: 0.85 },
				remainingBlockers: { type: "noul", noul: 0.05 },
			});

			expect(result.isComplete).toBe(true);
		});
	});
});
