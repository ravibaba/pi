---
name: jev-engineering
description: Guide and workflows for maintaining, calibrating, and optimizing Pi's Jev System-1 decision substrate, question bundles, and deterministic policies.
---

# Jev System-1 Engineering & Self-Improvement Guide

## Core Principles
1. **Decision Independence**: Generative LLMs write code and reason; Jev makes bounded semantic evaluations; deterministic code enforces hard safety and executes tools.
2. **Deterministic Precedence**: When Jev disagrees with deterministic policy or fails closed, deterministic code is always authoritative.
3. **Budget Gating**: One Jev evaluation per meaningful state transition, never per raw stream token or event.
4. **No Transcript Bloat**: Always serialize `DecisionState` through `serializeDecisionStateForJev()`. Never dump raw conversation transcripts into Jev requests.

## Self-Improvement Workflow

```text
┌────────────────────────┐      ┌────────────────────────┐
│  Telemetry Harvesting  │ ───> │ Question Calibration   │
│  (DecisionTelemetry)   │      │ (question-registry.ts) │
└────────────────────────┘      └───────────┬────────────┘
                                            │
                                            ▼
┌────────────────────────┐      ┌────────────────────────┐
│ Benchmark Verification │ <─── │   Threshold Tuning     │
│ (benchmarks/jev/runner)│      │    (thresholds.ts)     │
└────────────────────────┘      └────────────────────────┘
```

### 1. Telemetry Harvesting
Inspect closed-loop prediction outcomes recorded by `DecisionTelemetry`:
- Accuracy of task tier predictions vs actual model escalations or user overrides.
- Accuracy of tool risk assessments vs executed command outcomes.
- Frequency of false-positive stall detections.

### 2. Question Prompt & Criteria Calibration
Edit question bundles in [question-registry.ts](file:///Users/ravi/Desktop/PI-JEV/pi/packages/coding-agent/src/core/decision/question-registry.ts):
- For `choice` questions: refine criterion descriptions to sharpen semantic boundaries.
- For `noul` questions: formulate instructions as precise binary verification hypotheses.
- For `score` questions: ensure the legend scale is strictly ordinal and unambiguous.

### 3. Threshold Tuning
Adjust policy thresholds in [thresholds.ts](file:///Users/ravi/Desktop/PI-JEV/pi/packages/coding-agent/src/core/decision/thresholds.ts):
- `routingConfidence` (default: `0.85`): Raise to make tier switching more conservative.
- `destructiveRisk` (default: `0.75`): Lower to require user confirmation on broader destructive candidates.
- `stallProbability` (default: `0.75`): Lower if agent frequently loops without intervention; raise if premature interventions occur.

### 4. Regression & Benchmark Verification
Before committing any question or threshold changes:
1. Run benchmark suite:
   ```bash
   node benchmarks/jev/runner.ts
   ```
2. Run decision test suite:
   ```bash
   node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run packages/coding-agent/test/decision/
   ```
3. Run monorepo checks:
   ```bash
   npm run check
   ```
