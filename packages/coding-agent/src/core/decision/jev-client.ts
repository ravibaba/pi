import { choice as sdkChoice, noul as sdkNoul, score as sdkScore, TypeSafeClient } from "@typesafe-ai/sdk";
import { hashDecisionState, serializeDecisionStateForJev } from "./decision-state.ts";
import type {
	DecisionAnswersMap,
	DecisionOptions,
	DecisionQuestionsMap,
	DecisionResult,
	DecisionState,
} from "./decision-types.ts";

export interface JevClientOptions {
	apiKey?: string;
	baseURL?: string;
	defaultModel?: string;
	timeoutMs?: number;
	maxRetries?: number;
	fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

const COST_PER_INPUT_TOKEN = 0.000000042; // $0.042 per 1M input tokens

/**
 * Concrete client adapter integrating TypeSafe AI's Jev System-1 SDK.
 */
export class JevClient {
	private readonly _client: TypeSafeClient;
	private readonly _defaultModel: string;
	private readonly _defaultTimeoutMs: number;
	private readonly _defaultMaxRetries: number;

	constructor(options: JevClientOptions = {}) {
		const apiKey = options.apiKey || process.env.TYPESAFE_API_KEY || "mock-api-key";
		this._defaultModel = options.defaultModel || process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest";
		this._defaultTimeoutMs = options.timeoutMs ?? 1500;
		this._defaultMaxRetries = options.maxRetries ?? 1;

		this._client = new TypeSafeClient({
			apiKey,
			baseURL: options.baseURL || process.env.TYPESAFE_BASE_URL,
			defaultModel: this._defaultModel,
			timeout: this._defaultTimeoutMs,
			retry: {
				maxRetries: this._defaultMaxRetries,
			},
			fetch: options.fetch,
		});
	}

	/**
	 * Submits state and bundled questions to Jev in a single parallel evaluation.
	 */
	async evaluate<Q extends DecisionQuestionsMap>(
		state: DecisionState,
		questions: Q,
		options?: DecisionOptions,
	): Promise<DecisionResult<Q>> {
		const startTime = Date.now();
		const stateText = serializeDecisionStateForJev(state);
		const stateHash = hashDecisionState(state);

		// Transform Pi question definitions to TypeSafe SDK primitives
		const sdkQuestions: Record<string, unknown> = {};
		for (const [name, def] of Object.entries(questions)) {
			if (def.type === "noul") {
				sdkQuestions[name] = sdkNoul(def.instructions, def.criteria);
			} else if (def.type === "choice") {
				sdkQuestions[name] = sdkChoice(def.instructions, def.criteria);
			} else if (def.type === "score") {
				sdkQuestions[name] = sdkScore(def.instructions, def.criteria);
			}
		}

		const timeout = options?.timeoutMs ?? this._defaultTimeoutMs;
		const maxRetries = options?.maxRetries ?? this._defaultMaxRetries;

		const responsePromise = this._client.systemOne(
			{
				state: stateText,
				questions: sdkQuestions as any,
				model: this._defaultModel,
			},
			{
				signal: options?.signal,
				timeout,
				retry: { maxRetries },
			},
		);

		const { data, requestId } = await responsePromise.withResponse();
		const latencyMs = Date.now() - startTime;

		const answers: Record<string, unknown> = {};
		let totalConfidence = 0;
		let count = 0;

		for (const [key, res] of Object.entries(data.answers)) {
			answers[key] = res;
			if (typeof (res as any).confidence === "number") {
				totalConfidence += (res as any).confidence;
				count += 1;
			} else if ((res as any).type === "noul" && typeof (res as any).noul === "number") {
				// For noul, certainty is distance from 0.5 mapped to [0, 1]
				const noulCertainty = Math.abs((res as any).noul - 0.5) * 2;
				totalConfidence += noulCertainty;
				count += 1;
			}
		}

		const averageConfidence = count > 0 ? totalConfidence / count : 1.0;
		const inputTokens = data.usage?.input_tokens ?? Math.ceil(stateText.length / 4);
		const costUsd = inputTokens * COST_PER_INPUT_TOKEN;

		return {
			answers: answers as DecisionAnswersMap<Q>,
			confidence: averageConfidence,
			latencyMs,
			inputTokens,
			costUsd,
			model: data.model || this._defaultModel,
			requestId: requestId ?? undefined,
			fallback: false,
			stateHash,
		};
	}
}
