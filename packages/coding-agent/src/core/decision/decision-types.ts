/**
 * Core types for Pi's System-1 Decision Subsystem
 */

export type DecisionMode = "off" | "shadow" | "advisory" | "enforced";

export type ModelTier = "fast" | "standard" | "reasoning" | "deep";

export type ExecutionPhase = "understand" | "explore" | "implement" | "test" | "debug" | "verify";

export type StrategyAction = "continue" | "retry" | "change_strategy" | "escalate_model" | "stop_and_verify";

export type ToolAuthorization = "allow" | "ask_user" | "block";

/**
 * First-class persistent semantic state maintained across agent turns.
 * Feeds compact, structured features to DecisionEngine without raw transcript bloat.
 */
export interface DecisionState {
	task: {
		intent: string;
		complexity: number;
		risk: number;
		scope: "local" | "repo" | "system";
		domain: string[];
		requiredCapabilities: string[];
	};

	repository: {
		activeFiles: string[];
		relevantAreas: string[];
		architecture: string[];
		tests: string[];
		branch?: string;
		dirty?: boolean;
	};

	execution: {
		phase: ExecutionPhase;
		turn: number;
		progress: number;
		failedAttempts: number;
		consecutiveFailures: number;
		retries: number;
		strategyChanges: number;
		filesChanged: string[];
		oscillationCount: number;
		lastTool?: string;
		lastToolSuccess?: boolean;
		lastErrorFingerprint?: string;
		repeatedActions: number;
	};

	context: {
		criticalFacts: string[];
		decisions: string[];
		constraints: string[];
		unresolvedQuestions: string[];
	};

	model: {
		current: string;
		currentTier: ModelTier;
		requiredCapability?: string;
		confidence: number;
		escalatedFrom?: ModelTier;
	};

	verification: {
		testStatus: "untested" | "passing" | "failing" | "flaky";
		lintsStatus: "clean" | "errors" | "untested";
		diffMatch: number;
		acceptanceStatus: "pending" | "satisfied" | "violated";
	};

	/** Optional tool proposal when evaluating beforeToolCall */
	proposedTool?: {
		name: string;
		argumentsSummary: string;
		paths: string[];
		isDestructiveCandidate: boolean;
	};
}

/** Primitive question definition types matching Jev's System-1 capabilities */
export interface NoulQuestionDef {
	readonly type: "noul";
	readonly instructions: string;
	readonly criteria?: {
		readonly true?: string;
		readonly false?: string;
	};
}

export interface ChoiceQuestionDef<T extends Record<string, string> = Record<string, string>> {
	readonly type: "choice";
	readonly instructions: string;
	readonly criteria: T;
}

export interface ScoreQuestionDef {
	readonly type: "score";
	readonly instructions: string;
	readonly criteria: readonly [string, string, ...string[]];
}

export type DecisionQuestionDef = NoulQuestionDef | ChoiceQuestionDef<any> | ScoreQuestionDef;

export type DecisionQuestionsMap = Record<string, DecisionQuestionDef>;

export interface NoulAnswer {
	readonly type: "noul";
	readonly noul: number;
}

export interface ChoiceAnswer<T extends string = string> {
	readonly type: "choice";
	readonly choice: T;
	readonly confidence: number;
	readonly probabilities: Record<T, number>;
}

export interface ScoreAnswer {
	readonly type: "score";
	readonly score: number;
	readonly confidence: number;
	readonly legend: Record<number, string>;
	readonly probabilities: Record<number, number>;
}

export type DecisionAnswer = NoulAnswer | ChoiceAnswer<any> | ScoreAnswer;

export type DecisionAnswersMap<Q extends DecisionQuestionsMap> = {
	[K in keyof Q]: Q[K] extends NoulQuestionDef
		? NoulAnswer
		: Q[K] extends ChoiceQuestionDef<infer C>
			? ChoiceAnswer<Extract<keyof C, string>>
			: Q[K] extends ScoreQuestionDef
				? ScoreAnswer
				: DecisionAnswer;
};

export interface DecisionResult<Q extends DecisionQuestionsMap = DecisionQuestionsMap> {
	readonly answers: DecisionAnswersMap<Q>;
	readonly confidence: number;
	readonly latencyMs: number;
	readonly inputTokens: number;
	readonly costUsd: number;
	readonly model: string;
	readonly requestId?: string;
	readonly fallback: boolean;
	readonly fallbackReason?: string;
	readonly stateHash: string;
}

export interface DecisionOptions {
	timeoutMs?: number;
	maxRetries?: number;
	signal?: AbortSignal;
	bypassCache?: boolean;
	correlationId?: string;
}

/** Core Decision Engine interface abstracting System-1 providers */
export interface DecisionEngine {
	decide<Q extends DecisionQuestionsMap>(
		state: DecisionState,
		questions: Q,
		options?: DecisionOptions,
	): Promise<DecisionResult<Q>>;
}
