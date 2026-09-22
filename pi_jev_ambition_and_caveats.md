The interesting opportunity is **not to make a better `pi-jev` extension**. It is to make a **decision-native Pi runtime**.

## 1. What we're actually competing against

The current `iefnaf/pi-jev` already provides:

- Jev model routing per turn
- Jev-guided selective compaction
- configuration and independent feature toggles
- graceful fallback to native Pi behavior
- `before_agent_start` and `session_before_compact` integration

([GitHub][1])

And the `TheoOliveira/pi-jev` implementation goes considerably further:

- semantic tool routing
- skill discovery
- typed Jev judgments
- automatic model selection
- Jev compaction
- completion gates
- multi-agent orchestration
- model failure avoidance
- opt-in automatic modes

([GitHub][2])

So the bar is already **quite high**.

If our architecture ends up being:

```text
Pi
 ├── Jev model router
 ├── Jev compaction
 ├── Jev tool router
 └── Jev completion checker
```

then **don't fork Pi**.

We'd just be recreating an extension ecosystem that already exists.

---

# 2. Where I think we can genuinely surpass it

The key distinction is:

### pi-jev

```text
Pi agent
   │
   ├── hook → Jev routing
   ├── hook → Jev compaction
   ├── hook → Jev tools
   └── hook → Jev verification
```

### Our architecture

```text
                 Pi Agent Runtime
                        │
                 ┌──────▼──────┐
                 │ Agent State │
                 └──────┬──────┘
                        │
                Decision Engine
                        │
       ┌────────────────┼────────────────┐
       │                │                │
    Routing           Action          Context
       │                │                │
    Model             Tool            Memory
       │                │                │
       └────────────────┼────────────────┘
                        │
                    Main LLM
```

That's a fundamentally different proposition.

---

# 3. The missing primitive: `DecisionState`

This is the most important thing I would add to the fork.

Pi currently operates largely around the conversation/event stream. Its agent loop is essentially:

```text
user
 ↓
LLM
 ↓
tool
 ↓
tool result
 ↓
LLM
 ↓
...
```

and its extension architecture deliberately exposes fine-grained lifecycle events. ([GitHub][3])

That's great for extensibility.

But it doesn't give the agent a first-class **semantic state representation**.

I'd introduce:

```typescript
interface DecisionState {
  task: TaskState;
  repository: RepositoryState;
  execution: ExecutionState;
  context: ContextState;
  model: ModelState;
  verification: VerificationState;
}
```

For example:

```typescript
interface ExecutionState {
  phase: "understand" | "explore" | "implement" | "test" | "debug" | "verify";

  progress: number;
  failedAttempts: number;
  strategyChanges: number;
  filesChanged: number;
  testsFailed: number;
}
```

Now Jev doesn't repeatedly have to infer everything from raw transcript text.

It gets:

```text
STATE
 ↓
bounded questions
 ↓
typed decisions
```

That is much closer to TypeSafe's intended System One model: structured state in → typed probabilistic decisions out. ([TypeSafe AI][4])

---

# 4. This enables something pi-jev doesn't fundamentally have: adaptive reasoning

Imagine the user asks:

> Refactor authentication middleware.

Initial state:

```text
complexity: medium
risk: high
scope: multi-file
model: strong
```

Agent starts.

Then:

```text
3 files inspected
tests discovered
no ambiguity
```

Jev can say:

```text
progress = high
continue = 0.96
```

No model change.

Then:

```text
test failure
unexpected dependency interaction
```

State changes:

```text
complexity ↑
risk ↑
uncertainty ↑
```

Jev:

```text
escalate_model = 0.91
change_strategy = 0.78
```

Now we escalate.

Later:

```text
tests pass
diff stable
acceptance criteria satisfied
```

Jev:

```text
completion = 0.97
```

That's **adaptive reasoning budget**.

The agent isn't assigned:

> "Use Claude X for this entire task."

It dynamically decides:

> "How much intelligence is needed _right now_?"

That is the direction I'd pursue.

---

# 5. This also changes how we should think about Jev invocation

I would explicitly reject:

```text
every Pi event → Jev
```

That's potentially disastrous.

Instead:

```text
                    state transition
                           │
                           ▼
                  Is decision valuable?
                     /           \
                   no             yes
                   │               │
              deterministic       Jev
                  path              │
                                   ▼
                              policy action
```

### Examples

**No Jev:**

```text
contextTokens > threshold
```

That's deterministic.

**No Jev:**

```text
file doesn't exist
```

That's deterministic.

**No Jev:**

```text
command is explicitly forbidden
```

That's deterministic.

**Use Jev:**

```text
Should we escalate model?
```

**Use Jev:**

```text
Are we actually making progress?
```

**Use Jev:**

```text
Is this failure likely related to the previous change?
```

**Use Jev:**

```text
Is the current strategy stuck?
```

**Use Jev:**

```text
Does this diff satisfy the user's intent?
```

This gives us:

> **Jev as an intelligence budget, not an obligatory middleware layer.**

That's a significant architectural advantage.

---

# 6. Model routing becomes much richer

Current Jev routing is already useful. The `pi-jev` implementations classify request difficulty and use that to select models. ([GitHub][1])

We can go beyond:

```text
difficulty → model
```

to:

```text
task
 │
 ├── difficulty
 ├── domain
 ├── risk
 ├── scope
 ├── context size
 ├── required capabilities
 ├── uncertainty
 ├── current progress
 └── verification requirements
             │
             ▼
       Model capability
             │
             ▼
           Model
```

For example:

| Situation                            | Decision           |
| ------------------------------------ | ------------------ |
| Rename variable                      | cheap              |
| Update README                        | cheap              |
| Generate unit tests                  | cheap/medium       |
| Debug ordinary API bug               | medium             |
| Multi-package refactor               | strong             |
| Security-sensitive change            | strong             |
| Repeated failed attempts             | escalate           |
| Huge-context architectural reasoning | long-context model |
| Vision-dependent task                | vision model       |

This is no longer simply "Jev chooses the model."

It's **capability-aware compute allocation**.

---

# 7. The really interesting part: strategy control

This is where I'd want the fork to diverge most from pi-jev.

Today the LLM largely controls:

```text
what should I do next?
```

Our runtime could have Jev answer bounded meta-questions:

```text
Am I progressing?
Should I continue?
Should I retry?
Should I change strategy?
Should I inspect more context?
Should I escalate?
Should I stop?
Is verification sufficient?
```

So:

```text
                 Main LLM
                    │
              proposes action
                    │
                    ▼
              execute action
                    │
                    ▼
                new state
                    │
                    ▼
                  Jev
                    │
        ┌───────────┼────────────┐
        ▼           ▼            ▼
     continue    escalate     change strategy
```

The LLM remains the **System 2 generator**.

Jev becomes the **System 1 controller**.

That division is very aligned with TypeSafe's own framing of Jev. ([TypeSafe AI][4])

---

# 8. Compaction is another place where we should NOT simply copy pi-jev

This deserves emphasis because Pi's native compaction is already quite sophisticated.

Pi currently triggers automatic compaction based on:

```text
contextTokens > contextWindow - reserveTokens
```

with configurable reserve/recent-token limits, and extensions can intercept `session_before_compact`. ([GitHub][5])

`pi-jev` then intelligently determines which tool outputs and history should survive. ([GitHub][1])

That's good.

But I'd change the underlying question.

### Traditional compaction

> Which messages should I retain?

### Our compaction

> What semantic state must remain true for the agent to continue correctly?

For example:

```text
CRITICAL
────────
user requirements
architecture decisions
constraints
changed files
known failures
successful fixes
unresolved issues
acceptance criteria

DISCARDABLE
───────────
verbose tool output
repeated directory listings
superseded hypotheses
duplicate explanations
stale diagnostics
```

And the semantic state survives independently of the transcript.

That's much more robust.

---

# 9. We should also exploit Jev's probabilistic nature

This is an important difference from ordinary LLM "confidence."

TypeSafe specifically positions Jev around typed decisions and calibrated probabilities. ([TypeSafe AI][4])

So instead of:

```typescript
if (jevSaysHard) {
  useStrongModel();
}
```

we can eventually have:

```typescript
if (decision.escalate.probability > policy.threshold) {
  escalate();
}
```

And collect:

```text
prediction
    ↓
action
    ↓
actual outcome
    ↓
calibration
```

This gives us a feedback loop.

---

# 10. Which leads to what I think could be our killer feature

## Decision telemetry

Every meaningful Jev decision should produce something like:

```json
{
  "decision": "escalate_model",
  "probability": 0.91,
  "modelBefore": "fast",
  "modelAfter": "reasoning",
  "latencyMs": 87,
  "cost": 0.0003,

  "outcome": {
    "testsPassed": true,
    "additionalRetries": 0,
    "tokensSaved": 14200
  }
}
```

Now we can ask:

> Was invoking Jev actually worth it?

Suppose we discover:

```text
simple TypeScript edits:
Jev changed routing 0.4% of the time
```

Then:

```text
→ stop calling Jev
```

For:

```text
large refactors:
Jev escalation prevented 22% of failed attempts
```

Then:

```text
→ call Jev aggressively
```

This gives us **empirical invocation policy optimization**.

That's considerably more interesting than static configuration.

---

# 11. And this answers the fork question

Pi's extension architecture is deliberately powerful: extensions can intercept tool calls, customize compaction, maintain persistent state, add commands, etc. ([GitHub][3])

Therefore:

### Extension is enough if we want:

```text
Jev routing
Jev compaction
Jev tools
Jev gates
Jev commands
Jev skill discovery
Jev orchestration
```

The existing ecosystem already demonstrates this.

### Core modification becomes justified when we want:

```text
DecisionState
        ↓
DecisionEngine
        ↓
agent state transitions
        ↓
adaptive reasoning
        ↓
adaptive model allocation
        ↓
strategy control
        ↓
verification
        ↓
semantic context management
```

That's the threshold.

---

# 12. I would therefore NOT fork Pi in the traditional sense

This is an important nuance.

I wouldn't make:

> `ravi/pi`

and start hacking 70% of the source.

I'd create something conceptually like:

```text
pi-mono
   │
   ├── upstream-compatible foundation
   │
   └── decision-runtime layer
```

And keep our modifications concentrated around:

```text
core/
  agent/
    decision-engine/
    decision-state/
    decision-policy/
    decision-telemetry/

  models/
    routing/

  tools/
    preflight/

  compaction/
    semantic-state/

  verification/
```

The UI, provider implementations, session persistence, tools, MCP, etc. should remain as close to upstream as possible.

---

# 13. The key abstraction

I would make this the central architectural contract:

```typescript
interface DecisionEngine {
  decide<T>(
    question: DecisionQuestion<T>,
    state: DecisionState,
  ): Promise<Decision<T>>;
}
```

Then:

```text
DecisionEngine
       │
       ├── DeterministicDecisionEngine
       │
       ├── JevDecisionEngine
       │
       ├── CachedDecisionEngine
       │
       └── FallbackDecisionEngine
```

And **never** scatter:

```typescript
jev.ask(...)
```

through Pi.

Instead:

```typescript
decisionEngine.decide(...)
```

The runtime doesn't care whether the answer came from:

- a hard-coded rule
- cache
- Jev
- another System One model
- a future local model

That is what I mean by changing Pi's "DNA."

---

# 14. The architecture I would actually build

```text
                         USER
                           │
                           ▼
                  ┌─────────────────┐
                  │ Task Fingerprint│
                  └────────┬────────┘
                           │
                           ▼
                 ┌──────────────────┐
                 │  Decision Engine │
                 └────────┬─────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
           Routing       Risk       Scope
              │           │           │
              └───────────┼───────────┘
                          ▼
                     Main LLM
                          │
                          ▼
                   Proposed action
                          │
                          ▼
                 deterministic policy
                          │
                    ┌─────┴─────┐
                    │           │
                  reject      execute
                                │
                                ▼
                            Tool result
                                │
                                ▼
                        State extraction
                                │
                                ▼
                       DecisionState update
                                │
                    meaningful transition?
                           /          \
                         no            yes
                         │              │
                      continue         Jev
                                        │
                         ┌──────────────┼──────────────┐
                         ▼              ▼              ▼
                      continue       escalate       change
                                                     strategy
                         │              │              │
                         └──────────────┼──────────────┘
                                        ▼
                                  Verification
                                        │
                                        ▼
                                       DONE
```

That is the product I would build.

---

# 15. One more thing: we should benchmark before committing to the fork

I would **not immediately rewrite Pi**.

Build a benchmark harness first:

```text
                   Same tasks
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Vanilla       pi-jev       Our runtime
          │            │            │
          └────────────┼────────────┘
                       ▼
                  measurements
```

Measure:

### Quality

- task success
- tests passing
- regression rate
- unnecessary edits
- recovery from failures

### Cost

- input tokens
- output tokens
- Jev calls
- total $
- expensive-model calls

### Latency

- time-to-first-action
- time-to-completion
- Jev overhead
- model escalation overhead

### Agent efficiency

- tool calls
- retries
- repeated reads
- failed approaches
- context compactions

### Decision quality

- routing accuracy
- escalation precision
- completion precision
- stall detection
- compaction retention quality

Then we can answer scientifically:

> **Does our additional control intelligence actually improve the agent enough to justify the complexity?**

---

# My final assessment

I'd score the _architectural opportunity_ like this, without ranking political choices or anything similar:

| Approach                                   | Engineering value for our goal      |
| ------------------------------------------ | ----------------------------------- |
| Vanilla Pi                                 | Foundation                          |
| Pi + existing pi-jev                       | Excellent practical Jev integration |
| Our extension on Pi                        | Good intermediate experiment        |
| **Pi fork + DecisionEngine/DecisionState** | **Potentially transformative**      |
| Rewrite coding agent from scratch          | Unnecessary risk                    |

The sweet spot is **the fourth**.

But there's a crucial condition:

> **Don't fork to add Jev features. Fork to change how Pi thinks about agent execution.**

If all we ultimately implement is:

```text
routing + compaction + tool routing + gates
```

then **stay upstream and use extensions**.

If we implement:

```text
DecisionState
+
DecisionEngine
+
adaptive reasoning budget
+
state-transition control
+
adaptive model escalation
+
strategy/retry control
+
semantic compaction
+
decision telemetry/feedback
```

then **yes, modifying Pi's core is justified**.

And I would deliberately keep Jev behind the abstraction. TypeSafe describes Jev as an early-access System One model and makes strong speed/cost claims that we should benchmark ourselves rather than architecturally depend on. ([TypeSafe AI][4])

**In other words:**

> **pi-jev makes Pi Jev-aware.
> We should make Pi decision-aware.
> Jev just happens to be our first—and currently very compelling—DecisionEngine.**

That is a much stronger project than `pi-jev++`.

[1]: https://github.com/iefnaf/pi-jev?utm_source=chatgpt.com "GitHub - iefnaf/pi-jev: Pi extension suite powered by Jev: selective context compaction and model routing · GitHub"
[2]: https://github.com/TheoOliveira/pi-jev?utm_source=chatgpt.com "GitHub - TheoOliveira/pi-jev: Semantic tool routing and typed System One decisions for the Pi coding agent using TypeSafe Jev · GitHub"
[3]: https://github.com/fivewillow/badlogic-pi-mono/blob/main/packages/coding-agent/docs/extensions.md?utm_source=chatgpt.com "badlogic-pi-mono/packages/coding-agent/docs/extensions.md at main · fivewillow/badlogic-pi-mono · GitHub"
[4]: https://typesafe.ai/blog/introducing-system-one-models-and-jev?utm_source=chatgpt.com "Introducing System One Models & Jev - TypeSafe AI Blog"
[5]: https://github.com/ai-cre/pi-mono/blob/main/packages/coding-agent/docs/compaction.md?utm_source=chatgpt.com "pi-mono/packages/coding-agent/docs/compaction.md at main · ai-cre/pi-mono · GitHub"

Yes — **I think there is a real case for forking Pi and changing its core architecture**, but only if our goal is substantially broader than “Pi + Jev.”

After looking at the current `pi-jev` implementation, I would **not** try to beat it by building a better extension. I would change the problem we are solving.

The important distinction is:

> **pi-jev adds Jev capabilities to Pi. We should make Pi itself a decision-driven agent runtime where Jev is a native System-1 control plane.**

That is a materially different architecture.

## 1. First: pi-jev is much better than I initially gave it credit for

The current `pi-jev` is already fairly sophisticated.

It has:

- Jev-based selective compaction
- per-turn model routing
- confidence thresholds
- cheap/strong model targets
- batching of Jev requests
- fallback to native Pi behavior
- configuration hierarchy
- offline tests
- an explicit rule that Jev failures must not break Pi
- a `session_before_compact` integration
- routing through `before_agent_start`

For compaction specifically, it asks Jev whether tool calls should be kept, whether results should remain full, and how stale they are, then reconstructs the retained transcript. ([GitHub][1])

And its routing is already:

> difficulty → confidence → cheap/strong model

rather than blindly asking Jev to route every request. ([GitHub][1])

So **“let's fork Pi because pi-jev is too simplistic” would be the wrong justification.**

It's not simplistic.

The question is whether its _extension boundary_ fundamentally limits what we want to build.

---

# 2. Where our architecture can actually be superior

I see **five major architectural advantages**.

### A. pi-jev is primarily feature integration

Its architecture is essentially:

```text
                 Pi
                  │
        ┌─────────┴─────────┐
        │                   │
   before_agent_start   before_compact
        │                   │
      Jev                  Jev
        │                   │
     routing             retention
```

That's excellent for adding Jev to Pi without touching Pi.

But the architecture we're discussing is closer to:

```text
                         Pi Agent Runtime
                                │
                    ┌───────────┴───────────┐
                    │                       │
              Agent State              Decision State
                    │                       │
                    └───────────┬───────────┘
                                │
                       Decision Engine
                                │
                 ┌──────────────┼──────────────┐
                 │              │              │
              Routing         Tools        Context
                 │              │              │
              Retry          Safety       Compaction
                 │              │              │
             Strategy        Progress      Memory
                 │              │              │
                 └──────────────┼──────────────┘
                                │
                           Main LLM
```

The difference is important.

**Jev isn't a feature anymore.**

It's part of the agent's control architecture.

---

# 3. The biggest opportunity: persistent semantic state

This is where I think we can beat pi-jev substantially.

pi-jev routing evaluates the **current prompt**, and its own documentation explicitly says routing uses the prompt rather than the full conversation history. ([GitHub][1])

That's sensible for an extension.

But an autonomous coding agent needs something richer:

```typescript
interface DecisionState {
  task: {
    intent: string;
    complexity: number;
    risk: number;
    scope: "local" | "repo" | "system";
  };

  repository: {
    relevantAreas: string[];
    architecture: string[];
    activeFiles: string[];
    tests: string[];
  };

  execution: {
    phase: "understand" | "implement" | "test" | "debug" | "verify";
    progress: number;
    failures: number;
    retries: number;
    strategyChanges: number;
  };

  context: {
    criticalFacts: string[];
    decisions: string[];
    constraints: string[];
    unresolvedQuestions: string[];
  };

  model: {
    current: string;
    requiredCapability: string;
    confidence: number;
  };
}
```

Now Jev doesn't repeatedly have to rediscover:

> "What are we doing?"

It gets:

> "Here is the current semantic state. Make these bounded decisions."

That's much closer to how I think a **System-1 agent runtime** should work.

TypeSafe's own architectural material describes System One as something intended to sit inside larger software systems and make discrete, composable decisions rather than replace the whole system. ([TypeSafe AI][2])

That maps extremely well to this architecture.

---

# 4. We should NOT call Jev after every event

This is probably the most important correction to our original idea.

A naïve fork would become:

```text
user
 ↓
Jev
 ↓
LLM
 ↓
tool
 ↓
Jev
 ↓
tool
 ↓
Jev
 ↓
LLM
 ↓
Jev
 ↓
tool
 ↓
Jev
```

That could actually make Pi **worse**.

Instead:

```text
             ┌───────────────┐
             │ Agent Runtime │
             └───────┬───────┘
                     │
              meaningful state
                 transition
                     │
                     ▼
                   Jev
                     │
              bounded decisions
                     │
                     ▼
               deterministic
                  policy
                     │
                     ▼
                LLM / Tool
```

The rule should be:

> **One Jev invocation per meaningful state transition, not one Jev invocation per event.**

That is something I would make part of the core runtime.

---

# 5. Our routing could be much more sophisticated

pi-jev currently has a three-level difficulty model:

```text
0 → trivial
1 → moderate
2 → complex
```

with confidence thresholds determining whether to use cheap/strong models. ([GitHub][1])

That's useful.

But our router can reason about **capability requirements**, not merely difficulty.

For example:

```text
Task:
"Rename this variable"

→ capability:
  mechanical-edit

→ cheap model
```

versus:

```text
Task:
"Why is this distributed transaction occasionally
duplicating payments?"

→ capabilities:
  distributed-systems
  debugging
  database
  concurrency
  high-risk

→ strong reasoning model
```

Or:

```text
Task:
"Update the README"

→ documentation
→ cheap model
```

while:

```text
"Redesign authentication middleware without breaking
existing sessions"

→ architecture
→ security
→ compatibility
→ multi-file
→ strong model
```

So instead of:

```text
difficulty → model
```

we want:

```text
task
 │
 ├── complexity
 ├── domain
 ├── risk
 ├── scope
 ├── required reasoning
 ├── repository familiarity
 ├── reversibility
 └── verification requirements
             │
             ▼
        model capability
             │
             ▼
           model
```

That can become a genuinely powerful model-selection system.

---

# 6. Tool execution is another huge opportunity

This is where I think a native fork starts becoming much more compelling.

Imagine:

```text
LLM says:

run:
rm -rf ./node_modules
```

Instead of simply:

```text
tool → execute
```

we have:

```text
             proposed tool action
                      │
                      ▼
                deterministic
                 preflight
                      │
              ┌───────┴────────┐
              │                │
            obvious          semantic
             safe             decision
              │                │
              │               Jev
              │                │
              └───────┬────────┘
                      ▼
                  policy
                      │
              ┌───────┴───────┐
              │               │
             allow           deny
```

And crucially:

**Jev doesn't authorize the operation.**

Pi's deterministic security policy remains authoritative.

Jev provides:

> semantic risk classification.

Pi provides:

> actual authorization.

That separation is extremely important.

---

# 7. The agent loop itself becomes smarter

This is probably the strongest argument for a fork.

Today, conceptually:

```text
LLM
 ↓
tool
 ↓
LLM
 ↓
tool
 ↓
LLM
```

Our runtime could become:

```text
                     ┌───────────────┐
                     │  User Task    │
                     └───────┬───────┘
                             │
                             ▼
                      Task fingerprint
                             │
                             ▼
                       Jev routing
                             │
                             ▼
                        Main LLM
                             │
                             ▼
                       Tool proposal
                             │
                             ▼
                      Tool preflight
                             │
                             ▼
                         execute
                             │
                             ▼
                       Tool result
                             │
                             ▼
                     State extraction
                             │
                             ▼
                       ┌─────┴─────┐
                       │           │
                     normal     significant
                       │           │
                       │          Jev
                       │           │
                       └─────┬─────┘
                             ▼
                   continue / retry /
                   change strategy /
                   escalate model /
                   finish
```

Now Jev can answer questions like:

```text
progress:
  advancing

strategy:
  continue

model:
  adequate

retry:
  unnecessary

completion:
  not yet

context:
  retain X, discard Y
```

That's much more powerful than just model routing + compaction.

---

# 8. The real killer feature: adaptive autonomy

This is the part I would build that pi-jev doesn't fundamentally provide.

Imagine Pi recognizes:

```text
Task started
↓
easy
↓
cheap model
```

Then:

```text
3 tools later
↓
unexpected test failure
↓
semantic complexity increased
↓
Jev
↓
escalate model
```

Then:

```text
strong model
↓
fix
↓
tests pass
↓
Jev
↓
verification sufficient
↓
return result
```

Or:

```text
3 failed approaches
↓
Jev
↓
strategy is likely stuck
↓
change strategy
```

Or:

```text
same file edited 5 times
↓
Jev
↓
high oscillation
↓
stop editing
↓
re-read architecture
```

This gives us:

### Adaptive reasoning budget.

The agent doesn't decide its reasoning level once.

It dynamically reallocates reasoning based on what is happening.

That's a much more interesting research/product direction.

---

# 9. Compaction is where our design could also go beyond pi-jev

pi-jev already does selective retention, and quite intelligently. It asks Jev about keeping tool calls, full results, and staleness, batches the requests, and falls back to Pi's normal summary when appropriate. ([GitHub][1])

So we shouldn't try to simply reproduce that.

Instead:

### Make compaction semantic-state aware.

Before:

```text
conversation
 ↓
Jev decides what messages to keep
```

After:

```text
conversation
      │
      ▼
semantic state
      │
 ┌────┼─────────────┐
 │    │             │
facts decisions constraints
 │    │             │
 └────┼─────────────┘
      ▼
compaction
      │
      ▼
new context
```

The most important thing isn't:

> "Which messages should survive?"

It's:

> **"Which information must survive for the agent to continue correctly?"**

That's a subtle but important distinction.

---

# 10. We can make Jev calls themselves adaptive

This could become one of our biggest performance advantages.

Don't do:

```text
every state → Jev
```

Do:

```text
state transition
      │
      ▼
decision value estimator
      │
 ┌────┼─────────┐
 │    │         │
low  medium    high
 │    │         │
code Jev      Jev
```

For example:

### Deterministic

```text
context > hard limit
```

No Jev.

### Deterministic

```text
file doesn't exist
```

No Jev.

### Deterministic

```text
command explicitly denied
```

No Jev.

### Semantic

```text
Is this test failure caused by our change?
```

Jev.

### Semantic

```text
Should we escalate from cheap → strong model?
```

Jev.

### Semantic

```text
Is this tool result still relevant?
```

Jev.

### Semantic

```text
Are we stuck?
```

Jev.

This gives us:

> **Jev as an intelligence budget, not merely a model API.**

That's something I'd absolutely put into the core.

---

# 11. But here's the biggest reason NOT to fork

There is a serious downside.

Pi upstream will continue evolving.

If you fork the repository and modify:

```text
core/
agent/
session/
compaction/
models/
tools/
```

you've created a long-term merge burden.

Every upstream change becomes:

```text
upstream Pi
       +
our modified Pi
       ↓
manual reconciliation
```

And if we modify the fundamental agent loop, merging becomes increasingly difficult.

So if our changes were merely:

- model routing
- compaction
- Jev settings
- tool hooks

I'd say:

> **Don't fork. Use extensions.**

Because pi-jev demonstrates that these can already be done cleanly through Pi's extension architecture. ([GitHub][1])

---

# 12. So when IS the fork justified?

I'd use this test:

| Capability                        | Extension | Core fork |
| --------------------------------- | --------: | --------: |
| Model routing                     |        ✅ |        ❌ |
| Jev compaction                    |        ✅ |        ❌ |
| Tool risk scoring                 |        ✅ |        ❌ |
| `/jev` commands                   |        ✅ |        ❌ |
| Prompt classification             |        ✅ |        ❌ |
| Task fingerprint                  |     Maybe |     Maybe |
| Persistent semantic state         | Difficult |    **✅** |
| Agent-state machine               | Difficult |    **✅** |
| Adaptive reasoning budget         | Difficult |    **✅** |
| Native model escalation           | Difficult |    **✅** |
| Cross-turn decision state         | Difficult |    **✅** |
| Decision-aware context management | Difficult |    **✅** |
| First-class decision telemetry    |     Maybe |    **✅** |
| Jev-aware retry/strategy loop     | Difficult |    **✅** |
| Decision-aware completion         | Difficult |    **✅** |

That's the dividing line.

---

# 13. My recommendation: don't make a "Pi fork"

I'd actually change the conceptual goal.

Don't build:

> **Pi + Jev**

Build:

> **A Jev-native coding-agent runtime derived from Pi.**

That sounds subtle, but it changes engineering decisions.

Pi remains the foundation for:

- terminal UI
- provider abstraction
- sessions
- tools
- MCP
- file operations
- shell execution
- model streaming
- extensions
- configuration
- interaction

But we replace/augment the **agent control plane**.

Something like:

```text
                  Pi Foundation
                       │
       ┌───────────────┴────────────────┐
       │                                │
   Interaction                     Infrastructure
       │                                │
       │                        providers/tools/session
       │                                │
       └──────────────┬─────────────────┘
                      │
              ┌───────▼────────┐
              │ Decision Plane │
              │                │
              │ Jev            │
              │ State          │
              │ Policy         │
              │ Routing        │
              │ Risk           │
              │ Progress       │
              │ Retry          │
              │ Verification   │
              │ Context        │
              └───────┬────────┘
                      │
               ┌──────▼──────┐
               │ Reasoning   │
               │ Models      │
               └─────────────┘
```

That's the architecture I'd pursue.

---

# 14. And I would make one very important architectural decision

**Do not hard-code Jev everywhere.**

Instead:

```typescript
interface DecisionEngine {
  decide<T>(
    question: DecisionQuestion<T>,
    state: DecisionState,
  ): Promise<Decision<T>>;
}
```

Then:

```text
DecisionEngine
      │
      ├── JevDecisionEngine
      ├── HeuristicDecisionEngine
      ├── MockDecisionEngine
      └── FutureDecisionEngine
```

Pi's core becomes aware of **decisions**, not Jev.

That gives us:

```text
Pi Core
   │
   ▼
DecisionEngine
   │
   ├── deterministic fast path
   │
   ├── cache
   │
   ├── Jev
   │
   └── fallback
```

That is the part I'd consider "baking into Pi's DNA."

Not:

```typescript
await jev.ask(...)
```

scattered throughout the source.

---

# 15. There's also a very interesting future possibility

Once you have:

```text
DecisionState
+
DecisionEngine
+
DecisionTelemetry
```

you can start measuring whether your agent's decisions were actually useful.

For every Jev decision:

```json
{
  "decision": "escalate_model",
  "confidence": 0.91,
  "action": "strong",
  "cost": 0.0004,
  "latencyMs": 83,
  "outcome": {
    "testsPassed": true,
    "retries": 0,
    "tokensSaved": 18400
  }
}
```

Now we can eventually learn:

```text
Jev decision
      ↓
actual outcome
      ↓
decision quality
      ↓
policy adjustment
```

That's where your `/jev-engineering` concept becomes particularly interesting.

The system could discover:

> "For TypeScript single-file changes under 200 LOC, Jev routing almost never changes the outcome."

Therefore:

```text
bypass Jev
```

But:

> "For multi-package refactors, Jev escalation prevents expensive failed attempts."

Therefore:

```text
invoke Jev
```

Now we're not merely integrating an AI model.

We're building an **adaptive control system around an agent**.

---

# 16. My verdict on the fork

I'd put it this way:

### If your goal is:

> "I want Pi to use Jev for routing and smarter compaction."

**Don't fork.**

`pi-jev` already proves that this can be done cleanly through extensions. ([GitHub][1])

### If your goal is:

> "I want to build the next generation of coding-agent runtime where cheap semantic intelligence continuously controls expensive generative reasoning."

**Yes. Fork Pi.**

Because then the extension model starts fighting the architecture.

You need semantic state and decision points **inside the agent loop**, rather than attaching Jev to lifecycle hooks.

---

# 17. And I think your project has a particularly good reason to do this

You're not trying to build another coding-agent UI.

You're trying to optimize this equation:

```text
Agent capability
────────────────────────
LLM tokens + latency + cost
```

Jev gives us an interesting third primitive:

```text
Traditional software
        +
cheap semantic decisions
        +
expensive generative reasoning
```

TypeSafe itself frames System One around embedding typed AI decisions inside conventional software rather than treating the model as the whole application. ([TypeSafe AI][3])

That philosophy aligns unusually well with a coding-agent runtime.

So I would **not compete with pi-jev feature-for-feature**.

I'd treat pi-jev as evidence that the basic integration works, then go one architectural layer deeper.

---

## The architecture I'd now recommend

```text
                       USER
                         │
                         ▼
                 ┌───────────────┐
                 │ Task Analyzer │
                 └───────┬───────┘
                         │
                    Task Fingerprint
                         │
                         ▼
                 ┌───────────────┐
                 │ Decision Plane│◄──────────────┐
                 └───────┬───────┘               │
                         │                       │
              ┌──────────┼──────────┐            │
              ▼          ▼          ▼            │
           Routing      Risk      Strategy        │
              │          │          │             │
              └──────────┼──────────┘             │
                         ▼                        │
                    Main LLM                     │
                         │                        │
                         ▼                        │
                  Tool / Action                   │
                         │                        │
                         ▼                        │
                   Tool Result                    │
                         │                        │
                         ▼                        │
                  State Update ───────────────────┘
                         │
                  significant transition
                         │
                         ▼
                       Jev
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           continue    escalate    retry
              │          │          │
              └──────────┼──────────┘
                         ▼
                    Verification
                         │
                         ▼
                       DONE
```

And **compaction sits underneath this entire system**, consuming `DecisionState` rather than trying to reconstruct the agent's intent solely from raw transcript messages.

### That's the part worth forking for.

The fork should therefore be **small at first but architectural**: introduce `DecisionEngine`, `DecisionState`, and decision boundaries into the core; leave most of Pi untouched. Then progressively move routing → progress → retry → verification → context management behind those abstractions.

That gives us a much better chance of retaining upstream Pi compatibility than immediately rewriting the agent loop, while still establishing the "new DNA" we're after.

[1]: https://github.com/iefnaf/pi-jev "GitHub - iefnaf/pi-jev: Pi extension suite powered by Jev: selective context compaction and model routing · GitHub"
[2]: https://docs.typesafe.ai/patterns?utm_source=chatgpt.com "Patterns - TypeSafe AI - Introduction"
[3]: https://typesafe.ai/?utm_source=chatgpt.com "TypeSafe AI: Home"
