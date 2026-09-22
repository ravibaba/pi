import type {
	ChoiceAnswer,
	ModelTier,
	NoulAnswer,
	ScoreAnswer,
	StrategyAction,
	ToolAuthorization,
} from "./decision-types.ts";
import { DEFAULT_THRESHOLDS, type JevThresholds } from "./thresholds.ts";

export interface ToolPolicyResult {
	readonly authorization: ToolAuthorization;
	readonly reason: string;
	readonly compositeRiskScore: number;
}

export interface ModelRoutingPolicyResult {
	readonly tier: ModelTier;
	readonly confidence: number;
	readonly isEscalation: boolean;
	readonly reason: string;
}

export interface StrategyPolicyResult {
	readonly action: StrategyAction;
	readonly isStalled: boolean;
	readonly reason: string;
}

export interface CompletionPolicyResult {
	readonly isComplete: boolean;
	readonly reason: string;
}

/**
 * Authoritative deterministic policies for evaluating Jev System-1 judgments.
 * Principle: Jev estimates semantic probability; deterministic policy decides action.
 */
export class DecisionPolicy {
	private readonly _thresholds: JevThresholds;

	constructor(thresholds: JevThresholds = DEFAULT_THRESHOLDS) {
		this._thresholds = thresholds;
	}

	/**
	 * Authorizes or restricts proposed tool execution based on semantic risk evaluation.
	 */
	evaluateToolRisk(answers: {
		destructive?: NoulAnswer;
		credentialAccess?: NoulAnswer;
		networkExfiltration?: NoulAnswer;
		productionImpact?: NoulAnswer;
		scopeViolation?: ScoreAnswer;
	}): ToolPolicyResult {
		const destructive = answers.destructive?.noul ?? 0.0;
		const credentialAccess = answers.credentialAccess?.noul ?? 0.0;
		const networkExfiltration = answers.networkExfiltration?.noul ?? 0.0;
		const productionImpact = answers.productionImpact?.noul ?? 0.0;
		const scopeViolation = answers.scopeViolation?.score ?? 0;

		// Calculate composite risk score on a 0-5 scale
		const compositeRiskScore =
			destructive * 2.0 +
			credentialAccess * 2.5 +
			networkExfiltration * 1.5 +
			productionImpact * 3.0 +
			(scopeViolation / 3) * 1.5;

		// Hard blocks for extreme danger
		if (productionImpact >= 0.85) {
			return {
				authorization: "block",
				reason: "Blocked: Command detected as targeting production infrastructure",
				compositeRiskScore,
			};
		}

		if (destructive >= 0.9) {
			return {
				authorization: "block",
				reason: "Blocked: Command detected as severely destructive to system or repository",
				compositeRiskScore,
			};
		}

		if (compositeRiskScore >= this._thresholds.toolBlockRiskScore) {
			return {
				authorization: "block",
				reason: `Blocked: Composite risk score (${compositeRiskScore.toFixed(2)}) exceeds safety threshold`,
				compositeRiskScore,
			};
		}

		// User approval required for sensitive actions
		if (credentialAccess >= this._thresholds.credentialAccessRisk) {
			return {
				authorization: "ask_user",
				reason: `Requires Approval: High credential access risk (${(credentialAccess * 100).toFixed(0)}%)`,
				compositeRiskScore,
			};
		}

		if (destructive >= this._thresholds.destructiveRisk) {
			return {
				authorization: "ask_user",
				reason: `Requires Approval: Potentially destructive action (${(destructive * 100).toFixed(0)}% likelihood)`,
				compositeRiskScore,
			};
		}

		if (networkExfiltration >= this._thresholds.networkExfiltrationRisk) {
			return {
				authorization: "ask_user",
				reason: `Requires Approval: Possible outbound network transmission (${(networkExfiltration * 100).toFixed(0)}%)`,
				compositeRiskScore,
			};
		}

		if (scopeViolation >= this._thresholds.scopeViolationScore) {
			return {
				authorization: "ask_user",
				reason: `Requires Approval: Tool modifies workspace areas outside target task scope`,
				compositeRiskScore,
			};
		}

		return {
			authorization: "allow",
			reason: "Allowed by deterministic risk policy",
			compositeRiskScore,
		};
	}

	/**
	 * Evaluates model tier routing from task classification answers.
	 */
	evaluateModelTierRouting(
		answers: {
			modelTier?: ChoiceAnswer<ModelTier>;
			complexity?: ScoreAnswer;
			securitySensitive?: NoulAnswer;
			needsRepoSearch?: NoulAnswer;
			likelyLongHorizon?: NoulAnswer;
		},
		currentTier: ModelTier = "standard",
	): ModelRoutingPolicyResult {
		const rawTier = answers.modelTier?.choice ?? "standard";
		const confidence = answers.modelTier?.confidence ?? 0.5;

		// Low confidence falls back to current / default tier
		if (confidence < this._thresholds.routingConfidence) {
			return {
				tier: currentTier,
				confidence,
				isEscalation: false,
				reason: `Confidence (${confidence.toFixed(2)}) below routing threshold (${this._thresholds.routingConfidence}); maintaining ${currentTier}`,
			};
		}

		const isEscalation = this._compareTiers(rawTier, currentTier) > 0;
		return {
			tier: rawTier,
			confidence,
			isEscalation,
			reason: `Routed to ${rawTier} (confidence: ${(confidence * 100).toFixed(0)}%)`,
		};
	}

	/**
	 * Evaluates strategic course-correction from progress/stall supervisor answers.
	 */
	evaluateStrategyAction(answers: {
		strategyAction?: ChoiceAnswer<StrategyAction>;
		isProgressing?: NoulAnswer;
		isStalled?: NoulAnswer;
	}): StrategyPolicyResult {
		const rawAction = answers.strategyAction?.choice ?? "continue";
		const stalledProb = answers.isStalled?.noul ?? 0.0;
		const isStalled = stalledProb >= this._thresholds.stallProbability;

		if (isStalled && rawAction === "continue") {
			return {
				action: "change_strategy",
				isStalled: true,
				reason: `High stall probability (${(stalledProb * 100).toFixed(0)}%) overrides continue action to change_strategy`,
			};
		}

		return {
			action: rawAction,
			isStalled,
			reason: `Strategy supervisor selected ${rawAction} (stalled prob: ${(stalledProb * 100).toFixed(0)}%)`,
		};
	}

	/**
	 * Evaluates completion verification.
	 */
	evaluateCompletion(answers: {
		goalSatisfied?: NoulAnswer;
		verificationSufficient?: NoulAnswer;
		remainingBlockers?: NoulAnswer;
	}): CompletionPolicyResult {
		const goalSatisfied = answers.goalSatisfied?.noul ?? 0.0;
		const verificationSufficient = answers.verificationSufficient?.noul ?? 0.0;
		const remainingBlockers = answers.remainingBlockers?.noul ?? 0.0;

		if (remainingBlockers >= 0.5) {
			return {
				isComplete: false,
				reason: `Incomplete: Detected unresolved blockers or errors (${(remainingBlockers * 100).toFixed(0)}%)`,
			};
		}

		if (goalSatisfied >= this._thresholds.completionConfidence && verificationSufficient >= 0.6) {
			return {
				isComplete: true,
				reason: `Complete: Goal satisfied (${(goalSatisfied * 100).toFixed(0)}%) and verified (${(verificationSufficient * 100).toFixed(0)}%)`,
			};
		}

		return {
			isComplete: false,
			reason: `Incomplete: Goal confidence (${(goalSatisfied * 100).toFixed(0)}%) or verification (${(verificationSufficient * 100).toFixed(0)}%) insufficient`,
		};
	}

	private _compareTiers(a: ModelTier, b: ModelTier): number {
		const ranking: Record<ModelTier, number> = {
			fast: 0,
			standard: 1,
			reasoning: 2,
			deep: 3,
		};
		return ranking[a] - ranking[b];
	}
}
