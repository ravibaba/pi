# Architecture Discovery: Pi + TypeSafe Jev System-1 Decision Layer

**Target System:** Pi coding-agent harness (`packages/coding-agent`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`)  
**Objective:** Integrate TypeSafe Jev as a first-class System-1 decision layer and semantic control plane.

---

## 1. Existing Pi Architecture

Pi is organized as a modular TypeScript monorepo managed via npm workspaces:

- **`@earendil-works/pi-agent-core` (`packages/agent`)**:
  - `Agent`: Core agent container maintaining state (`systemPrompt`, `model`, `thinkingLevel`, `tools`, `messages`), subscriptions, and public methods (`prompt()`, `continue()`, `steer()`, `followUp()`, `abort()`).
  - `agentLoop` / `agentLoopIter`: Async iteration loop driving turns, dispatching events, invoking LLM providers, and executing tool batches.
  - Hooks: `beforeToolCall`, `afterToolCall`, `prepareRequest`, `finishTurn`, `getSteeringMessages`, `getFollowUpMessages`.
  - Events: `agent_start`, `agent_end`, `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`.
- **`@earendil-works/pi-ai` (`packages/ai`)**:
  - Unified model and provider abstraction (`Model<Api>`, `KnownProvider`, `Api`).
  - Provider catalog, token limits, thinking budgets, and streaming completions (`streamSimpleText`).
- **`@earendil-works/pi-coding-agent` (`packages/coding-agent`)**:
  - `AgentSession`: Central orchestrator tying together `Agent`, session persistence, settings, extensions, prompt templates, tools, and compaction.
  - `SettingsManager`: Reads and validates configuration from `.pi/settings.json`, environment variables, and defaults.
  - `ExtensionRunner`: Dispatches extension lifecycle hooks (`before_agent_start`, `tool_call`, `tool_result`, `session_before_compact`, etc.).
  - `tools/`: Built-in tools: `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`.
  - `compaction/`: Context token calculation and auto-summarization.
- **`@earendil-works/pi-telemetry` (`packages/telemetry`)**:
  - Lightweight tracing framework with `TelemetryContext`, `TelemetrySpan`, attributes, and event logging.

---

## 2. Current Agent Control Flow

1. **User Prompt Ingestion (`AgentSession.prompt()`)**:
   - Extension commands (`/command`) checked and executed if matched.
   - Input handlers run (`_runInputHandlers`).
   - Skill and template expansion (`/skill:name`, `/template`).
   - Model and API key verification.
   - Compaction check (`_checkCompaction`).
   - Extension preflight (`emitBeforeAgentStart`), allowing extensions to adjust tools and system prompt options.
   - Image normalization.
   - User message constructed and passed to `this.agent.prompt(messages)`.

2. **Loop Iteration (`agentLoop`)**:
   - `turn_start` emitted.
   - Pending steering messages processed.
   - `prepareRequest` hook invoked: allows dynamic mutation of `context`, `model`, and `thinkingLevel`.
   - `streamAssistantResponse`: Calls model provider via `ModelRuntime`. Emits `message_start`, `message_update`, `message_end`.
   - If assistant message generates tool calls:
     - Argument validation against tool schema (TypeBox).
     - `beforeToolCall` hook invoked. If `block: true`, execution is prevented and an error result is returned.
     - Tool executed (parallel or sequential).
     - `afterToolCall` hook invoked for result post-processing.
     - `tool_execution_end` and tool result message emitted.
   - `finishTurn` hook invoked with completed turn context.
   - If more tool calls remain, the loop continues to the next turn. If no tool calls remain, follow-up messages are checked; otherwise the run finishes with `agent_end`.

---

## 3. Existing Interception Points

- **`prepareRequest`**:
  - Located in `packages/agent/src/agent-loop.ts`.
  - Runs before each LLM call. Can inspect current context and return updated `{ model, thinkingLevel }`.
  - *Jev role:* Primary point for mid-task dynamic model escalation.
- **`beforeToolCall`**:
  - Located in `packages/agent/src/agent-loop.ts` and wired in `packages/coding-agent/src/core/agent-session.ts`.
  - Runs after argument validation, before execution. Can block tool execution with `{ block: true, reason: string }`.
  - *Jev role:* Authoritative semantic risk assessment gate for consequential tools.
- **`afterToolCall`**:
  - Runs immediately following tool execution. Can mutate results or signal termination.
  - *Jev role:* Result evaluation, actionable failure diagnosis.
- **`finishTurn`**:
  - Invoked at the end of each turn with `{ message, toolResults, context, newMessages }`.
  - *Jev role:* Loop and stall detection, strategy reassessment, completion verification.
- **`getSteeringMessages`**:
  - Polled before starting the next turn.
  - *Jev role:* Injecting semantic course-correction messages when stalls are detected.

---

## 4. Existing Extension Points

Pi provides an extensive extension system (`packages/coding-agent/src/core/extensions/`):
- Lifecycle events: `before_agent_start`, `agent_start`, `turn_start`, `turn_end`, `message_end`, `agent_end`.
- Tool hooks: `tool_call` (preflight), `tool_result` (postflight).
- Compaction hooks: `session_before_compact`.
- Custom tools and slash commands.

*Design Note:* Previous community extensions (`iefnaf/pi-jev`, `TheoOliveira/pi-jev`) attached Jev exclusively through these extension hooks. This works for simple features, but cannot provide a persistent cross-turn semantic state machine, adaptive reasoning budgets, or mid-task model escalation. Our architecture implements the decision plane directly in the core runtime.

---

## 5. Existing Model-Routing Capabilities

- **Model Resolver (`packages/coding-agent/src/core/model-resolver.ts`)**: Resolves model aliases, exact provider/id strings, and partial patterns.
- **Model Scoping (`scopedModels`)**: Maintained on `AgentSession` and configured via CLI `--models` or settings `enabledModels`.
- **Dynamic Model Switching**: `agent.setModel(model)` and `agent.setThinkingLevel(level)` update the live model on the fly.
- **Per-Turn Override**: `prepareRequest` in `AgentLoopConfig` can return a new `model` and `thinkingLevel` for any specific turn without restarting the session.

---

## 6. Existing Tool Safety Mechanisms

- **Schema Validation**: Validates tool arguments using TypeBox schemas before execution.
- **Project Trust (`project-trust.ts`, `trust-manager.ts`)**: Restricts tool execution and environment access based on workspace trust.
- **Extension Preflight**: Extensions can inspect and block tool calls in `beforeToolCall`.
- **Output Guard (`output-guard.ts`)**: Prevents terminal overflow and excessive memory usage from massive tool outputs.

---

## 7. Existing Retry and Loop Behavior

- **Provider Retries**: `ProviderRetrySettings` manages exponential backoff for network/HTTP rate limits.
- **Tool Failures**: No semantic supervisor exists. If a bash command or test fails, the agent simply sees the error in the next prompt. Repeated identical failures or oscillatory file edits continue until the token budget or user intercedes.

---

## 8. Existing Telemetry

- **`@earendil-works/pi-telemetry`**: Provides span tracing (`TelemetryContext`, `TelemetrySpan`) and attribute logging.
- **Session Persistence (`SessionManager`)**: Records all conversation messages, model changes, thinking level changes, and compaction events to JSONL files.
- **Missing**: No decision-specific telemetry (confidence, probability distribution, decision latency, token cost, downstream outcome tracking).

---

## 9. Recommended Jev Integration Points

We place the decision subsystem in `packages/coding-agent/src/core/decision/`:

1. **Persistent `DecisionState`**:
   - Maintains structured semantic state: `task`, `repository`, `execution`, `context`, `model`, `verification`.
   - Updated deterministically upon user input, tool execution, test results, and file diffs.
2. **Intelligence Budget Gate (`state-transition.ts`)**:
   - Enforces: *One Jev invocation per meaningful state transition, NOT one Jev invocation per event*.
   - Evaluates whether a state change warrants Jev or can be resolved deterministically.
3. **Adaptive Reasoning & Dynamic Model Escalation (`model-router.ts`)**:
   - Initial task classification assigns appropriate model tier (`fast`, `standard`, `reasoning`, `deep`).
   - During execution, unexpected failures, concurrency issues, or architectural complexity trigger mid-task escalation via `prepareRequest`.
4. **Tool Risk Layer (`decision-policy.ts` in `beforeToolCall`)**:
   - Deterministic fast path allows harmless tools immediately.
   - Ambiguous/consequential tools evaluated by Jev (`destructive`, `credentialAccess`, `networkExfiltration`, `scopeViolation`).
   - Deterministic policy enforces authorization (`allow`, `ask_user`, `block`).
5. **Strategy & Stall Controller (`strategy-controller.ts` in `finishTurn`)**:
   - Tracks error fingerprints and edit oscillation.
   - When stalled, injects a steering message prompting strategy reassessment.
6. **Semantic Compaction (`semantic-compaction.ts`)**:
   - Distills living state (`criticalFacts`, `architectureDecisions`, `constraints`, `unresolvedQuestions`) to preserve it across context pruning.
7. **Decision Telemetry (`telemetry.ts`)**:
   - Records prediction alongside downstream outcome (tests passed, tokens saved, retries avoided).

---

## 10. Files Requiring Modification or Creation

### New Files
- `docs/jev/architecture-discovery.md` (this file)
- `packages/coding-agent/src/core/decision/index.ts`
- `packages/coding-agent/src/core/decision/decision-types.ts`
- `packages/coding-agent/src/core/decision/decision-state.ts`
- `packages/coding-agent/src/core/decision/state-transition.ts`
- `packages/coding-agent/src/core/decision/question-registry.ts`
- `packages/coding-agent/src/core/decision/jev-client.ts`
- `packages/coding-agent/src/core/decision/decision-engine.ts`
- `packages/coding-agent/src/core/decision/decision-policy.ts`
- `packages/coding-agent/src/core/decision/thresholds.ts`
- `packages/coding-agent/src/core/decision/model-router.ts`
- `packages/coding-agent/src/core/decision/strategy-controller.ts`
- `packages/coding-agent/src/core/decision/semantic-compaction.ts`
- `packages/coding-agent/src/core/decision/telemetry.ts`
- `packages/coding-agent/src/core/decision/cache.ts`
- `packages/coding-agent/src/core/decision/fallbacks.ts`
- `packages/coding-agent/test/decision/decision-engine.test.ts`
- `packages/coding-agent/test/decision/decision-state.test.ts`
- `packages/coding-agent/test/decision/tool-risk.test.ts`
- `packages/coding-agent/test/decision/model-router.test.ts`
- `packages/coding-agent/test/decision/strategy-controller.test.ts`

### Modified Files
- `packages/coding-agent/package.json`: Add `"@typesafe-ai/sdk": "0.6.0"`
- `packages/coding-agent/src/core/settings-manager.ts`: Add `jev` configuration schema and getters
- `packages/coding-agent/src/core/agent-session.ts`: Initialize `DecisionEngine` and attach hooks
- `packages/coding-agent/src/core/sdk.ts`: Wire decision engine creation in session instantiation
