#!/usr/bin/env node
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

const roots = process.argv.slice(2);
const MIN_SCORE = 2;
const MAX_RESULTS = 6;

if (roots.length === 0) {
  console.error("Usage: node suggest-chapters.mjs <file-or-directory> [...]");
  process.exit(2);
}

const chapterRules = [
  ["Ch.01", "One tool call", ["function call", "function calling", "tool call", "tool schema", "json schema"]],
  ["Ch.02", "Agent loop", ["loop", "max steps", "stop condition", "retry", "cancel", "while true"]],
  ["Ch.03", "Tools validation", ["tool registry", "permission", "idempotent", "dry run", "validate", "tool error"]],
  ["Ch.04", "Prompts context cache", ["prompt", "system message", "context builder", "cache", "prefix", "cache_control"]],
  ["Ch.05", "Short-term memory", ["transcript", "scratchpad", "compaction", "summarize", "tool result", "context limit"]],
  ["Ch.06", "Long-term recall", ["vector", "embedding", "retrieval", "search memory", "recall", "rerank"]],
  ["Ch.07", "Memory writing", ["write memory", "preference", "curator", "provenance", "supersede", "memory update"]],
  ["Ch.08", "State persistence", ["resume", "checkpoint", "crash", "durable", "heartbeat", "state machine"]],
  ["Ch.09", "Planning", ["plan", "checklist", "replan", "dependency graph", "todo"]],
  ["Ch.10", "Multi-agent delegation", ["subagent", "delegate", "specialist", "supervisor", "parallel agent"]],
  ["Ch.11", "Agent harness", ["harness", "lifecycle", "hook", "provider", "bootstrap", "shutdown"]],
  ["Ch.12", "Human in the loop", ["approval", "human", "ask", "allow", "deny", "dangerous", "destructive"]],
  ["Ch.13", "Connectors MCP IPC", ["slack", "email", "webhook", "mcp", "connector", "telegram", "channel"]],
  ["Ch.14", "Skills MCP subagents", ["skill.md", "plugin", "mcp server", "agent profile", "capability registry"]],
  ["Ch.15", "Backend infrastructure", ["queue", "worker", "scheduler", "multi-tenant", "api", "rate limit", "secrets"]],
  ["Ch.16", "Observability", ["trace", "metric", "log", "eval", "cost event", "dashboard", "opentelemetry"]],
  ["Ch.17", "Cost latency model strategy", ["model routing", "budget", "latency", "token", "cheap model", "fallback model"]],
  ["Ch.18", "Safety adversarial inputs", ["prompt injection", "untrusted", "exfiltration", "secret", "sandbox", "attack"]],
  ["Ch.19", "Operations", ["runbook", "deploy", "migration", "slo", "rollback", "incident", "operator"]],
  ["Ch.20", "Proactive agents", ["cron", "notification", "watchdog", "proactive", "background", "digest"]],
  ["Ch.21", "Self-evolving agents", ["self-evolving", "learned skill", "prompt update", "promotion", "rollback", "drift"]],
  ["Ch.22", "Design canvas", ["prd", "use case", "scope", "success criteria", "worst-case", "archetype"]],
];

const textExts = new Set([
  ".md", ".txt", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs",
  ".java", ".kt", ".swift", ".rb", ".php", ".json", ".yaml", ".yml", ".toml",
]);

function collectFiles(path) {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) return [];

  const out = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (["node_modules", ".git", "references", "dist", "build", "coverage"].includes(entry.name)) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(child));
    else out.push(child);
  }
  return out;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countTerm(text, term) {
  const escaped = escapeRegExp(term.toLowerCase());
  const startsWord = /^[a-z0-9]/.test(term);
  const endsWord = /[a-z0-9]$/.test(term);
  const pattern = `${startsWord ? "\\b" : ""}${escaped}${endsWord ? "\\b" : ""}`;
  return [...text.matchAll(new RegExp(pattern, "g"))].length;
}

const files = roots.flatMap(collectFiles).filter((file) => textExts.has(extname(file).toLowerCase()));
const haystack = files
  .map((file) => {
    try {
      return readFileSync(file, "utf8").toLowerCase();
    } catch {
      return "";
    }
  })
  .join("\n");

const matches = [];
for (const [chapter, title, terms] of chapterRules) {
  const hits = terms
    .map((term) => ({ term, count: countTerm(haystack, term) }))
    .filter((hit) => hit.count > 0);
  const score = hits.reduce((sum, hit) => sum + hit.count, 0);
  if (score >= MIN_SCORE) matches.push({ chapter, title, hits, score });
}

if (matches.length === 0) {
  console.log("No chapter keywords found. Start with Ch.22 for intent and inspect artifacts manually.");
  process.exit(0);
}

console.log(`Suggested chapter candidates, capped at ${MAX_RESULTS}. Read the actual course chapters before citing them.\n`);
for (const match of matches.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS)) {
  const hitText = match.hits.map((hit) => `${hit.term} x${hit.count}`).join(", ");
  console.log(`- ${match.chapter} ${match.title} (score ${match.score}): ${hitText}`);
}
