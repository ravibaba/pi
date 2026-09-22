import { randomUUID } from "node:crypto";
import type { DecisionResult } from "./decision-types.ts";

export interface DecisionOutcome {
	resolvedOnNextTurn?: boolean;
	testsPassed?: boolean;
	retriesAvoided?: number;
	tokensSaved?: number;
	escalated?: boolean;
	userOverride?: boolean;
}

export interface DecisionRecord {
	readonly decisionId: string;
	readonly decisionType: string;
	readonly timestamp: number;
	readonly stateHash: string;
	readonly confidence: number;
	readonly latencyMs: number;
	readonly inputTokens: number;
	readonly costUsd: number;
	readonly fallback: boolean;
	readonly fallbackReason?: string;
	readonly prediction: Record<string, unknown>;
	outcome?: DecisionOutcome;
}

export interface DecisionTelemetryMetrics {
	totalDecisions: number;
	fallbackCount: number;
	averageLatencyMs: number;
	totalInputTokens: number;
	totalCostUsd: number;
	averageConfidence: number;
	estimatedTokensSaved: number;
}

export class DecisionTelemetry {
	private readonly _records: Map<string, DecisionRecord>;
	private readonly _maxRecords: number;

	constructor(maxRecords = 500) {
		this._records = new Map();
		this._maxRecords = maxRecords;
	}

	record<Q extends Record<string, any>>(decisionType: string, result: DecisionResult<Q>): string {
		const decisionId = randomUUID();
		const simplifiedAnswers: Record<string, unknown> = {};

		for (const [k, v] of Object.entries(result.answers)) {
			if (v.type === "choice") {
				simplifiedAnswers[k] = v.choice;
			} else if (v.type === "noul") {
				simplifiedAnswers[k] = v.noul;
			} else if (v.type === "score") {
				simplifiedAnswers[k] = v.score;
			}
		}

		const record: DecisionRecord = {
			decisionId,
			decisionType,
			timestamp: Date.now(),
			stateHash: result.stateHash,
			confidence: result.confidence,
			latencyMs: result.latencyMs,
			inputTokens: result.inputTokens,
			costUsd: result.costUsd,
			fallback: result.fallback,
			fallbackReason: result.fallbackReason,
			prediction: simplifiedAnswers,
		};

		if (this._records.size >= this._maxRecords) {
			const firstKey = this._records.keys().next().value;
			if (firstKey) this._records.delete(firstKey);
		}

		this._records.set(decisionId, record);
		return decisionId;
	}

	recordOutcome(decisionId: string, outcome: DecisionOutcome): void {
		const record = this._records.get(decisionId);
		if (record) {
			record.outcome = {
				...record.outcome,
				...outcome,
			};
		}
	}

	getRecord(decisionId: string): DecisionRecord | undefined {
		return this._records.get(decisionId);
	}

	getRecords(): DecisionRecord[] {
		return Array.from(this._records.values());
	}

	getMetrics(): DecisionTelemetryMetrics {
		let totalLatency = 0;
		let totalTokens = 0;
		let totalCost = 0;
		let totalConfidence = 0;
		let fallbacks = 0;
		let tokensSaved = 0;

		const records = Array.from(this._records.values());
		for (const rec of records) {
			totalLatency += rec.latencyMs;
			totalTokens += rec.inputTokens;
			totalCost += rec.costUsd;
			totalConfidence += rec.confidence;
			if (rec.fallback) fallbacks += 1;
			if (rec.outcome?.tokensSaved) tokensSaved += rec.outcome.tokensSaved;
		}

		const count = records.length;
		return {
			totalDecisions: count,
			fallbackCount: fallbacks,
			averageLatencyMs: count > 0 ? Math.round(totalLatency / count) : 0,
			totalInputTokens: totalTokens,
			totalCostUsd: totalCost,
			averageConfidence: count > 0 ? totalConfidence / count : 1.0,
			estimatedTokensSaved: tokensSaved,
		};
	}

	clear(): void {
		this._records.clear();
	}
}
