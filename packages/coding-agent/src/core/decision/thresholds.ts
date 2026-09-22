/**
 * Configurable thresholds for Pi's System-1 decision policies
 */

export interface JevThresholds {
	/** Minimum confidence to use Jev model routing decision (below this falls back to default) */
	readonly routingConfidence: number;

	/** Threshold above which credential access risk requires approval or blocks */
	readonly credentialAccessRisk: number;

	/** Threshold above which destructive tool actions require approval */
	readonly destructiveRisk: number;

	/** Threshold above which network exfiltration risk requires approval */
	readonly networkExfiltrationRisk: number;

	/** Scope violation score (0-4) at or above which approval is required */
	readonly scopeViolationScore: number;

	/** Composite risk score (0-5) at or above which tool execution is blocked */
	readonly toolBlockRiskScore: number;

	/** Threshold above which strategy is judged stalled and triggers steering */
	readonly stallProbability: number;

	/** Number of repeated identical failures before mandatory stall check */
	readonly consecutiveFailuresTrigger: number;

	/** Number of edits to the same file before triggering oscillation warning */
	readonly oscillationTrigger: number;

	/** Threshold above which completion verification passes */
	readonly completionConfidence: number;

	/** Threshold above which model escalation triggers mid-task */
	readonly modelEscalationProbability: number;
}

export const DEFAULT_THRESHOLDS: JevThresholds = {
	routingConfidence: 0.85,
	credentialAccessRisk: 0.2,
	destructiveRisk: 0.75,
	networkExfiltrationRisk: 0.6,
	scopeViolationScore: 3,
	toolBlockRiskScore: 4.0,
	stallProbability: 0.75,
	consecutiveFailuresTrigger: 2,
	oscillationTrigger: 3,
	completionConfidence: 0.9,
	modelEscalationProbability: 0.8,
};
