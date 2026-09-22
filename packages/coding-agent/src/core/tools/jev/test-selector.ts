import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { DecisionEngine, DecisionState } from "../../decision/decision-types.ts";
import { TEST_SELECTION_V1 } from "../../decision/question-registry.ts";

const testSelectSchema = Type.Object({
	filterPattern: Type.Optional(
		Type.String({
			description: "Optional filename pattern to narrow down test candidates (e.g., 'session' or 'decision').",
		}),
	),
});

export type TestSelectToolInput = Static<typeof testSelectSchema>;

export const jevTestSelectPromptContribution = {
	snippet: "Intelligently select the minimal sufficient subset of tests to run based on modified files",
	guidelines: [
		"Use jev_test_select to identify which tests to run after editing code instead of running the entire repository test suite.",
	],
} as const;

export function createJevTestSelectTool(
	cwd: string,
	getState: () => DecisionState | undefined,
	getEngine: () => DecisionEngine,
): AgentTool<typeof testSelectSchema> {
	return {
		name: "jev_test_select",
		label: "Jev Intelligent Test Selector",
		description:
			"Analyzes modified files and workspace structure to prioritize and select the minimal sufficient subset of unit/integration tests to run.",
		parameters: testSelectSchema,
		execute: async (_toolCallId, { filterPattern }) => {
			const state = getState();
			const engine = getEngine();

			let modifiedFiles = state?.execution.filesChanged ?? [];
			if (modifiedFiles.length === 0) {
				try {
					const statusOut = execSync("git status --porcelain", { cwd, encoding: "utf-8" });
					modifiedFiles = statusOut
						.split("\n")
						.filter(Boolean)
						.map((line) => line.slice(3).trim());
				} catch {
					modifiedFiles = [];
				}
			}

			// Discover candidate test files
			let candidateTests: string[] = [];
			try {
				const lsOut = execSync('git ls-files "*test*" "*spec*"', { cwd, encoding: "utf-8" });
				candidateTests = lsOut
					.split("\n")
					.filter(Boolean)
					.filter((p) => p.endsWith(".ts") || p.endsWith(".js") || p.endsWith(".tsx") || p.endsWith(".jsx"));
			} catch {
				candidateTests = [];
			}

			if (filterPattern) {
				candidateTests = candidateTests.filter((t) => t.toLowerCase().includes(filterPattern.toLowerCase()));
			}

			// Match candidates against modified files
			const prioritizedTests: string[] = [];
			for (const mod of modifiedFiles) {
				const nameWithoutExt = basename(mod).replace(/\.[^/.]+$/, "");
				const modDir = dirname(mod);

				for (const test of candidateTests) {
					if (
						test.includes(nameWithoutExt) ||
						test.includes(modDir) ||
						test.toLowerCase().includes(nameWithoutExt.toLowerCase())
					) {
						if (!prioritizedTests.includes(test)) {
							prioritizedTests.push(test);
						}
					}
				}
			}

			// If no direct matches found, include closest matching tests or top 3 candidates
			if (prioritizedTests.length === 0 && candidateTests.length > 0) {
				prioritizedTests.push(...candidateTests.slice(0, 5));
			}

			let priority = "unit";
			let riskOfUnrun = 0.2;

			if (state) {
				try {
					const result = await engine.decide(state, TEST_SELECTION_V1);
					priority = result.answers.selectionPriority?.choice ?? "unit";
					riskOfUnrun = Number(result.answers.riskOfUnrunFailures?.noul ?? 0.2);
				} catch {
					// Fallback to heuristic
				}
			}

			const isFullSuiteAdvised = priority === "full_suite" || riskOfUnrun > 0.7;

			let commandHint = "";
			if (existsSync(join(cwd, "package.json"))) {
				if (prioritizedTests.length > 0) {
					commandHint = `npx vitest run ${prioritizedTests.slice(0, 3).join(" ")}`;
				} else {
					commandHint = "./test.sh";
				}
			}

			const output = `### Jev Intelligent Test Selection

- **Selection Category:** \`${priority}\`
- **Risk of Unrun Failures:** ${(riskOfUnrun * 100).toFixed(0)}% (${isFullSuiteAdvised ? "Broad suite advised" : "Isolated tests sufficient"})
- **Modified Files:** ${modifiedFiles.length > 0 ? modifiedFiles.join(", ") : "(none detected)"}

#### Prioritized Tests to Run:
${
	prioritizedTests.length > 0
		? prioritizedTests.map((t, i) => `${i + 1}. \`${t}\``).join("\n")
		: "- No direct test matches found. Recommend writing a new unit test for modified paths."
}

#### Suggested Command:
\`\`\`bash
${commandHint || "./test.sh"}
\`\`\``;

			return {
				content: [{ type: "text", text: output }],
				details: {
					priority,
					riskOfUnrun,
					prioritizedTests,
					modifiedFiles,
				},
			};
		},
	};
}
