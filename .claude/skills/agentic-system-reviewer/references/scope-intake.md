# Scope Intake Rubric

Use this before writing any review. The goal is to prevent two failures: under-reviewing a serious system and over-reviewing a learning prototype.

## Context Inventory

Check what the user provided:
- PRD, design doc, README, architecture note, issue, plan, prompt, transcript, eval, or idea file.
- Codebase, diff, prototype, snippets, tests, configs, schemas, prompts, tools, memory files, logs.
- Explicit target: review docs only, code only, both, or readiness for implementation.

If artifacts are named but missing, ask for them or state that the review is partial.

For code review scope, read the entry point, loop/orchestrator, tool definitions, prompt/context builder, state/memory/persistence files, connectors, and tests/evals when present. If the provided code is under 500 lines, read all of it. Record unread areas in the ledger.

## Fragment / Pre-PRD Detection

Use fragment mode when the artifact is a short idea, loose notes, or a 1-2 paragraph concept with no concrete action surface, data boundary, success criteria, or implementation plan.

Fragment mode output should:
- Name the likely archetype and scope tier.
- Avoid a full severity ladder unless there is an obvious high-risk claim.
- Ask up to 3 clarifying questions or provide a Ch.22 mini-canvas.
- Suggest moving to an agentic-system-designer workflow when the user wants a PRD.

## Clarification Ledger

Record these fields before critique. Mark each field as `confirmed`, `inferred`, `assumed`, or `unknown`.

| Field | Required Question | Examples |
| --- | --- | --- |
| Use case | What repeated task does the agent perform? | "draft support replies", not "AI assistant" |
| Goal | What outcome matters? | saved hours, fewer errors, faster triage |
| Users | Who relies on it? | solo builder, team, customers, public users |
| Maturity | What stage is this? | sketch, prototype, MVP, pilot, production |
| Stakes | What can go wrong? | annoyance, wrong email, data leak, money movement |
| Action level | What can it do? | read, draft, notify, write, send, delete, spend |
| Autonomy | Who approves actions? | human every time, rules, allowlist, autonomous |
| Archetype | Which Ch.22 lens fits? | personal assistant, coding agent, workflow control plane, research agent, forward-deployed enterprise |
| Data scope | What data crosses boundaries? | personal notes, customer data, source code, secrets |
| Success criteria | How is "good" measured? | test scenarios, evals, business metrics |
| Non-goals | What should not be reviewed or built yet? | no Slack in V0, no multi-tenant backend |

Ledger rules:
- Prefer facts discovered in provided docs/code over user questions.
- Ask the user for decisions, preferences, and stakes that cannot be discovered.
- Treat `unknown` action level, users, data scope, or autonomy as material if the artifact includes external tools, memory, connectors, or production language.
- Do not silently upgrade or downgrade the scope tier to make the review easier.
- Carry the ledger into the final report so the review can be audited later.

## Scope Tiers

Use the strictest matching tier.

### Tier 0: Learning Sketch
- One user, no real external side effects.
- Main risk is misunderstanding concepts.
- Review mainly Ch.01-Ch.04 plus whatever concept appears.
- Avoid demanding production observability or operations. Suggest tiny experiments.

### Tier 1: Hobby Prototype
- One user, maybe personal data, reversible actions.
- Main risk is bad memory, annoying notifications, brittle loop behavior.
- Review Ch.02-Ch.07, Ch.13 if channels, Ch.20 if proactive.
- Mention safety/ops only for concrete risks or future transition.

### Tier 2: Internal Team Tool
- Multiple coworkers, shared data, possible repo or SaaS actions.
- Main risk is wrong work, permission confusion, data leakage inside org.
- Review Ch.02-Ch.08, Ch.12-Ch.17, and Ch.18 where untrusted data enters.
- Require basic observability, approvals for external/destructive tools, and state.

### Tier 3: Customer-Facing Production
- Real customers, external messages/actions, money, support, or business processes.
- Main risk is customer harm, data exposure, unauthorized action, cost spiral.
- Review Ch.02-Ch.19. Add Ch.20-Ch.21 if proactive/self-evolving.
- Require clear HITL, safety, evals, traces, budgets, runbooks, rollback.

### Tier 4: Regulated or High-Impact
- Healthcare, finance, legal, hiring, production infrastructure, deletion, payments.
- Main risk is irreversible or compliance-sensitive harm.
- Require explicit approvals, audit, policy controls, redaction, incident response, and human ownership.
- If these are missing, use `NOT PRODUCTION READY` or `BLOCKER`.

## Archetype Mapping

| Archetype | Load-bearing chapters |
| --- | --- |
| Personal assistant gateway | Ch.05-Ch.07, Ch.13, Ch.16, Ch.18-Ch.21 |
| Coding agent | Ch.02-Ch.05, Ch.08, Ch.12, Ch.16-Ch.18 |
| Workflow control plane | Ch.08, Ch.11-Ch.16, Ch.18-Ch.19 |
| Research or knowledge agent | Ch.03-Ch.07, Ch.16, Ch.18, Ch.21 |
| Forward-deployed enterprise agent | Ch.06-Ch.07, Ch.18-Ch.21, plus relevant backend/connectors |

## Clarifying Question Gate

Ask up to 3 questions when any material unknown touches users, data scope, autonomy, external actions, or production readiness. These are the usual triggers:
- Hobby vs production.
- Real customers or internal-only.
- Whether tools can send, spend, delete, deploy, or modify external systems.
- Whether memory contains private, customer, or cross-tenant data.
- Whether proactive behavior interrupts users or acts unattended.
- Whether the user wants conceptual feedback or implementation-readiness review.

Question format:

```markdown
Before I review, I need to calibrate scope so I do not over- or under-grade this:
1. <scope/stakes question>
2. <autonomy/action question>
3. <archetype or target-stage question>
```

If the user refuses clarification, proceed only as an assumption-led review:
- State `Assumption-led review` in the scope section.
- List the refused or unanswered questions.
- Use the highest reasonable tier implied by the artifacts for irreversible, external, customer-facing, or money-moving behavior.
- Lower the confidence if a different answer would change the verdict.
- Prefer `BLOCKED BY MISSING SCOPE` when the unknowns make the review impossible to calibrate.
