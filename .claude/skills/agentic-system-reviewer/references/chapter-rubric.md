# Chapter Review Rubric

Use this after scope is known. Read relevant `course/*.md` files before citing them.

## Chapter Trigger Matrix

| Chapter | Trigger In Artifacts | Check For |
| --- | --- | --- |
| Ch.01 One Tool Call | First tool, function calling, schemas | Does the schema match the handler? Are errors returned to the model as usable tool results? |
| Ch.02 Agent Loop | loop, max steps, retries, stop, cancellation | Are stop conditions explicit? Are doom loops, errors, parallel calls, and cancellation handled for the scope? |
| Ch.03 Tools Validation | tool registry, permissions, idempotency, dry-run | Are tools typed, validated, permissioned, idempotent where needed, and wrapped in result envelopes? |
| Ch.04 Prompts Context Cache | system prompt, context builder, cache, prefix | Is prompt assembly deterministic? Are stable prefix and volatile tail separated? Does live memory break cache? |
| Ch.05 Short-Term Memory | transcript, compaction, scratchpad, tool output size | Are audit log, operating view, and scratchpad separated? Are tool results clipped/deduped/compacted? |
| Ch.06 Long-Term Recall | vector DB, search, memory retrieval, skill index | Is retrieval chosen by access pattern? Are namespaces, ranking, budget, and observability present? |
| Ch.07 Memory Writing | write memory, preferences, curation, learned facts | Is writing separated from retrieval? Are safety filters, provenance, conflict resolution, rollback, and user controls present? |
| Ch.08 State Persistence | resume, crash, checkpoints, long run, worker | Is state durable at step boundaries? Are in-flight tools, idempotency, heartbeats, and resume paths handled? |
| Ch.09 Planning | checklist, plan, replan, dependency graph | Is the planning shape appropriate? Are plans stateful, editable, and revalidated at step boundaries? |
| Ch.10 Delegation | subagents, specialists, reviewer loop | Is the delegation packet bounded? Are tools/model/context/result schema and recursion limits explicit? |
| Ch.11 Harness | runtime, lifecycle, hooks, provider abstraction | Are loop, tools, prompt, memory, state, planning, hooks, and config composed cleanly? |
| Ch.12 Human-In-The-Loop | approval, ask/allow/deny, risky tools | Are high-impact actions suspended, reviewed, audited, timed out, and resumed safely? |
| Ch.13 Connectors MCP IPC | Slack, email, Telegram, webhooks, MCP | Are channel events normalized, verified, deduped, rate-limited, scoped, and treated as untrusted? |
| Ch.14 Skills MCP Subagents | skills, plugins, MCP servers, profiles | Is each capability the right shape: skill, MCP server, local tool, or subagent? |
| Ch.15 Backend Infrastructure | API, queue, worker, scheduler, multi-tenant | Are acceptance, execution, streaming, checkpointing, rate limits, secrets, and tenancy separated? |
| Ch.16 Observability | traces, metrics, logs, evals, cost events | Can an operator reconstruct a run, cost, tool path, retrieved context, stop reason, and eval result? |
| Ch.17 Cost Latency Model Strategy | model routing, budgets, cheaper models | Are model profiles, deterministic shortcuts, token budgets, cache-aware cost, retries, and escalation defined? |
| Ch.18 Safety Adversarial Inputs | prompt injection, untrusted data, secrets | Are trust boundaries labeled? Are indirect injection, tool misuse, memory poisoning, and exfiltration defended? |
| Ch.19 Ops Forward-Deployed | deploy, runbooks, migration, SLOs | Can someone operate, debug, rollback, migrate, and respond to incidents? |
| Ch.20 Proactive Agents | cron, notifications, watchdogs, background | Is proactivity opt-in by category? Are timing, notification flood, unattended cost, and escalation handled? |
| Ch.21 Self-Evolving Agents | skill writing, prompt updates, RL, curation | Are proposed updates evaluated, versioned, rolled back, and separated from safety controls? |
| Ch.22 Design Canvas | overall idea, PRD, architecture | Are use case, goal, scope, budget, users, success criteria, and worst-case mistake explicit? |

## Chapter Selection Guard

Pick the smallest set of chapters that can explain the real risks, normally 3-6 chapters. This cap governs primary (deep-reviewed) chapters only — the report's Chapter Coverage table should still list every chapter the archetype rubric flagged as relevant, even if they were deferred. If more than 6 chapters look central as primary, do not review against the entire course in one pass. Flag the artifact as too broad, split the review by subsystem, or ask which slice matters most.

## Scope-Aware Expectations

### Learning Sketch
Must have:
- One concrete behavior.
- Simple loop or tool-call shape.
- Clear next experiment.

Should not be forced to have:
- Durable backend, full observability, runbooks, multi-agent orchestration.

### Hobby Prototype
Must have:
- Narrow V0 scope.
- Safe memory policy if memory exists.
- Explicit stop condition if loop exists.
- One notification/channel rule if proactive.

Should defer:
- Multi-tenant isolation, complex queues, full incident response.

### Internal Team Tool
Must have:
- Tool contracts and permission tiers.
- Basic durable state for long-running work.
- Approval for external/destructive actions.
- Trace/log evidence for debugging.

### Customer-Facing Production
Must have:
- All high-impact tools behind Ch.12 gates or deterministic policy.
- Ch.16 traces/evals/cost visibility.
- Ch.18 trust boundaries and adversarial input defenses.
- Ch.19 runbooks and operational ownership.
- Ch.08/Ch.15 durability when work outlives a request.

## Chapter Review Questions

Use these when writing findings.

### Loop and Tools: Ch.01-Ch.03
- Can the model call only known tools?
- Are arguments schema-validated and semantically validated?
- Are errors returned as recoverable messages rather than crashes?
- Are destructive, external, or non-idempotent tools labeled?
- Is there a stop reason other than "ran out of steps"?

### Prompt and Memory: Ch.04-Ch.07
- What is stable prefix vs volatile tail?
- Does memory retrieval include provenance, ranking, namespaces, and budget?
- Does memory writing have a safety filter and user-visible controls?
- Are summaries/compaction auditable and not silently lossy for important facts?

### State, Planning, Delegation, Harness: Ch.08-Ch.11
- What is persisted after each step?
- What happens after process restart or tool crash?
- Is the plan shape the simplest that fits?
- Are subagents bounded by task, tools, context, depth, budget, and output schema?
- Does the harness have clear lifecycle and hook boundaries?

### External Surface: Ch.12-Ch.14
- Which tools require allow/ask/deny?
- What does the human see before approving?
- Are channel/webhook events authenticated, deduped, and normalized?
- Is each extension a skill, MCP server, built-in tool, or subagent for the right reason?

### Production Layer: Ch.15-Ch.19
- Is execution decoupled from request handling when needed?
- Are secrets, tenant scope, backups, rate limits, and cost ledgers defined?
- Is observability sufficient to replay or explain a bad run?
- Are safety controls layered before and after model calls?
- Is there a runbook for the worst plausible mistake?

### Agency: Ch.20-Ch.21
- Is proactive behavior opt-in and digestible?
- What prevents notification flood or unattended cost?
- Are self-updates proposed, evaluated, versioned, and reversible?
- Which parts are forbidden to self-modify?

## Cross-Cutting Design Lenses

Use these lenses after chapter selection so the review catches failure modes that do not live neatly in one chapter.

| Lens | Ask | Usual Chapter Anchors |
| --- | --- | --- |
| Reversibility | Which actions cannot be undone, and who approves them? | Ch.03, Ch.12, Ch.18 |
| Cost envelope | What is the spend/latency ceiling, and what enforces it? | Ch.02, Ch.16, Ch.17, Ch.20 |
| Eval plan | How will the team know the agent works before production observability exists? | Ch.16, Ch.18, Ch.22 |
| Doom-loop protection | What stops repeated tool calls, retries, notifications, or self-updates? | Ch.02, Ch.08, Ch.17, Ch.20-Ch.21 |
| Data boundary | What data can cross users, tenants, channels, prompts, and memory? | Ch.06-Ch.08, Ch.13, Ch.18 |
| Human ownership | Who can intervene, approve, rollback, and explain outcomes? | Ch.12, Ch.16, Ch.19 |

Failure-mode quick map:
- Cost overrun: Ch.17 plus Ch.16 for cost events and Ch.20 for unattended background work.
- Memory poisoning or stale preference: Ch.07 plus Ch.18, usually Ch.06 for retrieval scope.
- Unauthorized external action: Ch.03 plus Ch.12 and Ch.18.
- Cross-customer leak: Ch.06, Ch.08, Ch.13, Ch.15, Ch.18.
- Runaway loop or notification flood: Ch.02, Ch.08, Ch.17, Ch.20.
- Bad self-update: Ch.21 plus Ch.16 for eval evidence and Ch.19 for rollback.

## Finding Construction

Every problem finding must include:
- Evidence: doc section, code path, or observed omission.
- Course anchor: chapter and concept.
- Scope calibration: why it matters for this tier.
- Impact: concrete failure mode.
- Fix: smallest change appropriate for current scope.

Every strength must include:
- What to preserve.
- Why it fits the course.
- What could break it later.
