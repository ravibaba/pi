import { hashDecisionState } from "./decision-state.ts";
import type {
	ChoiceAnswer,
	DecisionAnswer,
	DecisionAnswersMap,
	DecisionQuestionsMap,
	DecisionResult,
	DecisionState,
	NoulAnswer,
	ScoreAnswer,
} from "./decision-types.ts";

/**
 * Generates deterministic fallback responses when Jev times out, is unavailable,
 * or returns an unprocessable error.
 *
 * Principle:
 * - Low-risk decisions fall back to safe native Pi behavior.
 * - High-risk decisions fail closed (require approval or block).
 */
export function createFallbackResult<Q extends DecisionQuestionsMap>(
	state: DecisionState,
	questions: Q,
	errorReason: string,
	latencyMs = 0,
): DecisionResult<Q> {
	const answers: Record<string, DecisionAnswer> = {};

	for (const [name, def] of Object.entries(questions)) {
		if (def.type === "noul") {
			// For high-risk questions, fail closed (assume risk is present)
			const isHighRiskQuestion =
				name === "destructive" ||
				name === "credentialAccess" ||
				name === "networkExfiltration" ||
				name === "productionImpact";

			const noulAnswer: NoulAnswer = {
				type: "noul",
				noul: isHighRiskQuestion ? 0.85 : 0.0,
			};
			answers[name] = noulAnswer;
		} else if (def.type === "choice") {
			const keys = Object.keys(def.criteria);
			let defaultChoice = keys[0];

			// Safe choice defaults for known question types
			if (name === "modelTier") {
				defaultChoice = "standard";
			} else if (name === "strategyAction") {
				defaultChoice = "continue";
			}

			const probabilities: Record<string, number> = {};
			for (const key of keys) {
				probabilities[key] = key === defaultChoice ? 1.0 : 0.0;
			}

			const choiceAnswer: ChoiceAnswer = {
				type: "choice",
				choice: defaultChoice,
				confidence: 0.5,
				probabilities,
			};
			answers[name] = choiceAnswer;
		} else if (def.type === "score") {
			const legend: Record<number, string> = {};
			const probabilities: Record<number, number> = {};
			for (let i = 0; i < def.criteria.length; i++) {
				legend[i] = String(def.criteria[i]);
				probabilities[i] = i === 0 ? 1.0 : 0.0;
			}

			const scoreAnswer: ScoreAnswer = {
				type: "score",
				score: 0,
				confidence: 0.5,
				legend,
				probabilities,
			};
			answers[name] = scoreAnswer;
		}
	}

	return {
		answers: answers as DecisionAnswersMap<Q>,
		confidence: 0.5,
		latencyMs,
		inputTokens: 0,
		costUsd: 0,
		model: "deterministic-fallback",
		fallback: true,
		fallbackReason: errorReason,
		stateHash: hashDecisionState(state),
	};
}
