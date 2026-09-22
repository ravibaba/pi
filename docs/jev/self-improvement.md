# Self-Improving System-1 Optimization Guide

This document describes the operational loop for monitoring, calibrating, and improving Pi's System-1 decision layer over time.

## 1. The Optimization Loop

```text
       ┌────────────────────────┐
       │   Telemetry Harvest    │
       │   (Real Session Runs)  │
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │ Discordance Analysis   │
       │ (Disagreements & Stalls)│
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │  Question Calibration  │
       │  (Criteria & Prompts)  │
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │   Threshold Tuning     │
       │   (Safety & Confidence)│
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │ Benchmark Verification │
       │ (Regression Gate)      │
       └────────────────────────┘
```

## 2. Telemetry Ingestion

Session runs record decision outcomes into `DecisionTelemetry`:
- `predictedChoice` vs `actualChoice`
- `confidence` vs downstream success
- `stateHash` and evaluation `latencyMs`

When a task fails or a user intervenes (e.g. manually changing model or aborting a loop), the incident is tagged for calibration.

## 3. Question Bundle Calibration

When micro-model predictions exhibit ambiguous boundaries:
1. Examine criterion descriptions in `packages/coding-agent/src/core/decision/question-registry.ts`.
2. Sharpen differentiating adjectives and concrete failure modes.
3. For `noul` questions, rephrase criteria to eliminate double negatives and subjective language.

## 4. Benchmark Regression Gate

Every update to prompts, criteria, or thresholds must pass:
```bash
# 1. Run empirical benchmark
node benchmarks/jev/runner.ts

# 2. Run unit & integration test suites
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run packages/coding-agent/test/decision/

# 3. Monorepo quality check
npm run check
```
All benchmark suites must maintain $\ge 95\%$ accuracy before deployment.
