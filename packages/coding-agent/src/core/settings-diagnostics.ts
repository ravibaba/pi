import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentSessionRuntimeDiagnostic } from "./agent-session-services.ts";
import { ModelRouter } from "./decision/model-router.ts";
import { DEFAULT_THRESHOLDS } from "./decision/thresholds.ts";
import type { SettingsManager } from "./settings-manager.ts";

export function collectSettingsDiagnostics(settingsManager: SettingsManager): AgentSessionRuntimeDiagnostic[] {
	return settingsManager.drainErrors().map(({ scope, path, error }) => ({
		type: "warning",
		message: path ? `Invalid settings file ${path}: ${error.message}` : `Invalid ${scope} settings: ${error.message}`,
	}));
}

/**
 * Validates the Jev decision subsystem configuration against the loaded model catalog.
 * Flags threshold keys that the flat JevThresholds schema ignores and tier references
 * that match no available model (those tiers silently fall back to the default model).
 */
export function collectJevDiagnostics(
	settingsManager: SettingsManager,
	availableModels: readonly Model<Api>[],
): AgentSessionRuntimeDiagnostic[] {
	const diagnostics: AgentSessionRuntimeDiagnostic[] = [];
	const jevSettings = settingsManager.getJevSettings();

	for (const [key, value] of Object.entries(jevSettings.thresholds)) {
		if (!(key in DEFAULT_THRESHOLDS)) {
			diagnostics.push({
				type: "warning",
				message: `Unknown jev.thresholds key "${key}" is ignored. Expected flat keys such as routingConfidence, destructiveRisk, completionConfidence (got ${typeof value}).`,
			});
		}
	}

	const router = new ModelRouter(jevSettings.modelTiers, [...availableModels]);
	for (const reference of router.unresolvedTierReferences) {
		diagnostics.push({
			type: "warning",
			message: `jev.modelTiers.${reference} does not match any available model; that tier falls back to the default model.`,
		});
	}

	return diagnostics;
}

/**
 * Remove duplicate type/message diagnostics while preserving their first occurrence.
 * Startup and runtime settings managers can report the same file error.
 */
export function deduplicateDiagnostics(
	diagnostics: readonly AgentSessionRuntimeDiagnostic[],
): AgentSessionRuntimeDiagnostic[] {
	const seen = new Set<string>();
	return diagnostics.filter((diagnostic) => {
		const key = `${diagnostic.type}\0${diagnostic.message}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
