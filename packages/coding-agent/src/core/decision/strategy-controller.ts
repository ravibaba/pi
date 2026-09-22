import type { DecisionState, StrategyAction } from "./decision-types.ts";

export interface StrategyDirective {
	readonly action: StrategyAction;
	readonly shouldInjectSteering: boolean;
	readonly steeringMessage?: string;
	readonly shouldEscalateModel: boolean;
}

/**
 * Superintends progress, loops, and strategic course-corrections.
 */
export class StrategyController {
	/**
	 * Determines concrete runtime action and steering instructions when stall or loop is detected.
	 */
	createDirective(action: StrategyAction, state: DecisionState): StrategyDirective {
		switch (action) {
			case "continue":
				return {
					action: "continue",
					shouldInjectSteering: false,
					shouldEscalateModel: false,
				};

			case "retry":
				return {
					action: "retry",
					shouldInjectSteering: true,
					steeringMessage: `Previous attempt encountered an error: "${state.execution.lastErrorFingerprint || "unknown"}". Adjust parameters and retry.`,
					shouldEscalateModel: false,
				};

			case "change_strategy": {
				const reasonDetails: string[] = [];
				if (state.execution.consecutiveFailures >= 2) {
					reasonDetails.push(`${state.execution.consecutiveFailures} consecutive failures`);
				}
				if (state.execution.oscillationCount >= 3) {
					reasonDetails.push(`oscillating edits across ${state.execution.filesChanged.join(", ")}`);
				}

				const message = `[System-1 Supervisor]: The current execution strategy appears stalled (${reasonDetails.join(", ") || "no progress"}). Step back, re-inspect architecture or error traces, and adopt a different approach before editing again.`;

				return {
					action: "change_strategy",
					shouldInjectSteering: true,
					steeringMessage: message,
					shouldEscalateModel: state.execution.consecutiveFailures >= 3,
				};
			}

			case "escalate_model":
				return {
					action: "escalate_model",
					shouldInjectSteering: true,
					steeringMessage: `[System-1 Supervisor]: High task complexity or architectural difficulty detected. Escalating reasoning capacity to assist problem resolution.`,
					shouldEscalateModel: true,
				};

			case "stop_and_verify":
				return {
					action: "stop_and_verify",
					shouldInjectSteering: true,
					steeringMessage: `[System-1 Supervisor]: Core modifications appear in place. Run tests or verify against acceptance criteria before concluding.`,
					shouldEscalateModel: false,
				};
		}
	}
}
