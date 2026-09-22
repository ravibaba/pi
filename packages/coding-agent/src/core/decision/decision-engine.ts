import { DecisionCache } from "./cache.ts";
import type {
	DecisionEngine,
	DecisionMode,
	DecisionOptions,
	DecisionQuestionsMap,
	DecisionResult,
	DecisionState,
} from "./decision-types.ts";
import { createFallbackResult } from "./fallbacks.ts";
import { JevClient, type JevClientOptions } from "./jev-client.ts";
import { DecisionTelemetry } from "./telemetry.ts";

export interface DecisionEngineConfig {
	mode?: DecisionMode;
	jevOptions?: JevClientOptions;
	cacheTtlMs?: number;
	enableCache?: boolean;
	telemetry?: DecisionTelemetry;
}

/**
 * Concrete Jev-powered Decision Engine.
 */
export class JevDecisionEngine implements DecisionEngine {
	private readonly _client: JevClient;

	constructor(options: JevClientOptions = {}) {
		this._client = new JevClient(options);
	}

	async decide<Q extends DecisionQuestionsMap>(
		state: DecisionState,
		questions: Q,
		options?: DecisionOptions,
	): Promise<DecisionResult<Q>> {
		try {
			return await this._client.evaluate(state, questions, options);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			return createFallbackResult(state, questions, reason);
		}
	}
}

/**
 * Deterministic Decision Engine used when Jev is disabled or in mock/offline mode.
 */
export class DeterministicDecisionEngine implements DecisionEngine {
	async decide<Q extends DecisionQuestionsMap>(
		state: DecisionState,
		questions: Q,
		_options?: DecisionOptions,
	): Promise<DecisionResult<Q>> {
		return createFallbackResult(state, questions, "Deterministic engine (offline/rule-based)");
	}
}

/**
 * Cached Decision Engine wrapping any underlying DecisionEngine.
 */
export class CachedDecisionEngine implements DecisionEngine {
	private readonly _inner: DecisionEngine;
	private readonly _cache: DecisionCache;

	constructor(inner: DecisionEngine, cache: DecisionCache = new DecisionCache()) {
		this._inner = inner;
		this._cache = cache;
	}

	async decide<Q extends DecisionQuestionsMap>(
		state: DecisionState,
		questions: Q,
		options?: DecisionOptions,
	): Promise<DecisionResult<Q>> {
		if (!options?.bypassCache) {
			const cached = this._cache.get(state, questions);
			if (cached) return cached;
		}

		const result = await this._inner.decide(state, questions, options);
		if (!result.fallback) {
			this._cache.set(state, questions, result);
		}
		return result;
	}
}

/**
 * Standard Production Decision Engine orchestrating Jev, caching, telemetry, and fallback.
 */
export class StandardDecisionEngine implements DecisionEngine {
	private readonly _engine: DecisionEngine;
	private readonly _telemetry: DecisionTelemetry;
	private readonly _mode: DecisionMode;

	constructor(config: DecisionEngineConfig = {}) {
		this._mode = config.mode || "shadow";
		this._telemetry = config.telemetry || new DecisionTelemetry();

		const baseEngine: DecisionEngine =
			this._mode === "off" ? new DeterministicDecisionEngine() : new JevDecisionEngine(config.jevOptions);

		if (config.enableCache !== false) {
			this._engine = new CachedDecisionEngine(baseEngine, new DecisionCache(config.cacheTtlMs ?? 60_000));
		} else {
			this._engine = baseEngine;
		}
	}

	get mode(): DecisionMode {
		return this._mode;
	}

	get telemetry(): DecisionTelemetry {
		return this._telemetry;
	}

	async decide<Q extends DecisionQuestionsMap>(
		state: DecisionState,
		questions: Q,
		options?: DecisionOptions,
	): Promise<DecisionResult<Q>> {
		const result = await this._engine.decide(state, questions, options);
		this._telemetry.record("multi_question", result);
		return result;
	}
}
