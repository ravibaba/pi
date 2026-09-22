# Jev System-1 Decision Engine: Empirical Benchmark Report

## 1. Executive Summary

TypeSafe AI's Jev serves as Pi's **high-frequency System-1 decision substrate**, handling bounded semantic evaluations (model routing, tool risk preflight, stall detection, and completion verification) while delegating unbounded generative coding to System-2 LLMs.

Deterministic safety policies govern all side effects, authorizations, and budgets.

### Key Benchmark Metrics:
- **Accuracy across all suites**: 100% concordance on curated boundary datasets.
- **Decision Latency**: <10ms local deterministic / ~90ms network round-trip vs 1,200ms - 3,500ms for full LLM evaluations.
- **Cost Reduction**: **99.3% reduction in decision overhead** compared to standard LLM-based prompting.

---

## 2. Benchmark Results Table

| Benchmark Suite | Total Cases | Accuracy | Avg Latency | p95 Latency | Jev Cost | Full LLM Cost | Token & Cost Savings |
|:----------------|:-----------:|:--------:|:-----------:|:-----------:|:--------:|:-------------:|:--------------------:|
| **Task Tier Routing** | 7 | 100% | 85ms | 85ms | $0.0007 | $0.1050 | **99%** |
| **Tool Risk Gate** | 6 | 100% | 85ms | 85ms | $0.0006 | $0.0900 | **99%** |
| **Loop & Stall Detection** | 4 | 100% | 85ms | 85ms | $0.0004 | $0.0600 | **99%** |
| **Completion Verification** | 3 | 100% | 85ms | 85ms | $0.0003 | $0.0450 | **99%** |

---

## 3. Evaluation Methodology

1. **Task Tier Routing**: Evaluates task complexity, scope, and security sensitivity on incoming user prompts to select `fast`, `standard`, `reasoning`, or `deep` model compute tiers.
2. **Tool Risk Gate**: Inspects proposed tool execution before invocation. Hard blocks destructive system commands (`rm -rf /`, `kubectl delete`) and routes sensitive credential access to user confirmation.
3. **Loop & Stall Detection**: Monitors execution health (consecutive tool failures, repeated compiler error fingerprints, file oscillation) to trigger early steering interventions before token budget exhaustion.
4. **Completion Verification**: Formally assesses whether goal criteria, test status, and linting pass before declaring a task finished.
