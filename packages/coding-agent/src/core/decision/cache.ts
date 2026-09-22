import { hashDecisionState } from "./decision-state.ts";
import type { DecisionQuestionsMap, DecisionResult, DecisionState } from "./decision-types.ts";

interface CacheEntry {
	readonly result: DecisionResult<any>;
	readonly expiresAt: number;
}

export class DecisionCache {
	private readonly _entries: Map<string, CacheEntry>;
	private readonly _defaultTtlMs: number;

	constructor(defaultTtlMs = 60_000) {
		this._entries = new Map();
		this._defaultTtlMs = defaultTtlMs;
	}

	private _computeKey<Q extends DecisionQuestionsMap>(state: DecisionState, questions: Q): string {
		const stateHash = hashDecisionState(state);
		const questionKeys = Object.keys(questions).sort().join(",");
		return `${stateHash}:${questionKeys}`;
	}

	get<Q extends DecisionQuestionsMap>(state: DecisionState, questions: Q): DecisionResult<Q> | undefined {
		const key = this._computeKey(state, questions);
		const entry = this._entries.get(key);
		if (!entry) return undefined;

		if (Date.now() > entry.expiresAt) {
			this._entries.delete(key);
			return undefined;
		}

		return entry.result as DecisionResult<Q>;
	}

	set<Q extends DecisionQuestionsMap>(
		state: DecisionState,
		questions: Q,
		result: DecisionResult<Q>,
		ttlMs?: number,
	): void {
		// Do not cache fallbacks
		if (result.fallback) return;

		const key = this._computeKey(state, questions);
		const expiresAt = Date.now() + (ttlMs ?? this._defaultTtlMs);
		this._entries.set(key, { result, expiresAt });
	}

	clear(): void {
		this._entries.clear();
	}

	get size(): number {
		return this._entries.size;
	}
}
