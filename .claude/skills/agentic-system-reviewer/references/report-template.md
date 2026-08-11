# Report Template

Use this structure for final reviews. Keep it findings-first unless there are no issues.

Saved reports:
- Standalone deliverable requested by the user: `docs/agentic-system-review-<slug>.md`.
- Project-bound review for something being built or handed off: `workspace/<project>/agentic-system-review.md`.
- Conversation-only review: no file required; include `Scope I Used` in the reply.

```markdown
## Scope I Used

- Artifacts reviewed: <docs/code paths or descriptions>
- Inferred/confirmed goal: <one sentence>
- Current scope tier: <learning sketch | hobby prototype | internal team tool | customer-facing production | regulated/high-impact>
- Archetype: <personal assistant | coding agent | workflow control plane | research agent | forward-deployed enterprise | hybrid>
- Users/stakes: <who is affected and worst plausible mistake>
- Clarification ledger: <confirmed/inferred/assumed fields, or path if saved>
- Assumption-led review: <yes/no; if yes, list unanswered questions that could change severity>
- Review confidence: <high | medium | low, with why>

## Verdict

<APPROVE FOR CURRENT SCOPE | APPROVE WITH CHANGES | NEEDS REVISION | BLOCKED BY MISSING SCOPE | NOT PRODUCTION READY>

One-sentence reason.

## Findings

### BLOCKER

1. **<title>**
   - Evidence: `<file:line>` or `<doc section>`
   - Course anchor: Ch.NN, <concept>
   - Impact: <concrete failure mode>
   - Fix: <smallest appropriate change>

### HIGH

...

### MEDIUM

...

### LOW

...

## Strengths To Preserve

- **<title>**: <why this design is good and which chapter it aligns with>

## Chapter Coverage

| Chapter | Reviewed? | Why / why not | Result |
| --- | --- | --- | --- |
| Ch.02 | yes | agent loop present | missing explicit stop reason |
| Ch.15 | no | hobby prototype, no backend yet | defer |

## Suggested Next Step

<one to three concrete next actions, calibrated to scope>
```

## Severity Rules

Use `BLOCKER` when:
- The artifact cannot be reviewed honestly because scope is missing and assumptions would change the verdict.
- The user declined clarification and unknown action/data/user scope could change safety or production-readiness severity.
- A high-impact production action lacks approval, policy, or audit.
- Cross-tenant/customer/private data can leak by design.
- The PRD claims production readiness while lacking required state, safety, or observability.

Use `HIGH` when:
- The implementation can silently do the wrong thing.
- The loop can continue, retry, or stop incorrectly.
- Tools are unvalidated or over-privileged for the scope.
- Memory can be poisoned, stale, or cross-scoped in ways likely to affect output.

Use `MEDIUM` when:
- Design is underspecified but not immediately unsafe.
- Missing tests/evals make quality hard to prove.
- Chapter concept applies but can be deferred for V0 with explicit tracking.

Use `LOW` when:
- Naming, organization, or documentation would improve clarity.
- The issue is future-facing and not needed for current scope.

Use `STRENGTH` when:
- The design chooses a simpler chapter pattern correctly.
- The project explicitly defers an advanced concern for a good reason.
- The code isolates dependencies, uses a narrow tool surface, or preserves auditability.

## Verdict Derivation

Use the first matching rule:

| Findings | Verdict | Notes |
| --- | --- | --- |
| Scope is missing and assumptions would change severity | `BLOCKED BY MISSING SCOPE` | Ask for the missing decision before a real approval-style review |
| Any `BLOCKER` in a customer-facing, production, regulated, or high-impact scope | `NOT PRODUCTION READY` | Includes money movement, external sends, deletion, deployment, or cross-tenant data |
| Any other `BLOCKER` | `NEEDS REVISION` | The artifact can continue as a draft but not as an approved design |
| No blockers, at least one `HIGH` | `NEEDS REVISION` | High findings are current-scope problems, not polish |
| Only `MEDIUM` or `LOW` findings | `APPROVE WITH CHANGES` | The direction is acceptable if tracked fixes are made |
| No problem findings | `APPROVE FOR CURRENT SCOPE` | This is not approval for a broader future scope |

If the review is assumption-led, do not use `APPROVE FOR CURRENT SCOPE` unless the unresolved questions cannot affect users, data, autonomy, external actions, or production readiness.

## Review Style

- Be direct and useful.
- Do not bury serious findings after praise.
- Do not use vague warnings like "add safety". Name the action, risk, and control.
- Do not recommend a framework unless the artifact asks for implementation choices.
- When a concern is out of scope, say "defer until <scope change>" rather than pretending it is required now.
