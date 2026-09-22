import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../src/core/decision/model-router.ts";

describe("model-router", () => {
	const mockModels: Model<Api>[] = [
		{
			id: "gemini-2.5-flash",
			name: "Gemini 2.5 Flash",
			provider: "google",
			api: "google-generative-ai",
			contextWindow: 1_000_000,
			maxOutputTokens: 8192,
		} as unknown as Model<Api>,
		{
			id: "claude-3-5-sonnet-latest",
			name: "Claude 3.5 Sonnet",
			provider: "anthropic",
			api: "anthropic-messages",
			contextWindow: 200_000,
			maxOutputTokens: 8192,
		} as unknown as Model<Api>,
		{
			id: "o3-mini",
			name: "o3-mini (Reasoning)",
			provider: "openai",
			api: "openai-responses",
			contextWindow: 200_000,
			maxOutputTokens: 100_000,
		} as unknown as Model<Api>,
	];

	const defaultModel = mockModels[1];

	it("should map fast tier to flash/mini model", () => {
		const router = new ModelRouter({}, mockModels, defaultModel);
		const model = router.resolveModelForTier("fast");
		expect(model?.id).toBe("gemini-2.5-flash");
	});

	it("should map standard tier to default model", () => {
		const router = new ModelRouter({}, mockModels, defaultModel);
		const model = router.resolveModelForTier("standard");
		expect(model?.id).toBe("claude-3-5-sonnet-latest");
	});

	it("should map reasoning tier to reasoning model", () => {
		const router = new ModelRouter({}, mockModels, defaultModel);
		const model = router.resolveModelForTier("reasoning");
		expect(model?.id).toBe("o3-mini");
	});

	it("should prioritize explicitly configured tiers", () => {
		const router = new ModelRouter(
			{
				fast: "claude-3-5-sonnet-latest",
			},
			mockModels,
			defaultModel,
		);

		const model = router.resolveModelForTier("fast");
		expect(model?.id).toBe("claude-3-5-sonnet-latest");
	});

	it("should resolve models by provider/model or provider:model reference", () => {
		const openRouterModel = {
			id: "anthropic/claude-3.5-sonnet",
			name: "Anthropic: Claude 3.5 Sonnet",
			provider: "openrouter",
			api: "openai-completions",
			contextWindow: 200_000,
			maxOutputTokens: 8192,
		} as unknown as Model<Api>;

		const routerSlash = new ModelRouter(
			{ standard: "openrouter/anthropic/claude-3.5-sonnet" },
			[...mockModels, openRouterModel],
			defaultModel,
		);
		expect(routerSlash.resolveModelForTier("standard")?.id).toBe("anthropic/claude-3.5-sonnet");

		const routerColon = new ModelRouter(
			{ standard: "openrouter:anthropic/claude-3.5-sonnet" },
			[...mockModels, openRouterModel],
			defaultModel,
		);
		expect(routerColon.resolveModelForTier("standard")?.id).toBe("anthropic/claude-3.5-sonnet");
	});

	it("should compute correct escalated tiers", () => {
		expect(ModelRouter.getEscalatedTier("fast")).toBe("standard");
		expect(ModelRouter.getEscalatedTier("standard")).toBe("reasoning");
		expect(ModelRouter.getEscalatedTier("reasoning")).toBe("deep");
		expect(ModelRouter.getEscalatedTier("deep")).toBe("deep");
	});
});
