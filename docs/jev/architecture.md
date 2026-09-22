# Pi-Jev System-1 Architecture Specification

## 1. System Overview

Pi's architecture integrates TypeSafe AI's Jev as a native **System-1 decision layer** embedded directly within `packages/coding-agent`.

```text
                    ┌────────────────────────┐
                    │      User Intent       │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │  DecisionState Engine  │
                    │   & State Transition   │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │ Jev Fast Decision      │
                    │   (Sub-100ms Noul/     │
                    │    Choice/Score)       │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │ Deterministic Policy   │
                    │   (Hard Safety Gate)   │
                    └───────────┬────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
     ┌──────────────────────┐        ┌──────────────────────┐
     │  Authorized Tool     │        │  System-2 LLM Turn   │
     │  Execution / Action  │        │  (Reasoning / Code)  │
     └──────────────────────┘        └──────────────────────┘
```

## 2. Core Separation of Responsibilities

| Responsibility Area | Handled By | Rationale |
|:--------------------|:-----------|:----------|
| **Generative Reasoning & Code Synthesis** | System-2 LLM (Anthropic, OpenAI, etc.) | High context window, creative generation, code output |
| **Micro-Decisions & Probability Estimation** | System-1 Jev (`noul`, `choice`, `score`) | Ultra-fast (<100ms), deterministic pricing ($0.0001), calibrated probabilities |
| **Budgets, Tool Execution & Hard Safety** | Deterministic TypeScript Policy | Hard safety guarantees, credential protections, zero hallucinated side effects |

## 3. Subsystem Components (`packages/coding-agent/src/core/decision/`)

1. **`decision-state.ts`**:
   Maintains a living, structured semantic state across turns (`task`, `repository`, `execution`, `context`, `model`, `verification`). State hashing prevents duplicate evaluations.
2. **`state-transition.ts`**:
   Intelligence budget gate enforcing: *One Jev call per meaningful state transition, NOT per event*.
3. **`question-registry.ts`**:
   Versioned, multi-question bundles evaluated in single parallel requests (`TASK_ROUTING_V1`, `TOOL_RISK_V1`, `STRATEGY_SUPERVISOR_V1`, `COMPLETION_VERIFICATION_V1`, `COMPACTION_ADVISOR_V1`).
4. **`jev-client.ts`**:
   Official `@typesafe-ai/sdk` adapter providing timeout management, exponential backoff, request tracing, and offline testability.
5. **`decision-policy.ts`**:
   Deterministic policy engine governing authorization (`allow`, `ask_user`, `block`), tier routing, and steering interventions.
6. **`thresholds.ts`**:
   Configurable safety and confidence thresholds.
7. **`model-router.ts`**:
   Dynamic mapper from semantic compute tiers (`fast`, `standard`, `reasoning`, `deep`) to resolved models.
8. **`strategy-controller.ts`**:
   Supervisor synthesizing actionable steering directives to break loops and resolve stalls.
9. **`semantic-compaction.ts`**:
   Preserves living semantic state across context summarization boundaries.
10. **`cache.ts` & `fallbacks.ts`**:
    State-hash caching and fail-closed safety fallbacks.
11. **`telemetry.ts`**:
    Closed-loop outcome logging for ongoing calibration.

## 4. Operational Modes

- **`off`**: Decision subsystem completely bypassed; vanilla Pi behavior.
- **`shadow`**: (Default when `TYPESAFE_API_KEY` is present) Decisions are evaluated, telemetry and state are tracked, but deterministic policies do not block tools or alter models.
- **`enforced`**: Full policy authority. High-risk actions are blocked or gated, models are dynamically routed, and stalls inject steering messages.
