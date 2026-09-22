# Pi + Jev: System One Decision Layer for a Faster, Cheaper Coding Agent

**Research date:** 22 September 2026  
**Target:** Pi coding-agent / pi-mono harness  
**Goal:** Preserve or improve Pi's coding capability while reducing latency and model-token spend by moving high-frequency bounded judgments from the main generative model to TypeSafe AI's Jev.

---

## 1. Executive summary

Jev should **not replace Pi's primary coding model**. It should become a low-latency decision/control layer around it.

The core architecture should be:

```text
                         ┌──────────────────────────┐
                         │     User request          │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │ deterministic extraction │
                         │ state/features/policies  │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                    ┌────────────────────────────────────┐
                    │              JEV                    │
                    │ Choice / Noul / Score              │
                    │ route • risk • relevance • verify  │
                    └───────┬──────────┬──────────┬──────┘
                            │          │          │
                       low risk     uncertain   complex
                            │          │          │
                            ▼          ▼          ▼
                     fast model    human /      strong
                     / tool        strong LLM   reasoning LLM
                            │          │          │
                            └──────────┴──────────┘
                                       │
                                       ▼
                              deterministic policy
                                       │
                                       ▼
                                  tool execution
                                       │
                                       ▼
                                compact state
                                       │
                              ┌────────┴────────┐
                              ▼                 ▼
                           JEV judge         next LLM turn
                         / loop detector
```

The most important design principle is:

> **Use the expensive generative model for open-ended reasoning and code generation. Use Jev for repeated, bounded semantic branch decisions. Use ordinary code for permissions, arithmetic, filesystem boundaries, budgets, and side effects.**

TypeSafe describes Jev as a System One model: it accepts unstructured state and returns typed probabilistic decisions rather than generated text. TypeSafe reports 70–500 ms end-to-end latency and $0.042 per million input tokens, with output tokens free. These figures are vendor claims and should be independently benchmarked in Pi's environment.

---

# 2. What Jev actually is

Jev is not a smaller chat model and is not a code-generation model.

It is designed around typed decisions:

### Noul

A yes/no proposition represented by a probability.

Example:

```text
Is this command destructive?
```

Possible result:

```text
0.97
```

### Choice

Select one option from a bounded set, with probabilities and confidence.

Example:

```text
Which action should Pi take next?

- read
- grep
- find
- bash
- edit
- ask_user
- delegate
- finish
```

### Score

Rate something against a defined scale.

Example:

```text
How difficult is this coding task?

1 = trivial
2 = simple
3 = moderate
4 = complex
5 = architectural
```

The important property is that **multiple questions can be evaluated against the same state in one call**. This makes one Jev request capable of replacing many small LLM classification calls.

TypeSafe explicitly positions Jev for classification, routing, scoring, extraction, branching, verification, guardrails, and real-time applications.

---

# 3. Why Jev fits a coding-agent harness

A coding agent contains two qualitatively different kinds of intelligence.

## System 2 / generative work

These tasks require open-ended reasoning:

- understand unfamiliar architecture
- design an API
- write a non-trivial implementation
- debug a complex race condition
- refactor code
- explain a solution
- generate tests
- reason about multiple interacting constraints

Keep these in the primary coding model.

## System 1 / control work

These happen constantly and usually have bounded answers:

- Does this tool call look dangerous?
- Is this file relevant?
- Should we search more?
- Is this task simple or complex?
- Which model should handle it?
- Is this result sufficient?
- Are we looping?
- Should we retry?
- Is the task probably complete?
- Does this diff touch unrelated areas?
- Should this action require approval?
- Which skill applies?
- Which test family should run?
- Is this output suspicious?
- Should the context be compacted?
- Should a subagent be delegated?

These are ideal candidates for Jev.

LangChain's launch-week Jev integration explicitly demonstrates model routing and risky-tool-call middleware. Its harness article also identifies the agent loop as a place where every additional decision normally costs another model call.

---

# 4. Cost model

TypeSafe currently advertises:

- **$0.042 / million input tokens**
- output tokens free
- approximately **70–500 ms** end-to-end latency
- up to **255 Choice options**
- multiple typed questions per request

Therefore:

| Jev input | Approx cost |
|---:|---:|
| 1,000 tokens | $0.000042 |
| 5,000 tokens | $0.000210 |
| 10,000 tokens | $0.000420 |
| 100,000 tokens | $0.0042 |
| 1M tokens | $0.042 |

For example, 100 Jev calls carrying 5,000 tokens each would consume approximately **$0.021** of Jev input.

The catch is important: **cheap does not mean free from state-construction cost**. If Pi sends the entire transcript, repository contents, or huge tool output into every Jev call, it wastes bandwidth and may erase much of the latency advantage.

Therefore Pi should maintain a **compact decision state** rather than forwarding the whole context.

---

# 5. Core design: Pi Decision Engine

Add a new internal subsystem:

```text
packages/
  coding-agent/
    src/
      core/
        decision/
          jev-client.ts
          decision-engine.ts
          decision-state.ts
          question-registry.ts
          thresholds.ts
          policy.ts
          telemetry.ts
          cache.ts
          fallbacks.ts
```

Conceptual API:

```ts
interface DecisionEngine {
  classify<T>(
    state: DecisionState,
    questions: DecisionQuestions<T>
  ): Promise<DecisionResult<T>>;

  route(
    state: DecisionState
  ): Promise<RouteDecision>;

  assessToolCall(
    state: ToolDecisionState
  ): Promise<ToolDecision>;

  assessProgress(
    state: ProgressDecisionState
  ): Promise<ProgressDecision>;

  assessCompletion(
    state: CompletionDecisionState
  ): Promise<CompletionDecision>;
}
```

The decision engine should hide the Jev SDK from the rest of Pi.

That gives Pi:

1. Jev now
2. another decision model later
3. deterministic fallback
4. local decision model experimentation
5. replay/testing
6. A/B evaluation

without coupling the agent loop directly to TypeSafe.

---

# 6. Decision-state architecture

Do not pass the full conversation to Jev by default.

Build a compact state object.

Example:

```ts
interface DecisionState {
  userGoal: string;

  task: {
    kind?: string;
    scope?: string;
    complexity?: number;
  };

  repository: {
    language?: string[];
    framework?: string[];
    gitBranch?: string;
    dirty?: boolean;
  };

  currentStep: {
    turn: number;
    lastTool?: string;
    lastToolSucceeded?: boolean;
    consecutiveFailures: number;
    repeatedActions: number;
  };

  evidence: {
    changedFiles: string[];
    testResults: string[];
    compilerErrors: string[];
    relevantFiles: string[];
  };

  policy: {
    sandboxMode: string;
    networkAllowed: boolean;
    approvalMode: string;
  };
}
```

The state builder should be deterministic.

The model should judge the state, not invent the state.

---

# 7. First-wave Jev capabilities for Pi

Implement these first.

## 7.1 Model routing

Before the first expensive LLM call:

```text
Question:
What level of reasoning does this task require?

Choices:
- direct
- fast
- balanced
- deep
- architectural
```

Additional questions in the same Jev call:

```text
Is the task primarily code generation?
Does it require repository-wide understanding?
Does it require debugging?
Does it involve architecture?
Is it security-sensitive?
Is it likely to require multiple tool iterations?
```

Use the result to choose:

- cheaper/faster model
- standard model
- reasoning model
- strongest model

Do not use Jev's choice as the authorization mechanism; it is a routing signal.

---

# 8. Tool routing

Pi currently exposes tools such as:

- read
- write
- edit
- bash
- grep
- find
- ls

Instead of making the coding model repeatedly reason about obvious routing, Jev can rank/select the appropriate tool family.

Example:

```ts
tool = Choice(
  "Which tool is most appropriate for the next operation?",
  {
    read: "...",
    grep: "...",
    find: "...",
    ls: "...",
    bash: "...",
    edit: "...",
    write: "...",
    ask_user: "...",
    finish: "..."
  }
)
```

Important:

**Jev should recommend. The harness validates.**

The runtime must still check:

- tool exists
- parameters validate
- path is allowed
- command is allowed
- sandbox policy
- user approval
- network policy

---

# 9. Risk gate for bash and other side effects

This is one of the highest-value integrations.

Before:

```text
assistant -> bash -> execute
```

Change to:

```text
assistant
   |
   v
validated tool call
   |
   v
Jev risk evaluation
   |
   +-- low risk ----------> deterministic policy -> execute
   |
   +-- uncertain ---------> ask / stronger model
   |
   +-- high risk ----------> block / approval
```

Questions:

```text
Is this destructive?
Does it modify data outside the task scope?
Does it access credentials?
Does it transmit data externally?
Does it modify production infrastructure?
Does it alter git history?
Does it delete files?
Does it install software?
Does it execute downloaded/untrusted code?
```

Use Noul probabilities and Score for severity.

Example policy:

```ts
if (credentialRisk >= 0.20) {
  return "require_approval";
}

if (destructive >= 0.80 && scopeRisk >= 0.50) {
  return "require_approval";
}

if (externalNetwork >= 0.80) {
  return "require_approval";
}

return "allow_if_deterministic_policy_passes";
```

Do NOT allow:

```ts
if (jevSaysSafe) execute();
```

Jev is an advisory semantic layer. The harness owns authorization.

---

# 10. Repository retrieval / context selection

This may be one of the biggest speed improvements.

Current pattern:

```text
LLM -> decide what to read
LLM -> read
LLM -> decide what else to read
LLM -> read
...
```

Better:

```text
deterministic index/search
        |
        v
candidate files
        |
        v
Jev relevance scoring
        |
        v
top candidates
        |
        v
LLM reads only high-value context
```

For every candidate file:

```text
Is this file relevant to the task?
Does it contain the likely implementation?
Does it contain tests?
Does it define an API used by the target?
Does it contain security-sensitive behavior?
Is it likely stale?
```

The deterministic search engine should generate candidates.

Jev ranks/filters them.

The LLM receives the selected subset.

This prevents the generative model from spending tokens on repeated file-discovery decisions.

---

# 11. Skill routing

Pi's skills can become Jev-routed.

Example:

```text
user request
    |
    v
Jev
    |
    +--> debugging
    +--> testing
    +--> refactoring
    +--> database
    +--> frontend
    +--> infrastructure
    +--> security
    +--> documentation
    +--> architecture
```

Questions:

```text
Does this request need a specialized skill?
Which skill is most relevant?
Are multiple skills required?
What is the confidence?
```

If confidence is low, let the primary LLM decide.

This creates a cheap learned dispatch layer.

---

# 12. Subagent delegation

Jev can decide whether a task should remain in the current agent or become a subtask.

Questions:

```text
Is this task independently decomposable?
Would another agent reduce wall-clock time?
Does the task require isolated context?
Can the task be expressed with a bounded deliverable?
Is parallel execution safe?
```

Possible choices:

```text
stay
delegate_one
delegate_parallel
delegate_research
delegate_review
```

The deterministic harness should still enforce maximum concurrency and budget.

---

# 13. Test selection

After code changes, avoid blindly running every test.

Build deterministic candidates:

```text
changed files
dependency graph
test files
package metadata
previous test failures
```

Then Jev evaluates:

```text
Which test family is most relevant?
How likely is the change to affect integration tests?
Is a full suite justified?
Is the change purely formatting/documentation?
```

Possible output:

```text
unit
integration
typecheck
lint
e2e
full_suite
none
```

Then normal code executes the selected commands.

---

# 14. Test-result interpretation

Do not use the expensive model just to classify obvious failures.

Feed Jev:

```text
changed files
command
exit code
stderr summary
test summary
previous attempts
```

Questions:

```text
Is this failure caused by the current change?
Is this likely an environment failure?
Is the failure flaky?
Is another retry useful?
Should the agent inspect source?
Should the agent revert the last change?
```

This can greatly reduce wasted reasoning turns.

---

# 15. Retry decisions

A coding agent often gets stuck in:

```text
run command
failure
change something
run command
same failure
change something
run command
same failure
...
```

Jev is particularly appropriate for detecting this.

State:

```text
last 8 tool actions
normalized commands
exit codes
error fingerprints
changed files
time elapsed
repeated action count
```

Questions:

```text
Is the agent making meaningful progress?
Is the current strategy stalled?
Is another retry justified?
Should the agent change strategy?
Should the task be escalated?
```

Example:

```ts
if (stalledProbability > 0.75) {
  injectSteeringMessage(
    "The current strategy appears stalled. Reassess the approach before continuing."
  );
}
```

---

# 16. Loop detection

This should run after every tool result or turn.

Deterministic signals:

```text
same command repeated
same file repeatedly edited
same error fingerprint
same tool sequence
no changed files
no new evidence
```

Jev judges semantic stalling:

```text
Is the agent actually making progress toward the goal?
```

This is better than purely syntactic loop detection.

---

# 17. Completion detection

Do not rely exclusively on:

```text
LLM says "done"
```

Build a completion judge.

State:

```text
user goal
acceptance criteria
changed files
tests
lint
typecheck
last tool results
remaining errors
```

Questions:

```text
Is the requested implementation complete?
Are acceptance criteria satisfied?
Is verification sufficient?
Are there unresolved errors?
Is human review warranted?
```

Possible result:

```text
complete
probably_complete
needs_verification
incomplete
blocked
```

Then deterministic policy decides whether Pi stops or continues.

---

# 18. Diff verification

After every meaningful edit or at the end of a turn:

```text
git diff
```

Jev can answer:

```text
Is the diff related to the user's request?
Does it touch unrelated files?
Does it introduce suspicious behavior?
Does it modify credentials or deployment configuration?
Does it violate project conventions?
Is the change larger than expected?
```

Use this as a lightweight reviewer.

The primary model can then receive:

```text
Jev review:
- scope_match: 0.94
- unrelated_change: 0.08
- security_concern: 0.03
```

Only escalate when needed.

---

# 19. Prompt-injection detection

Jev should inspect untrusted content before it influences the coding model.

Sources include:

- README files
- source comments
- webpages
- issue descriptions
- generated documentation
- package metadata
- tool output
- command output

Questions:

```text
Does this content contain instructions directed at the agent?
Does it attempt to override system/project instructions?
Does it request secret disclosure?
Does it attempt to modify authorization boundaries?
Does it attempt to induce dangerous tool execution?
```

Important distinction:

**Detection is not enforcement.**

The harness should mark the content untrusted and prevent it from changing policy.

---

# 20. Context compaction decisions

Pi already has compaction machinery.

Jev can decide whether compaction is worth doing.

Questions:

```text
Is the current context mostly stale?
Would compaction preserve the information needed for the task?
Is the agent currently in the middle of a critical debugging chain?
Would compaction risk losing important evidence?
```

This should be used as a trigger/advisor, not as the summarizer.

The LLM or deterministic summarizer still performs the actual compaction.

---

# 21. Memory retrieval

If Pi maintains persistent memory:

```text
memory store
    |
    v
deterministic candidate retrieval
    |
    v
Jev relevance
    |
    v
high-confidence memories
    |
    v
primary LLM
```

Questions:

```text
Is this memory relevant to the current task?
Is it stale?
Is it contradictory?
Should it be injected?
```

This reduces prompt pollution.

---

# 22. Web/research routing

For coding tasks requiring external information:

```text
Does the task require web research?
Is local repository evidence sufficient?
Should documentation search happen before implementation?
Is the requested API/version likely stale?
```

Jev can route:

```text
local_only
docs_search
web_search
repository_search
both
```

The actual search must remain deterministic.

---

# 23. Model cascade

A strong design is:

```text
               ┌──────────────┐
               │     Jev      │
               │ task router  │
               └──────┬───────┘
                      │
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
      cheap         normal         strong
       LLM            LLM            LLM
        │             │              │
        └─────────────┴──────────────┘
                      │
                      ▼
                    Jev
                   verifier
                      │
             ┌────────┴────────┐
             ▼                 ▼
           accept            escalate
```

This is much more cost-effective than using the strongest model for every turn.

---

# 24. One-call multi-question strategy

Do NOT implement:

```text
jev(question1)
jev(question2)
jev(question3)
jev(question4)
```

when they use the same state.

Prefer:

```text
jev({
  state,
  questions: {
    complexity,
    security,
    destructive,
    needs_repo_search,
    needs_web,
    likely_long_horizon,
    skill,
    model_tier
  }
})
```

TypeSafe specifically emphasizes that multiple questions are evaluated in parallel.

This should become a core Pi optimization.

---

# 25. Question registry

Create reusable question definitions.

Example:

```ts
export const questions = {
  taskComplexity: score(
    "How difficult is the requested coding task?",
    [
      "trivial",
      "simple",
      "moderate",
      "complex",
      "architectural",
    ],
  ),

  needsRepoSearch: noul(
    "Does solving this task require discovering repository structure or implementation details?"
  ),

  securitySensitive: noul(
    "Does this task involve security-sensitive behavior, credentials, permissions, authentication, authorization, or secrets?"
  ),

  destructive: noul(
    "Would the proposed action modify or delete data in a potentially destructive way?"
  ),
};
```

Questions should be:

- narrow
- independently answerable
- stable
- explicit
- testable

Avoid giant questions such as:

```text
What should the agent do?
```

---

# 26. Confidence-aware thresholds

Jev's probabilities are useful because the harness can distinguish:

```text
high confidence
low confidence
ambiguous
```

Example:

```ts
if (decision.confidence >= 0.90) {
  useDecision();
} else if (decision.confidence >= 0.60) {
  combineWithRules();
} else {
  escalateToLLM();
}
```

Do not choose thresholds arbitrarily forever.

Pi should collect labeled outcomes and tune thresholds per decision.

Examples:

```text
tool_risk_threshold
completion_threshold
retrieval_threshold
model_route_threshold
retry_threshold
prompt_injection_threshold
```

---

# 27. Calibration / evaluation loop

Every Jev decision should optionally record:

```json
{
  "decisionType": "tool_risk",
  "inputHash": "...",
  "questionVersion": "tool-risk-v3",
  "choice": "allow",
  "probabilities": {},
  "confidence": 0.94,
  "actualOutcome": null,
  "escalated": false,
  "latencyMs": 142,
  "inputTokens": 812,
  "costUsd": 0.000034104
}
```

Later:

```text
prediction -> outcome
```

can be used to evaluate:

- precision
- recall
- calibration
- false blocks
- false allows
- escalation rate
- latency
- cost

---

# 28. Shadow mode

Do not initially let Jev control Pi.

Phase 1:

```text
Pi behaves exactly as before
       +
Jev observes and records decisions
```

For example:

```text
Jev says:
  likely_tool = grep
  confidence = 0.91

Pi actually:
  tool = read
```

This creates a dataset.

After enough examples:

```text
shadow
  ->
advisory
  ->
confidence-gated
  ->
fully integrated
```

---

# 29. A/B benchmark

Measure the original Pi against Jev-enhanced Pi.

Track:

### Speed

- time to first model response
- time per turn
- tool decision latency
- total wall-clock time
- time to completion

### Cost

- primary LLM input tokens
- primary LLM output tokens
- Jev input tokens
- total API cost
- cost per completed task

### Quality

- task success
- tests passing
- regressions
- human intervention
- incorrect tool choice
- missed completion

### Safety

- dangerous tool calls blocked
- dangerous calls incorrectly allowed
- false positives
- prompt injection detections

### Efficiency

- number of LLM turns
- number of tool calls
- repeated tool calls
- wasted reads
- wasted tests
- unnecessary model escalations

---

# 30. Recommended implementation phases

## Phase 0 — Instrumentation

No behavioral changes.

Collect:

```text
task
LLM calls
tool calls
tool results
latencies
tokens
errors
retries
turn count
changed files
test commands
```

Goal: identify high-frequency decision points.

---

## Phase 1 — Jev SDK adapter

Add:

```text
JevClient
DecisionEngine
DecisionState
QuestionRegistry
Telemetry
```

Support:

- direct TypeSafe API
- configurable model
- timeout
- retries
- fallback
- request IDs
- metrics

---

## Phase 2 — Shadow decisions

Add Jev decisions:

- complexity
- model routing
- tool risk
- relevance
- completion
- loop detection

Do not alter behavior.

---

## Phase 3 — Model routing

Allow Jev to select among configured models.

Fallback to the default model whenever:

```text
low confidence
API error
decision timeout
unknown task
```

---

## Phase 4 — Tool-risk gate

Protect:

- bash
- write
- edit
- network tools
- deployment tools

Keep deterministic policy as final authority.

---

## Phase 5 — Retrieval optimization

Use:

```text
search -> candidate set -> Jev -> top context -> LLM
```

---

## Phase 6 — Progress supervisor

Add:

- loop detection
- retry decisions
- failure classification
- strategy-change steering

---

## Phase 7 — Verification

Add:

- diff review
- test selection
- completion judgment
- final verification

---

## Phase 8 — Continuous self-optimization

Have Pi analyze its own telemetry.

The coding model can propose:

```text
new question
new threshold
new state feature
new rule
new routing policy
```

But changes should be evaluated offline before becoming active.

---

# 31. Self-improving question design

This is especially important.

Pi should maintain a registry:

```text
decision name
question version
state schema
possible outcomes
thresholds
fallback
evaluation dataset
```

Example:

```yaml
decision: tool_risk
version: 3

questions:
  destructive:
    type: noul

  credential_access:
    type: noul

  external_network:
    type: noul

  scope_risk:
    type: score
    scale:
      - none
      - low
      - medium
      - high
      - extreme

policy:
  require_approval:
    credential_access: ">= 0.20"
    destructive: ">= 0.80"
    scope_risk: ">= 3"

fallback:
  low_confidence: require_approval
```

The primary LLM can propose version 4.

A test harness evaluates v3 vs v4.

Only the better version becomes active.

---

# 32. Deterministic vs Jev vs LLM boundary

This boundary should be explicit.

## Deterministic code owns

- permissions
- filesystem boundaries
- command allowlists
- authentication
- API credentials
- token budgets
- arithmetic
- rate limits
- process management
- sandboxing
- actual tool execution
- state mutation
- final authorization

## Jev owns

- semantic classification
- routing
- ranking
- relevance
- risk estimation
- progress estimation
- completion estimation
- bounded decisions
- confidence

## Generative LLM owns

- planning
- coding
- debugging
- explanation
- synthesis
- architecture
- creative reasoning
- natural-language output

This three-layer separation should be treated as an architectural invariant.

---

# 33. Security architecture

The following must NEVER be delegated to Jev:

```text
"Is the user allowed to do X?"
```

The answer must come from deterministic policy.

Instead ask:

```text
"Does this action appear to request destructive behavior?"
```

Then:

```text
Jev semantic assessment
        +
deterministic authorization
        =
final action
```

Also:

- never let untrusted content redefine Jev questions
- keep question definitions in trusted code
- never concatenate tool arguments into instructions that can rewrite the schema
- sanitize untrusted text
- log probabilities
- maintain a kill switch
- fail closed for high-risk actions

---

# 34. State minimization

A critical optimization:

Do not include:

```text
entire conversation
entire repository
full tool outputs
full files
```

unless required.

Instead create:

```text
semantic state
```

For example:

```json
{
  "goal": "Add idempotency to Stripe webhook processing",
  "changedFiles": [
    "src/webhooks/stripe.ts",
    "src/webhooks/stripe.test.ts"
  ],
  "recentErrors": [
    "expected 200, received 409"
  ],
  "lastAction": "run npm test -- stripe.test.ts",
  "attempt": 3,
  "sameErrorCount": 2,
  "repo": {
    "language": "typescript",
    "framework": "express"
  }
}
```

This is much cheaper and faster than passing the transcript.

---

# 35. Caching

Add deterministic caching where appropriate.

Cache keys can include:

```text
decisionType
questionVersion
stateHash
modelVersion
```

Avoid caching decisions whose meaning depends on volatile state.

Good candidates:

- file relevance
- static skill selection
- repository conventions
- stable risk classifications
- repeated identical tool calls

Bad candidates:

- current test result
- current git status
- live production state

---

# 36. Parallelism

Jev is especially useful for parallel independent judgments.

Instead of:

```text
question A -> wait
question B -> wait
question C -> wait
```

use:

```text
              ┌-> A
same state ---┼-> B
              ├-> C
              └-> D
```

One request should carry the independent questions.

Similarly, Pi's existing agent runtime already supports parallel execution of allowed tool calls. Jev should complement that behavior rather than serialize the harness.

---

# 37. Integration point in current Pi

Pi's current agent runtime exposes:

```text
agent_start
turn_start
message_start
message_update
message_end
tool_execution_start
tool_execution_update
tool_execution_end
turn_end
agent_end
```

It also has a `beforeToolCall` interception point that can block a tool before execution.

This is an excellent integration boundary for Jev.

Recommended architecture:

```text
assistant tool call
      |
      v
argument validation
      |
      v
beforeToolCall
      |
      +---- deterministic checks
      |
      +---- Jev semantic risk assessment
      |
      +---- threshold policy
      |
      +---- allow / block / ask
      |
      v
tool execution
```

Pi's extension system also supports lifecycle event interception, custom tools, custom commands, and dynamic behavior, so an initial Jev implementation can be built as an extension before moving stable pieces into core.

---

# 38. Proposed extension layout

Start as:

```text
.pi/
  extensions/
    jev/
      index.ts
      client.ts
      decisions.ts
      state.ts
      policy.ts
      telemetry.ts
      thresholds.ts
      README.md
      package.json
```

After proving value, promote to Pi core:

```text
packages/
  coding-agent/
    src/core/decision/
```

This reduces risk during development.

---

# 39. Suggested first Jev call

For each user task:

```text
questions:

task_complexity       -> Score
needs_repository      -> Noul
needs_web             -> Noul
security_sensitive    -> Noul
likely_long_horizon   -> Noul
recommended_skill     -> Choice
recommended_model     -> Choice
```

One request.

Use this only for routing initially.

---

# 40. Suggested per-tool Jev call

For risky tools:

```text
questions:

destructive           -> Noul
credential_access     -> Noul
network_exfiltration  -> Noul
production_impact     -> Noul
scope_violation       -> Noul
risk_level            -> Score
```

Then deterministic policy.

---

# 41. Suggested post-tool Jev call

After a meaningful tool result:

```text
questions:

progress_made         -> Noul
result_relevant       -> Noul
failure_is_actionable -> Noul
should_retry          -> Noul
strategy_stalled      -> Noul
needs_human           -> Noul
next_phase             -> Choice
```

This should be triggered selectively rather than after every trivial `ls`.

---

# 42. Suggested completion Jev call

```text
questions:

goal_satisfied        -> Noul
acceptance_met        -> Noul
verification_sufficient -> Noul
remaining_blocker     -> Noul
unrelated_changes     -> Noul
review_required       -> Noul
```

Only call this when:

- model says it is done
- no tool calls remain
- tests pass
- or the agent has stopped making progress

---

# 43. Fallback behavior

Jev must never become a single point of failure.

If Jev:

- times out
- returns an API error
- exceeds latency budget
- has low confidence
- returns unknown schema

then:

```text
fallback -> existing Pi behavior
```

For high-risk tools:

```text
fallback -> human approval / deny
```

not:

```text
fallback -> allow
```

---

# 44. Latency budget

Do not blindly add Jev calls to every event.

Use a policy:

```text
cheap local rule
      |
      +-- obviously safe -> no Jev
      |
      +-- obviously unsafe -> block/approval
      |
      +-- ambiguous -> Jev
```

This creates a three-stage cascade:

```text
Rule -> Jev -> strong LLM
```

rather than:

```text
Jev -> LLM
```

for every action.

---

# 45. Expected performance strategy

The goal should not be:

> "Use Jev everywhere."

The goal should be:

> "Move the highest-frequency, lowest-entropy semantic decisions out of the expensive model."

Prioritize decisions with:

```text
high frequency
+
bounded output space
+
small state
+
low error cost
+
currently performed by an LLM
```

These are the highest ROI.

---

# 46. ROI ranking for Pi

Recommended implementation order:

| Priority | Decision | Expected value |
|---|---|---|
| P0 | tool risk gating | high |
| P0 | model routing | high |
| P0 | loop/stall detection | high |
| P1 | repository relevance | high |
| P1 | completion verification | high |
| P1 | retry decision | high |
| P1 | skill routing | medium-high |
| P2 | test selection | medium-high |
| P2 | diff verification | medium-high |
| P2 | subagent delegation | medium |
| P2 | context compaction trigger | medium |
| P3 | memory relevance | medium |
| P3 | web/research routing | medium |
| P3 | prompt-injection classifier | high safety value |
| P4 | experimental self-optimization | long-term |

---

# 47. Important limitations

Jev is not a magic replacement for reasoning.

Known limitations include:

- it does not generate code
- it does not provide open-ended explanations
- it requires a bounded question schema
- Choice has bounded cardinality
- it depends heavily on good state construction
- confidence still needs empirical calibration for each use case
- a valid typed answer can still be semantically wrong
- current model/API behavior is early-stage and may change

TypeSafe's own evaluation material uses model-generated reference labels in some workflows, so those results should not be interpreted as definitive human-ground-truth benchmarks.

Independent early evaluations also emphasize that Jev can be highly useful for bounded decisions while still requiring task-specific auditing.

---

# 48. Recommended benchmark suite for Pi

Create:

```text
benchmarks/jev/
  routing/
  tool-risk/
  retrieval/
  loop-detection/
  completion/
  retry/
  test-selection/
  diff-review/
```

Each case:

```json
{
  "id": "tool-risk-001",
  "state": {},
  "expected": {
    "decision": "approval"
  },
  "risk": "high"
}
```

Run:

```text
baseline Pi
Jev shadow
Jev controlled
```

Compare:

```text
accuracy
latency
cost
false positives
false negatives
escalation rate
```

---

# 49. Self-improvement workflow

Pi itself should be able to improve the Jev layer.

Give the coding model a skill:

```text
/jev-engineering
```

The skill should instruct Pi to:

1. inspect current decision telemetry
2. find expensive or repeated model decisions
3. identify bounded decisions
4. propose Jev questions
5. propose compact state features
6. build a benchmark dataset
7. implement the decision
8. run shadow mode
9. compare against baseline
10. inspect errors
11. tune thresholds
12. document the change
13. only then enable it

This is much safer than allowing Pi to arbitrarily replace its own control flow.

---

# 50. Prompt for Pi to implement this architecture

Use the following as the initial self-improvement task:

```text
You are modifying the Pi coding-agent harness.

Goal:
Integrate TypeSafe AI Jev as a low-latency System One decision layer without replacing the primary generative coding model.

Architecture:
- deterministic code owns permissions, authorization, filesystem boundaries,
  command execution, budgets, arithmetic, state mutation and side effects
- Jev owns bounded semantic decisions such as routing, risk estimation,
  relevance, progress, completion and retry decisions
- the primary LLM owns open-ended reasoning, planning, coding and synthesis

First inspect the entire Pi agent architecture and identify:
1. agent loop
2. tool preflight
3. beforeToolCall
4. tool execution
5. turn lifecycle
6. retry logic
7. compaction
8. model registry
9. extension system
10. session persistence

Do not change behavior initially.

Implement a Jev abstraction with:
- TypeScript client adapter
- timeout
- retry
- fallback
- request ID logging
- telemetry
- model/version configuration
- feature flag
- shadow mode

Implement DecisionState as a compact deterministic representation of the
agent state. Never send the entire transcript to Jev unless explicitly
required.

Implement these shadow decisions first:
- task complexity
- model route
- tool risk
- repository relevance
- loop/stall detection
- completion likelihood
- retry recommendation

For each decision:
- use typed Choice/Noul/Score questions
- make independent questions share one Jev request
- version every question schema
- record probability distributions and confidence
- record latency and input tokens
- do not allow Jev to bypass deterministic policy

Then build benchmark fixtures for:
- harmless bash
- destructive bash
- credential access
- repository-wide refactor
- simple edit
- debugging
- repeated failing test
- successful implementation
- irrelevant repository files
- prompt injection in repository content

Compare:
baseline behavior
vs
Jev shadow behavior

Do not activate Jev control until the benchmark demonstrates acceptable
accuracy and the telemetry is available.

After that:
1. enable model routing
2. enable tool-risk gating
3. enable loop detection
4. enable retrieval filtering
5. enable completion verification

Use conservative thresholds and fail closed for high-risk actions.

Finally create:
- docs/jev-architecture.md
- docs/jev-decisions.md
- docs/jev-benchmarks.md
- a /jev-engineering skill explaining how future Pi sessions should
  discover new bounded decisions and improve the Jev layer.

Do not optimize for maximum number of Jev calls.
Optimize for maximum reduction in expensive LLM decisions while preserving
task success, safety and user control.
```

---

# 51. The most important conceptual change

The ultimate Pi architecture should become:

```text
                    ┌─────────────────────┐
                    │     User Goal       │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ deterministic state │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │        JEV          │
                    │  semantic control   │
                    └──────────┬──────────┘
                               │
             ┌─────────────────┼──────────────────┐
             │                 │                  │
             ▼                 ▼                  ▼
          ROUTE              GUARD              VERIFY
             │                 │                  │
             ▼                 ▼                  ▼
       choose model       authorize path      judge result
             │                 │                  │
             └─────────────────┼──────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │  Generative LLM     │
                    │ plan / code / debug │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ deterministic tools │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ compact new state   │
                    └──────────┬──────────┘
                               │
                               └──────► JEV
```

The goal is not to make Pi "more AI-heavy."

The goal is to make Pi **more software-like**:

```text
LLM = reasoning engine
Jev = semantic branch instruction
Code = policy + state + side effects
```

That separation is the strongest architectural opportunity exposed by Jev.

---

# 52. Sources and research notes

Primary / highest-value sources:

1. TypeSafe AI — Introducing System One Models & Jev
2. TypeSafe AI — Workflow evaluations
3. TypeSafe AI — API documentation
4. LangChain — Building a Harness with Jev
5. LangChain — Jev as a Judge for Agent Evals
6. Pi / earendil-works — agent runtime and extension documentation
7. Community coding-agent Jev use-case repositories
8. Independent early Jev evaluations and research papers

The TypeSafe launch material reports 70–500 ms latency and $0.042/M input tokens. Treat these as vendor-reported figures until reproduced in Pi's deployment environment.

The most directly relevant independent/implementation references are the LangChain harness example, the Jev coding-agent use-case repository, and the Pi runtime's `beforeToolCall`/event lifecycle.

---

# 53. Final implementation philosophy

Do not ask:

> "Where can we put Jev?"

Ask:

> "Which decisions is the expensive generative model currently making that have a small, explicit output space?"

For every candidate:

```text
1. Define the state.
2. Define the bounded question.
3. Define deterministic policy.
4. Add Jev shadow evaluation.
5. Collect outcomes.
6. Measure accuracy/calibration.
7. Set a confidence threshold.
8. Add fallback.
9. Activate gradually.
10. Re-evaluate continuously.
```

If Pi follows this loop, Jev becomes a **decision substrate** rather than another tool bolted onto the agent.

That is the path to a Pi harness that is potentially faster and cheaper while preserving the capabilities of a strong coding LLM.
