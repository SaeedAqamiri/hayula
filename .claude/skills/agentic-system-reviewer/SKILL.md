---
name: agentic-system-reviewer
description: Use when reviewing agent PRDs, implementation plans, unfinished ideas, or agent code against the Production-grade agentic systems course, especially when scope, archetype, chapter relevance, or course-aligned design quality is uncertain.
---

# Agentic System Reviewer

## Overview

Review the provided docs and code against the course, but only after reconstructing the user's goal, project scope, risk level, and archetype. The review must be course-grounded, scope-aware, and evidence-backed.

Core principle: **do not grade a weekend prototype like an enterprise workflow control plane, and do not wave through production autonomy like a toy.**

## When To Use

Use this skill for:
- PRDs, design docs, implementation plans, or idea files for agentic systems.
- Codebases or diffs implementing agent loops, tools, memory, planning, delegation, connectors, proactive triggers, or self-improvement.
- Requests like "review this against the course", "is this agent design good?", "what chapters does this miss?", "check my PRD/code", or "is this production-ready?"

Do not use this skill for ordinary code review with no agent-system concern. Use the normal code-review workflow for that.

## Required Resources

Resolve these paths relative to this `SKILL.md`. Load only what is needed:
- `references/scope-intake.md` - mandatory before review.
- `references/chapter-rubric.md` - mandatory after scope is known; read the relevant chapter rows.
- `references/report-template.md` - mandatory before writing the final report.
- `scripts/suggest-chapters.mjs` - optional helper to seed chapter selection from files; never treat it as authoritative.

## Review Flow

Follow this order: read provided docs, inspect provided code, write the scope ledger, ask or assume explicitly for material unknowns, select up to 6 primary chapters, open those course files, then write the findings-first report.

## Non-Negotiables

1. Read user-provided docs first. If a PRD, plan, README, idea file, issue, transcript, or design note exists, it defines intent until contradicted.
2. If code is provided, read enough of the codebase to understand architecture, boundaries, data flow, and actual behavior. At minimum, inspect the entry point, loop/orchestrator, tool definitions, prompt/context builder, state/memory/persistence files, connectors, and tests/evals when present. If the provided code is under 500 lines, read all of it. Note unread directories or files in the ledger.
3. Establish and record scope before critique. Include project type, users, stakes, archetype, current maturity, and worst plausible mistake.
4. Ask before reviewing when any material unknown touches users, data scope, autonomy, external actions, or production readiness. If the user declines, run an assumption-led review that clearly marks unresolved scope and confidence.
5. Read relevant course chapters before citing them. Naming chapters from memory is not enough.
6. Calibrate rigor. Side projects still need clear loops and tool contracts, but not full multi-tenant ops. Production systems need explicit safety, state, observability, and approval surfaces.
7. Findings must include evidence, course reference, impact, and suggested fix. In the final report, the Findings section precedes Strengths unless there are no issues.
8. If reference systems are cloned under `references/` (e.g., OpenCode, Hermes Agent, OpenClaw, Paperclip), use them to ground findings with concrete file:line evidence for the pattern. Do not invent paths for references that are not cloned; describe the pattern from the chapter notes instead.

## Scope Clarification

Before reviewing, create a "clarification ledger" in your working notes and carry it into the final report. If the review is conversational, include a short `Scope I Used` section.

If the user asks for a saved standalone deliverable, write the report to `docs/agentic-system-review-<slug>.md`. If the review is part of a project being built or handed off, write it inside that project, for example `workspace/<project>/agentic-system-review-<slug>-<date>.md`, with any saved ledger next to it.

When explaining scope calibration to the user during intake, prefer plain-language framing ("personal hobby" vs "team tool" vs "customer-facing") over tier numbers — the user has not read the rubric.

If unclear, ask up to 3 batched questions. Favor questions that determine chapter relevance:
- Who uses this, and are real users/customers affected?
- What can the agent actually do: read only, draft, send, modify, spend, delete, deploy?
- Is this a learning prototype, personal tool, internal team tool, or production product?
- Which archetype is closest: personal assistant, coding agent, workflow control plane, research agent, forward-deployed enterprise agent, or hybrid?
- What is the worst plausible mistake?

Use the answer, or your explicit assumptions if the user declines clarification, as review input. In an assumption-led review:
- Put `Assumption-led review` in `Scope I Used`.
- List the specific unanswered questions that could change severity.
- Avoid `APPROVE FOR CURRENT SCOPE` unless the unresolved questions cannot affect safety, data, autonomy, or production readiness.

Use `references/scope-intake.md` for the full checklist.

## Fragment / Pre-PRD Mode

If the artifact is a short idea, no code, or no implementation plan, treat it as a fragment rather than a full review. Do not run the whole grading rubric. Read Ch.22 and any obvious concept chapter, identify the missing design decisions, and give the user the smallest next step: 3 clarifying questions, a Ch.22 canvas fill-in, or a handoff to an agentic-system-designer skill if available.

## Chapter Selection

Always start from the user's artifacts and the scope ledger. Use `references/chapter-rubric.md` as the authority for chapter triggers and checks.

Optional helper:

```bash
node .claude/skills/agentic-system-reviewer/scripts/suggest-chapters.mjs <path> [...]
```

Select up to 6 **primary** chapters — the ones you read in full and write findings against. All other archetype-relevant chapters still appear in the report's Chapter Coverage table with a one-line rationale (reviewed / considered / deferred). The cap is on **depth**, not coverage. If more than 6 chapters look equally central for primary review, treat that as evidence the artifact is too broad or the review needs multiple passes; name that as a finding.

Course files live under `course/` and are named by chapter number, for example `course/03-tools-validation.md` and `course/22-designing-your-own-agent.md`. Open the chapter file before citing it in a finding or coverage table.

## Review Standards

Use code-review discipline:
- Report only issues you can ground in the artifacts and course.
- For code findings, cite exact file/line when possible.
- For doc findings, cite section or heading.
- Do not manufacture issues to prove usefulness.
- Do not hide high-stakes gaps under "future work".
- Do not demand production machinery for low-stakes prototypes; instead mark it as "defer until scope changes".
- If the PRD/design and the code disagree about behavior (e.g., the design promises HITL on a destructive tool but the code wires it direct), raise the drift as a HIGH finding (or BLOCKER at Tier 3+), citing both the PRD section and the offending file:line.

Severity:
- `BLOCKER`: Cannot proceed safely for the stated scope.
- `HIGH`: Likely to cause wrong behavior, unsafe autonomy, bad architecture, or failed delivery.
- `MEDIUM`: Important missing design detail or implementation gap.
- `LOW`: Useful improvement, clarity issue, or deferred concern.
- `STRENGTH`: Good design worth preserving.

Use `references/report-template.md` for severity and verdict derivation.

## Common Mistakes

| Mistake | Correction |
| --- | --- |
| Reviewing before reading the user's PRD or idea file | Read artifacts first, then code, then chapters |
| Applying every production chapter to a side project | Calibrate by user/stakes/worst-case mistake |
| Skipping Ch.22 because it is "just design" | Use Ch.22 to reconstruct intent and archetype |
| Saying "needs safety" generically | Name the concrete unsafe action and the Ch.12/Ch.18 control |
| Citing chapters from memory | Open and read relevant chapter sections before citing |
| Treating the script output as the rubric | Script only suggests; the reviewer decides after reading |
| Reporting vague findings | Include evidence, impact, course anchor, and fix |
| Firing every chapter card | Cap normal reviews at 6 primary chapters; split the review or flag broad scope |

## Quick Self-Check

Before final answer:
- [ ] Scope ledger is present, including assumptions and unread code areas.
- [ ] Relevant chapter files were opened before being cited.
- [ ] Fragment mode and the 6-chapter cap were considered.
- [ ] Verdict follows `references/report-template.md`.
