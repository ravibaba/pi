# Jev Question Bundles Registry

This document records the official, versioned System-1 question bundles registered in [question-registry.ts](file:///Users/ravi/Desktop/PI-JEV/pi/packages/coding-agent/src/core/decision/question-registry.ts).

## 1. Task Routing Bundle (`TASK_ROUTING_V1`)

Evaluates task complexity, capability requirements, security sensitivity, and recommended model tier in a single parallel Jev call.

```ts
export const TASK_ROUTING_V1 = {
  modelTier: choice("What compute/reasoning tier is most appropriate for this coding task?", {
    fast: "Trivial edits, single-file typo fixes, documentation updates, mechanical changes",
    standard: "Standard feature implementation, straightforward bug fixes, unit test writing",
    reasoning: "Complex debugging, distributed concurrency, deep multi-file architectural refactors",
    deep: "Extreme complexity, formal verification, full subsystem migration or security auditing",
  }),
  complexity: score("Rate the technical difficulty and scope of the requested coding task:", [
    "Trivial (single-line or syntax fix)",
    "Simple (single function or file update)",
    "Moderate (multi-file feature or clear bug fix)",
    "Complex (subsystem refactor or subtle bug)",
    "Architectural (cross-repo architectural overhaul)",
  ]),
  securitySensitive: noul(
    "Does this task involve credentials, secrets, auth tokens, permission changes, or sensitive network security?",
  ),
  needsRepoSearch: noul(
    "Does completing this task require exploring unknown codebase architecture or broad symbol searches?",
  ),
  likelyLongHorizon: noul("Is this task likely to require more than 5 tool turns or extensive iterative debugging?"),
};
```

---

## 2. Tool Risk Preflight Bundle (`TOOL_RISK_V1`)

Evaluates the semantic danger of a proposed command or file mutation before execution.

```ts
export const TOOL_RISK_V1 = {
  destructive: noul(
    "Would executing this tool action delete, overwrite, or destroy code, git history, or workspace state irreversibly?",
  ),
  credentialAccess: noul(
    "Does this tool action attempt to read, display, export, or transmit credentials, private keys, or API tokens?",
  ),
  networkExfiltration: noul(
    "Does this command attempt to send local files, environmental secrets, or repository data to an external network host?",
  ),
  productionImpact: noul(
    "Does this command appear targeted at a live production server, database, or deployed cloud infrastructure?",
  ),
  scopeViolation: score("Rate whether this tool action operates outside the expected scope of the user's task:", [
    "None (strictly within target task scope)",
    "Minor (touches closely related workspace utilities)",
    "Moderate (modifies files unrelated to the user's request)",
    "Severe (operates globally on system directories or root paths)",
  ]),
};
```

---

## 3. Strategy & Stall Supervisor Bundle (`STRATEGY_SUPERVISOR_V1`)

Evaluates execution health, identifies unproductive loops, and selects strategic interventions.

```ts
export const STRATEGY_SUPERVISOR_V1 = {
  strategyAction: choice("What strategic action should the agent runtime take next?", {
    continue: "The agent is making steady, meaningful progress toward the objective",
    retry: "The previous failure was actionable and a surgical retry is justified",
    change_strategy: "The current approach has stalled or failed repeatedly; step back and rethink approach",
    ask_user: "The task is ambiguous, blocked by missing information, or requires human authorization",
  }),
  isProgressing: noul("Is the agent actively converging toward a successful task resolution?"),
  isStalled: noul("Is the agent stuck in a repetitive, unproductive loop or encountering unresolvable errors?"),
};
```

---

## 4. Completion Verification Bundle (`COMPLETION_VERIFICATION_V1`)

Formally evaluates whether task goals, tests, and criteria have been satisfied.

```ts
export const COMPLETION_VERIFICATION_V1 = {
  goalSatisfied: noul("Has the core request specified in the user's initial prompt been completely implemented?"),
  verificationSufficient: noul(
    "Have tests, lints, or other programmatic verifications passed to confirm the implementation works?",
  ),
  remainingBlockers: noul("Are there any remaining compiler errors, failed assertions, or unresolved requirements?"),
};
```

---

## 5. Compaction Advisor Bundle (`COMPACTION_ADVISOR_V1`)

Recommends semantic retention priorities when transcript summarization is necessary.

```ts
export const COMPACTION_ADVISOR_V1 = {
  urgency: choice("How urgently does this session transcript require compaction?", {
    routine: "Token count is moderate; compaction is standard housekeeping",
    urgent: "Context window is nearly exhausted; aggressive pruning required",
  }),
  retainToolOutputs: noul("Are previous tool outputs essential context that must be retained in summarized state?"),
  hasCriticalDecisions: noul("Does the transcript contain architectural decisions that must be explicitly summarized?"),
};
```
