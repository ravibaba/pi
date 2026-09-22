# Deterministic Safety & Routing Policies

This document specifies the deterministic policies implemented in [decision-policy.ts](file:///Users/ravi/Desktop/PI-JEV/pi/packages/coding-agent/src/core/decision/decision-policy.ts).

## 1. Tool Risk Policy

The tool risk policy calculates a composite risk score and checks hard boundary conditions before authorizing any tool invocation:

### Composite Risk Formula
$$\text{Score} = (\text{destructive} \times 2.0) + (\text{credentialAccess} \times 2.5) + (\text{networkExfiltration} \times 1.5) + (\text{productionImpact} \times 3.0) + \left(\frac{\text{scopeViolation}}{3} \times 1.5\right)$$

### Rules:
1. **Hard Block**: If $\text{productionImpact} \ge 0.85$ or $\text{destructive} \ge 0.90$ or $\text{Score} \ge 4.0$, execution is immediately blocked.
2. **User Confirmation Required**:
   - If $\text{credentialAccess} \ge 0.20$
   - If $\text{destructive} \ge 0.75$
   - If $\text{networkExfiltration} \ge 0.60$
   - If $\text{scopeViolation} \ge 3$
3. **Allow**: Otherwise authorized to proceed.

---

## 2. Model Tier Routing Policy

Selects the model compute tier for a task based on semantic complexity and confidence:

| Tier | Default Capabilities | Criteria |
|:-----|:---------------------|:---------|
| `fast` | Typo fixes, comments, minor renames | Complexity score 1, confidence $\ge 0.85$ |
| `standard` | Typical feature updates, clear unit tests | Complexity score 2-3, confidence $\ge 0.85$ |
| `reasoning` | Deep debugging, race conditions, architecture | Complexity score 4, confidence $\ge 0.85$ |
| `deep` | Formal verification, cross-repo restructuring | Complexity score 5, confidence $\ge 0.85$ |

*Fallback Rule*: If confidence is below `routingConfidence` (default: 0.85), maintain the current or default tier.

---

## 3. Strategy & Stall Policy

Monitors progress across turns to break infinite loops:

1. If $\text{stalledProbability} \ge 0.75$, force $\text{action} = \text{"change\_strategy"}$.
2. If repeated identical error fingerprints occur $\ge 2$ times, flag stall and inject surgical steering.
3. If the same file is modified $\ge 3$ times without passing verification, flag file oscillation.
