import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
	collectJevDiagnostics,
	collectSettingsDiagnostics,
	deduplicateDiagnostics,
} from "../src/core/settings-diagnostics.ts";
import { SettingsManager, type SettingsStorage } from "../src/core/settings-manager.ts";

describe("settings diagnostics", () => {
	it("includes the settings file path for file-backed storage", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "pi-settings-diagnostics-"));
		const agentDir = join(tempDir, "agent");
		const settingsPath = join(agentDir, "settings.json");
		mkdirSync(agentDir);
		writeFileSync(settingsPath, "{");

		try {
			const diagnostics = collectSettingsDiagnostics(SettingsManager.create(tempDir, agentDir));

			expect(diagnostics).toHaveLength(1);
			expect(diagnostics[0]?.type).toBe("warning");
			expect(diagnostics[0]?.message).toContain(`Invalid settings file ${settingsPath}:`);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("falls back to the settings scope for storage without file paths", () => {
		const storage: SettingsStorage = {
			withLock(scope, fn) {
				if (scope === "global") throw new Error("backend failed");
				fn(undefined);
			},
		};
		const diagnostics = collectSettingsDiagnostics(SettingsManager.fromStorage(storage));

		expect(diagnostics).toEqual([{ type: "warning", message: "Invalid global settings: backend failed" }]);
	});

	it("deduplicates diagnostics by type and message", () => {
		const warning = { type: "warning" as const, message: "Invalid settings file /tmp/settings.json" };

		expect(deduplicateDiagnostics([warning, warning, { ...warning, type: "error" }])).toEqual([
			warning,
			{ ...warning, type: "error" },
		]);
	});

	it("warns about unknown jev.thresholds keys and unmatched modelTiers references", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "pi-jev-diagnostics-"));
		const agentDir = join(tempDir, "agent");
		mkdirSync(agentDir);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({
				jev: {
					enabled: true,
					thresholds: {
						routing: { confidenceCutoff: 0.85 },
						routingConfidence: 0.8,
					},
					modelTiers: { fast: "nonexistent/fast-model" },
				},
			}),
		);

		const mockModels = [
			{ id: "glm-5.3-flash", name: "GLM", provider: "z-ai", api: "openai-completions" } as unknown as Model<Api>,
		];

		try {
			const diagnostics = collectJevDiagnostics(SettingsManager.create(tempDir, agentDir), mockModels);

			expect(diagnostics).toHaveLength(2);
			expect(diagnostics.some((d) => d.message.includes('Unknown jev.thresholds key "routing"'))).toBe(true);
			expect(diagnostics.some((d) => d.message.includes('jev.modelTiers.fast="nonexistent/fast-model"'))).toBe(true);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("produces no jev diagnostics for a valid flat configuration", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "pi-jev-diagnostics-"));
		const agentDir = join(tempDir, "agent");
		mkdirSync(agentDir);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({
				jev: {
					enabled: true,
					thresholds: { routingConfidence: 0.8 },
					modelTiers: { fast: "z-ai/glm-5.3-flash" },
				},
			}),
		);

		const mockModels = [
			{ id: "glm-5.3-flash", name: "GLM", provider: "z-ai", api: "openai-completions" } as unknown as Model<Api>,
		];

		try {
			expect(collectJevDiagnostics(SettingsManager.create(tempDir, agentDir), mockModels)).toEqual([]);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
