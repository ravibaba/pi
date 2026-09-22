import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelTier } from "./decision-types.ts";

export interface ModelTierConfig {
	fast?: string;
	standard?: string;
	reasoning?: string;
	deep?: string;
}

/**
 * Maps decision model tiers (fast, standard, reasoning, deep) to configured Pi models
 * without hardcoding proprietary vendor names in the decision engine.
 */
export class ModelRouter {
	private readonly _configuredTiers: ModelTierConfig;
	private readonly _availableModels: Model<Api>[];
	private readonly _defaultModel?: Model<Api>;

	constructor(configuredTiers: ModelTierConfig = {}, availableModels: Model<Api>[] = [], defaultModel?: Model<Api>) {
		this._configuredTiers = configuredTiers;
		this._availableModels = availableModels;
		this._defaultModel = defaultModel;
	}

	/**
	 * Resolves a model tier to a concrete Pi Model object.
	 */
	resolveModelForTier(tier: ModelTier): Model<Api> | undefined {
		const targetReference = this._configuredTiers[tier];
		if (targetReference) {
			const matched = this._findModel(targetReference);
			if (matched) return matched;
		}

		// Fallback heuristics if specific tier is not explicitly configured
		if (tier === "standard" || !this._availableModels.length) {
			return this._defaultModel;
		}

		if (tier === "fast") {
			// Find a lightweight/flash/mini model
			const fastMatch = this._availableModels.find(
				(m) =>
					m.id.toLowerCase().includes("flash") ||
					m.id.toLowerCase().includes("mini") ||
					m.id.toLowerCase().includes("haiku"),
			);
			return fastMatch || this._defaultModel;
		}

		if (tier === "reasoning" || tier === "deep") {
			// Find a reasoning or thinking model
			const reasoningMatch = this._availableModels.find(
				(m) =>
					m.id.toLowerCase().includes("reason") ||
					m.id.toLowerCase().includes("opus") ||
					m.id.toLowerCase().includes("o3") ||
					m.id.toLowerCase().includes("o1"),
			);
			return reasoningMatch || this._defaultModel;
		}

		return this._defaultModel;
	}

	private _findModel(reference: string): Model<Api> | undefined {
		const ref = reference.toLowerCase().trim();
		const refNormalized = ref.replace(":", "/");
		return this._availableModels.find((m) => {
			const fullSlash = `${m.provider}/${m.id}`.toLowerCase();
			const fullColon = `${m.provider}:${m.id}`.toLowerCase();
			return (
				fullSlash === ref ||
				fullColon === ref ||
				fullSlash === refNormalized ||
				m.id.toLowerCase() === ref ||
				m.name?.toLowerCase() === ref
			);
		});
	}

	/**
	 * Returns the next escalated model tier.
	 */
	static getEscalatedTier(current: ModelTier): ModelTier {
		switch (current) {
			case "fast":
				return "standard";
			case "standard":
				return "reasoning";
			case "reasoning":
			case "deep":
				return "deep";
		}
	}
}
