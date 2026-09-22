# Architectural Decision Records (ADRs)

## ADR-001: First-Class Subsystem vs Extension / Plugin

### Context
Pi supports user and core extensions. We needed to decide whether Jev should be packaged as an extension (`pi-jev++`) or integrated as an internal runtime primitive inside `packages/coding-agent`.

### Decision
Integrate Jev as a first-class subsystem inside `packages/coding-agent/src/core/decision/`.

### Rationale
An extension is an observer/hook on top of the agent loop; it cannot natively own the agent's internal `DecisionState`, control auto-compaction preamble preservation, or replace model tier selection before session prompts are issued. First-class integration enables true System-1 / System-2 co-design.

---

## ADR-002: Bounded Text Serialization vs Raw Transcript Forwarding

### Context
Jev decisions require context. Sending raw conversation transcripts to Jev would result in massive token consumption, high network latency, and context bloat.

### Decision
Extract and serialize a concise living representation via `serializeDecisionStateForJev(state)`.

### Rationale
Bounded serialization keeps Jev payload size under 150 tokens (~1KB), keeping evaluation latency sub-100ms and per-call costs at ~$0.0001.

---

## ADR-003: Deterministic Policy Authority & Fail-Closed Fallback

### Context
Micro-models can hallucinate or fail if network outages occur.

### Decision
1. Jev only outputs calibrated probabilities (`noul`), categorical distributions (`choice`), and ordinal scores (`score`).
2. Deterministic code in `DecisionPolicy` holds absolute authority over authorization, budgets, and side effects.
3. On timeouts or network errors, high-risk questions fail closed (block or require approval), while routine questions fall back to safe default behaviors.

---

## ADR-004: Multi-Question Bundling per State Transition

### Context
Making separate HTTP calls for every individual question causes request waterfalls.

### Decision
Group related questions into versioned bundles (`TASK_ROUTING_V1`, `TOOL_RISK_V1`, `STRATEGY_SUPERVISOR_V1`, `COMPLETION_VERIFICATION_V1`) evaluated in a single API call per meaningful state transition.

### Rationale
Eliminates latency overhead and minimizes API usage while providing a coherent multi-dimensional evaluation of each state change.
