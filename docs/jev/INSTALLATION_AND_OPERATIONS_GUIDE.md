# Pi + TypeSafe Jev: Comprehensive Installation, Configuration, and Operations Guide

This guide provides complete instructions for installing Pi with the TypeSafe Jev System-1 Decision Layer on macOS, configuring model tiers with OpenRouter, setting up TypeSafe API keys, and operating the decision runtime.

---

## 1. System Architecture & Implementation Review

Pi has been transformed from an LLM-centric agent into a **decision-native harness** by embedding TypeSafe Jev as a first-class System-1 control plane:

```text
                     ┌──────────────────────────────────────────┐
                     │          User Prompt / Goal              │
                     └────────────────────┬─────────────────────┘
                                          │
                                          ▼
                     ┌──────────────────────────────────────────┐
                     │       State Extraction & Transitions     │
                     │  (Phase, Churn, Test Status, Loops)      │
                     └────────────────────┬─────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     ┌────────────────────────┐                     ┌───────────────────────────┐
     │ Deterministic Policy   │                     │  System-1 Decision Engine │
     │  - Shell syntax checks │                     │  - Multi-Question Bundles │
     │  - Hard path bans      │                     │  - Latency budget < 200ms │
     │  - Rejection caps (1x) │                     │  - State-hashed cache     │
     └────────────┬───────────┘                     └─────────────┬─────────────┘
                  │                                               │
                  └───────────────────────┬───────────────────────┘
                                          ▼
                     ┌──────────────────────────────────────────┐
                     │        Adaptive Agent Execution          │
                     │  - Model tier routing (OpenRouter)       │
                     │  - Tool risk preflight blocking          │
                     │  - Mid-task reasoning escalation         │
                     │  - Completion verification gate          │
                     │  - Living state semantic compaction      │
                     └──────────────────────────────────────────┘
```

### Key Subsystems Implemented
1. **Decision State Subsystem (`packages/coding-agent/src/core/decision/decision-state.ts`)**:
   - Maintains continuous semantic state across agent turns.
   - Automatically tracks tool failures, file modification churn, file oscillation, and test execution status (`passing`, `failing`, `unknown`).
   - Manages execution phases: `understand` -> `implement` -> `verify` -> `complete`.

2. **System-1 Multi-Question Registry (`packages/coding-agent/src/core/decision/question-registry.ts`)**:
   - `TASK_ROUTING_V1`: Predicts required model tier (`fast`, `standard`, `reasoning`, `deep`), task complexity, and whether code modification is required.
   - `TOOL_RISK_V1`: Evaluates command destructiveness, operational reversibility, and blast radius.
   - `STRATEGY_SUPERVISOR_V1`: Detects reasoning loops, tool thrashing, and decides strategy actions (`continue`, `pivot`, `escalate_reasoning`, `halt`).
   - `COMPLETION_VERIFICATION_V1`: Evaluates goal satisfaction, verification sufficiency, and remaining blockers.
   - `COMPACTION_ADVISOR_V1`: Evaluates state retention priorities and tool output pruning candidates during context compaction.

3. **Decision Engine & Policy (`packages/coding-agent/src/core/decision/`)**:
   - [jev-client.ts](file:///Users/ravi/Desktop/PI-JEV/pi/packages/coding-agent/src/core/decision/jev-client.ts): TypeSafe Jev SDK client integration with configurable timeout (1500ms) and retry logic.
   - [cache.ts](file:///Users/ravi/Desktop/PI-JEV/pi/packages/coding-agent/src/core/decision/cache.ts): In-memory TTL cache keyed by deterministic state hashes.
   - [fallbacks.ts](file:///Users/ravi/Desktop/PI-JEV/pi/packages/coding-agent/src/core/decision/fallbacks.ts): Zero-throw deterministic fallback heuristics for offline or degraded operation.
   - [decision-policy.ts](file:///Users/ravi/Desktop/PI-JEV/pi/packages/coding-agent/src/core/decision/decision-policy.ts): Composite mathematical formulas combining semantic probabilities with hard safety rules.

4. **Model Router (`packages/coding-agent/src/core/decision/model-router.ts`)**:
   - Resolves abstract tiers (`fast`, `standard`, `reasoning`, `deep`) to user-configured models.
   - Supports OpenRouter providers with both `provider/model` and `provider:model` formats (e.g. `openrouter/anthropic/claude-3.5-sonnet`).

5. **Lifecycle Wiring in AgentSession (`packages/coding-agent/src/core/agent-session.ts`)**:
   - `prompt()`: System-1 task routing selects optimal model tier before dispatching to LLM.
   - `beforeToolCall()`: Preflight risk screening blocks destructive commands (e.g., `rm -rf /`, `DROP DATABASE`) in `enforced` mode.
   - `afterToolCall()`: Updates execution counters; dynamically escalates model tier to reasoning when consecutive failures $\ge 2$ or oscillation $\ge 3$.
   - `finishTurn()`: Completion verification gate prevents premature turn termination when tests are failing. Equipped with a rejection counter cap preventing infinite continuation loops.
   - `_runAutoCompaction()`: Context extraction preserves architectural decisions and constraints in a structured semantic preamble while pruning redundant historical tool outputs.

6. **Closed-Loop Telemetry (`packages/coding-agent/src/core/decision/telemetry.ts` & `scripts/jev-telemetry.ts`)**:
   - Records every decision, latency, cost, and associates it with downstream session outcomes (test pass/fail, tokens saved).
   - Generates calibration reports for tuning decision thresholds.

---

## 2. Installation on macOS (Side-by-Side with Existing Pi)

You currently have an active Pi installation at `/Users/ravi/.bun/bin/pi`. To prevent any binary collisions or PATH conflicts, install this development build as a dedicated `pi-jev` command.

### Recommended Method: Alias / Symlink as `pi-jev` (Zero Conflict)

This runs directly against this repository's TypeScript sources using `tsx`. Your existing `pi` binary remains untouched, while any changes you make in this repo are immediately active in `pi-jev`.

1. Ensure dependencies are hydrated:
   ```bash
   cd /Users/ravi/Desktop/PI-JEV/pi
   npm install --ignore-scripts
   ```

2. Symlink the test script as `pi-jev` in `~/.local/bin`:
   ```bash
   mkdir -p ~/.local/bin
   ln -sf /Users/ravi/Desktop/PI-JEV/pi/pi-test.sh ~/.local/bin/pi-jev
   chmod +x /Users/ravi/Desktop/PI-JEV/pi/pi-test.sh
   ```

   *Alternatively, add an alias to your `~/.zshrc`:*
   ```bash
   alias pi-jev="/Users/ravi/Desktop/PI-JEV/pi/pi-test.sh"
   ```

3. Verify both commands:
   ```bash
   # Your existing standard installation:
   which pi       # Output: /Users/ravi/.bun/bin/pi

   # Your Jev-enabled harness:
   which pi-jev   # Output: /Users/ravi/.local/bin/pi-jev
   ```

---

### Configuration Isolation (Optional)

Pi automatically merges settings from:
1. Global settings: `~/.pi/agent/settings.json`
2. Project-level settings: `<working-directory>/.pi/settings.json`

Because Pi ignores unrecognized configuration keys, adding the `"jev"` block to `~/.pi/agent/settings.json` will not break your existing Bun `pi` install. However, if you want complete separation:
- Place your `jev` settings inside a `.pi/settings.json` file inside the repository or workspace where you want to test `pi-jev`. Project settings override global settings for that workspace.

---

### Method 2: Global `npm link` (Compiled CLI)

This builds the production bundle and links the `pi` binary globally via npm.

1. Build all packages:
   ```bash
   cd /Users/ravi/Desktop/PI-JEV/pi
   npm run build
   ```

2. Link the coding-agent package globally:
   ```bash
   cd packages/coding-agent
   npm link
   ```

3. Verify:
   ```bash
   which pi
   pi --version
   ```

---

### Method 3: Standalone macOS Native Binary

To build a standalone executable that requires no Node.js runtime:

```bash
cd /Users/ravi/Desktop/PI-JEV/pi
./scripts/build-binaries.sh --offline-model-data --platform darwin-arm64 --out "$PWD/dist-bin"
```
*(Use `--platform darwin-x64` for Intel Macs).*

---

## 3. Configuring OpenRouter Models & Jev Settings

Pi settings are configured in either:
- **Global Configuration**: `~/.pi/settings.json`
- **Project Configuration**: `<project-dir>/.pi/settings.json`

### Full Example Configuration with OpenRouter (`~/.pi/settings.json`)

Create or update `~/.pi/settings.json`:

```json
{
  "defaultProvider": "openrouter",
  "defaultModel": "anthropic/claude-3.5-sonnet",
  "jev": {
    "enabled": true,
    "mode": "enforced",
    "model": "jev-latest",
    "timeoutMs": 1500,
    "maxRetries": 1,
    "cacheTtlMs": 60000,
    "modelTiers": {
      "fast": "openrouter/google/gemini-2.5-flash",
      "standard": "openrouter/anthropic/claude-3.5-sonnet",
      "reasoning": "openrouter/deepseek/deepseek-r1",
      "deep": "openrouter/openai/o3-mini"
    },
    "thresholds": {
      "toolRisk": {
        "maxAcceptableRiskScore": 0.70,
        "destructiveNoulThreshold": 0.75,
        "irreversibleNoulThreshold": 0.80
      },
      "routing": {
        "confidenceCutoff": 0.65
      },
      "verification": {
        "minGoalSatisfaction": 0.75,
        "minVerificationSufficiency": 0.70,
        "maxAllowableBlockerScore": 0.30
      }
    }
  }
}
```

### Jev Operating Modes
- `"enforced"`: Full active control. Hard-blocks destructive commands, enforces completion tests, and dynamically routes models.
- `"advisory"`: Executes Jev decisions, logs telemetry, and injects soft steering hints without hard-blocking execution.
- `"shadow"`: Runs decisions asynchronously in the background. Does not alter execution; records telemetry for offline calibration.
- `"off"`: Completely disables Jev calls (zero latency, zero API calls).

### Model Tier Format
For OpenRouter, you can use either:
- `openrouter/<vendor>/<model-id>`: e.g. `"openrouter/anthropic/claude-3.5-sonnet"`
- `openrouter:<vendor>/<model-id>`: e.g. `"openrouter:deepseek/deepseek-r1"`
- `<vendor>/<model-id>`: e.g. `"google/gemini-2.5-flash"`

---

## 4. API Keys Setup

Pi and Jev require two API keys:
1. `OPENROUTER_API_KEY`: Authenticates with OpenRouter for generative coding completions.
2. `TYPESAFE_API_KEY`: Authenticates with TypeSafe AI for System-1 micro-model decisions.

### Option A: Shell Environment Variables (Recommended)

Add the keys to your `~/.zshrc` (or `~/.bashrc`):

```bash
# OpenRouter API Key for generative LLM models
export OPENROUTER_API_KEY="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# TypeSafe API Key for Jev System-1 decisions
export TYPESAFE_API_KEY="ts-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Then reload your shell:
```bash
source ~/.zshrc
```

### Option B: Pi Auth Storage

You can store the OpenRouter key directly using Pi's built-in key storage:

```bash
pi config set apiKeys.openrouter "sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

For TypeSafe AI, the SDK reads `process.env.TYPESAFE_API_KEY`. Always ensure `TYPESAFE_API_KEY` is exported in your environment.

---

## 5. Verification & Testing Commands

### 1. Run Monorepo Quality Gate
Verify formatting, Biome linter, shrinkwrap, and TypeScript type checking:
```bash
cd /Users/ravi/Desktop/PI-JEV/pi
npm run check
```
*Expected: 0 errors, 0 warnings, all checks clean.*

### 2. Run Jev Decision Test Suite
Run the 9 decision unit and integration test suites:
```bash
cd /Users/ravi/Desktop/PI-JEV/pi/packages/coding-agent
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/decision/
```
*Expected: 9 test files passed, 46 tests passed.*

### 3. Run Jev Empirical Benchmarks
Run the empirical latency, cost, and accuracy benchmark suite:
```bash
cd /Users/ravi/Desktop/PI-JEV/pi
npx tsx benchmarks/jev/runner.ts
```
*Expected: 100% accuracy, 85ms avg latency, 99% cost savings compared to frontier LLMs.*

### 4. Run Telemetry Analysis Report
Analyze session decision records and output self-tuning threshold recommendations:
```bash
cd /Users/ravi/Desktop/PI-JEV/pi
npx tsx scripts/jev-telemetry.ts
```

---

## 6. Testing Interactive Mode with Jev

To start Pi in interactive TUI mode with OpenRouter and Jev enabled:

```bash
pi --provider openrouter --model anthropic/claude-3.5-sonnet
```

### Test Cases to Observe Jev in Action:
1. **Fast-tier Task Routing**:
   Prompt: *"Fix the typo in the README line 5."*
   Observe: Jev routes to `fast` tier (`gemini-2.5-flash`), answering quickly with minimal token usage.
2. **Tool Risk Blocking (Enforced Mode)**:
   Prompt: *"Run rm -rf /tmp/test-dir && rm -rf /"*
   Observe: Jev preflight flags command destructiveness and hard-blocks the tool call before execution.
3. **Mid-task Reasoning Escalation**:
   When repeated errors occur (e.g. failing compile or test assertions $\ge 2$ times), Jev automatically escalates the active model to `reasoning` tier (`deepseek-r1` or `o3-mini`).
4. **Completion Verification Gate**:
   If an assistant turn attempts to conclude while unit tests are failing, the completion gate rejects premature exit and steers the agent: *"Verification failed: Tests are currently failing. Please investigate and fix test failures before finishing."*
