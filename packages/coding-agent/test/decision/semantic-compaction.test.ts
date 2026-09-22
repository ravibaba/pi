import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, type ToolResultMessage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
	createInitialDecisionState,
	recordContextConstraint,
	recordContextDecision,
	recordContextFact,
} from "../../src/core/decision/decision-state.ts";
import {
	buildSemanticCompactionPreamble,
	extractContextFromMessages,
	pruneRedundantToolOutputsForCompaction,
} from "../../src/core/decision/semantic-compaction.ts";

describe("semantic-compaction", () => {
	it("builds a rich markdown preamble from DecisionState", () => {
		let state = createInitialDecisionState({
			intent: "Refactor session cache storage",
		});
		state.execution.phase = "implement";
		state.execution.filesChanged = ["src/cache.ts", "test/cache.test.ts"];
		state = recordContextFact(state, "Sqlite WAL mode is enabled");
		state = recordContextDecision(state, "Use in-memory LRU as secondary tier");
		state = recordContextConstraint(state, "Preserve Node 22 ESM compatibility");

		const preamble = buildSemanticCompactionPreamble(state);

		expect(preamble).toContain("### Semantic State (Preserved by Decision Engine)");
		expect(preamble).toContain("- **Goal:** Refactor session cache storage");
		expect(preamble).toContain("- **Current Phase:** implement");
		expect(preamble).toContain("- **Files Modified:** src/cache.ts, test/cache.test.ts");
		expect(preamble).toContain("Sqlite WAL mode is enabled");
		expect(preamble).toContain("Use in-memory LRU as secondary tier");
		expect(preamble).toContain("Preserve Node 22 ESM compatibility");
	});

	it("extracts architectural decisions from assistant messages", () => {
		const state = createInitialDecisionState({ intent: "Setup logging" });
		const messages: AgentMessage[] = [
			{
				role: "user",
				content: [{ type: "text", text: "How should we structure logging?" }],
				timestamp: Date.now(),
			},
			fauxAssistantMessage(
				"After analyzing the requirements, we decided to use structured JSON lines for production logs.",
			),
		];

		const updatedState = extractContextFromMessages(state, messages);
		expect(updatedState.context.decisions).toContain("use structured JSON lines for production logs");
	});

	it("prunes redundant large tool outputs when retainToolOutputs is false", () => {
		const longOutput = "a".repeat(1000);
		const messages: AgentMessage[] = [
			{
				role: "toolResult",
				toolCallId: "tc_1",
				toolName: "bash",
				content: [{ type: "text", text: longOutput }],
				isError: false,
				timestamp: Date.now(),
			},
			{
				role: "toolResult",
				toolCallId: "tc_2",
				toolName: "read",
				content: [{ type: "text", text: "short result" }],
				isError: false,
				timestamp: Date.now(),
			},
		];

		const pruned = pruneRedundantToolOutputsForCompaction(messages, { retainToolOutputs: false });
		const firstResult = pruned[0] as ToolResultMessage;
		const firstResultText =
			typeof firstResult.content === "string"
				? firstResult.content
				: (firstResult.content[0] as { text: string }).text;
		expect(firstResultText).toContain("pruned by System-1 Semantic Compactor");
		expect(firstResultText.length).toBeLessThan(400);

		// Short result should not be altered
		const secondResult = pruned[1] as ToolResultMessage;
		const secondResultText =
			typeof secondResult.content === "string"
				? secondResult.content
				: (secondResult.content[0] as { text: string }).text;
		expect(secondResultText).toBe("short result");
	});

	it("keeps full tool outputs when retainToolOutputs is true", () => {
		const longOutput = "b".repeat(1000);
		const messages: AgentMessage[] = [
			{
				role: "toolResult",
				toolCallId: "tc_1",
				toolName: "bash",
				content: [{ type: "text", text: longOutput }],
				isError: false,
				timestamp: Date.now(),
			},
		];

		const notPruned = pruneRedundantToolOutputsForCompaction(messages, { retainToolOutputs: true });
		const firstResult = notPruned[0] as ToolResultMessage;
		const firstResultText =
			typeof firstResult.content === "string"
				? firstResult.content
				: (firstResult.content[0] as { text: string }).text;
		expect(firstResultText).toBe(longOutput);
	});
});
