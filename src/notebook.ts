import { createHash } from "node:crypto"
import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import { dump, load } from "js-yaml"

export const NOTEBOOK_NAME = ".note.yaml"

export const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "target",
  "vendor",
  "graft",
  "coverage",
  ".pytest_cache",
  "__pycache__",
])

export type Confidence = "observed" | "inferred" | "verified"
export type Freshness = "fresh" | "suspect" | "stale"
export type BasedOn = string[] // "path@fingerprint"

export type Entry = {
  name: string
  summary: string
  based_on: BasedOn
  confidence: Confidence
}

export type Relation = {
  from: string
  to: string
  description: string
  based_on: BasedOn
  confidence: Confidence
}

export type Notebook = {
  dir: string
  rel: string
  summary: string
  based_on: BasedOn
  entries: Record<string, Entry>
  relations: Relation[]
  updated: string
}

export const emptyNotebook = (dir: string, rel: string): Notebook => ({
  dir,
  rel,
  summary: "",
  based_on: [],
  entries: {},
  relations: [],
  updated: "",
})

const CONFIDENCE_RANK: Record<Confidence, number> = { observed: 0, inferred: 1, verified: 2 }

const STOP = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "and",
  "or",
  "it",
  "this",
  "that",
  "these",
  "those",
  "with",
  "from",
  "by",
  "as",
  "via",
  "its",
  "their",
  "into",
  "through",
  "using",
  "when",
  "while",
  "does",
  "do",
  "doesn",
  "don",
  "has",
  "have",
])

// ---------- filesystem ----------

export async function listNotebooks(worktree: string): Promise<string[]> {
  const found: string[] = []
  const walk = async (dir: string) => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue
        await walk(abs)
      } else if (entry.isFile() && entry.name === NOTEBOOK_NAME) {
        found.push(abs)
      }
    }
  }
  await walk(worktree)
  return found
}

export async function fileFingerprint(abs: string): Promise<string | null> {
  try {
    const info = await stat(abs)
    if (!info.isFile()) return null
    return `${info.size}-${Math.trunc(info.mtimeMs)}`
  } catch {
    return null
  }
}

export async function hydrateBasedOn(list: BasedOn, worktree: string): Promise<BasedOn> {
  const out: string[] = []
  for (const item of list) {
    const idx = item.lastIndexOf("@")
    const file = idx === -1 ? item : item.slice(0, idx)
    const hash = idx === -1 ? "" : item.slice(idx + 1)
    const rel = path.isAbsolute(file) ? path.relative(worktree, file).replaceAll("\\", "/") : file.replaceAll("\\", "/")
    if (!rel || rel.startsWith("..")) continue
    if (hash) {
      out.push(`${rel}@${hash}`)
      continue
    }
    const fp = await fileFingerprint(path.resolve(worktree, rel))
    if (fp !== null) out.push(`${rel}@${fp}`)
    else out.push(rel)
  }
  return Array.from(new Set(out))
}

export async function itemFreshness(basedOn: BasedOn, worktree: string): Promise<Freshness> {
  if (basedOn.length === 0) return "fresh"
  let missing = false
  let changed = false
  for (const item of basedOn) {
    const idx = item.lastIndexOf("@")
    const file = idx === -1 ? item : item.slice(0, idx)
    const hash = idx === -1 ? "" : item.slice(idx + 1)
    const fp = await fileFingerprint(path.resolve(worktree, file))
    if (fp === null) {
      missing = true
      continue
    }
    if (hash && fp !== hash) changed = true
  }
  if (missing) return "stale"
  if (changed) return "suspect"
  return "fresh"
}

// ---------- parse / serialize ----------

function asRecord(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>
  return {}
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asBasedOn(value: unknown): BasedOn {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
}

function asConfidence(value: unknown): Confidence {
  return value === "inferred" || value === "verified" ? value : "observed"
}

export function parseNotebook(content: string, dir: string, rel: string): Notebook {
  let data: unknown
  try {
    data = load(content) ?? {}
  } catch {
    data = {}
  }
  const root = asRecord(data)
  const entries: Record<string, Entry> = {}
  for (const [name, raw] of Object.entries(asRecord(root.entries))) {
    const item = asRecord(raw)
    entries[name] = {
      name,
      summary: asString(item.summary).trim(),
      based_on: asBasedOn(item.based_on),
      confidence: asConfidence(item.confidence),
    }
  }
  const relations: Relation[] = []
  for (const raw of Array.isArray(root.relations) ? root.relations : []) {
    const item = asRecord(raw)
    const from = asString(item.from).trim()
    const to = asString(item.to).trim()
    if (!from || !to) continue
    relations.push({
      from,
      to,
      description: asString(item.description).trim(),
      based_on: asBasedOn(item.based_on),
      confidence: asConfidence(item.confidence),
    })
  }
  return {
    dir,
    rel,
    summary: asString(root.summary).trim(),
    based_on: asBasedOn(root.based_on),
    entries,
    relations,
    updated: asString(root.updated),
  }
}

export function serializeNotebook(nb: Notebook): string {
  const doc: Record<string, unknown> = { version: 1, updated: nb.updated }
  if (nb.summary) doc.summary = nb.summary
  if (nb.based_on.length > 0) doc.based_on = nb.based_on
  if (Object.keys(nb.entries).length > 0) {
    const entries: Record<string, Record<string, unknown>> = {}
    for (const entry of Object.values(nb.entries)) {
      const item: Record<string, unknown> = { summary: entry.summary }
      if (entry.confidence !== "observed") item.confidence = entry.confidence
      if (entry.based_on.length > 0) item.based_on = entry.based_on
      entries[entry.name] = item
    }
    doc.entries = entries
  }
  if (nb.relations.length > 0) {
    doc.relations = nb.relations.map((rel) => {
      const item: Record<string, unknown> = { from: rel.from, to: rel.to, description: rel.description }
      if (rel.confidence !== "observed") item.confidence = rel.confidence
      if (rel.based_on.length > 0) item.based_on = rel.based_on
      return item
    })
  }
  return dump(doc, { noRefs: true, lineWidth: 100 })
}

// ---------- text helpers ----------

export function tokens(input: string): Set<string> {
  const set = new Set<string>()
  for (const word of input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (word.length > 1 && !STOP.has(word)) set.add(word)
  }
  return set
}

export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const token of a) if (b.has(token)) inter++
  return inter / Math.min(a.size, b.size)
}

export function maxConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b
}

function mergeUnique(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b]))
}

// ---------- tree placement ----------

function dirParts(relPath: string): string[] {
  const dir = path.posix.dirname(relPath.replaceAll("\\", "/"))
  if (dir === ".") return []
  return dir.split("/").filter(Boolean)
}

export function relationFolder(fromPath: string, toPath: string): string {
  const a = dirParts(fromPath)
  const b = dirParts(toPath)
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  return a.slice(0, i).join("/")
}

export function relTo(fromPath: string, folder: string): string {
  const rel = path.posix.relative(folder || ".", fromPath.replaceAll("\\", "/"))
  return rel === "" ? "." : rel
}

// ---------- scoring ----------

export function scoreEntry(entry: Entry, query: string): number {
  const q = tokens(query)
  if (q.size === 0) return 0
  let score = overlap(tokens(entry.summary), q) * 3
  score += overlap(tokens(entry.name), q) * 2
  for (const item of entry.based_on) score += overlap(tokens(item), q)
  return score
}

export function scoreRelation(rel: Relation, query: string): number {
  const q = tokens(query)
  if (q.size === 0) return 0
  let score = overlap(tokens(rel.description), q) * 3
  score += overlap(tokens(`${rel.from} ${rel.to}`), q) * 2
  for (const item of rel.based_on) score += overlap(tokens(item), q)
  return score
}

// ---------- commit ops ----------

export type Op =
  | { kind: "folder"; summary: string; basedOn: BasedOn }
  | { kind: "entry"; name: string; summary: string; basedOn: BasedOn; confidence: Confidence }
  | { kind: "removeEntry"; name: string }
  | { kind: "relation"; from: string; to: string; description: string; basedOn: BasedOn; confidence: Confidence }
  | { kind: "removeRelation"; from: string; to: string }

export function applyOps(nb: Notebook, ops: Op[]): { nb: Notebook; dirty: boolean; changes: string[] } {
  const out: Notebook = { ...nb, based_on: [...nb.based_on], entries: { ...nb.entries }, relations: [...nb.relations] }
  const changes: string[] = []
  let dirty = false

  for (const op of ops) {
    switch (op.kind) {
      case "folder": {
        const summary = op.summary.trim()
        if (summary && summary !== out.summary) {
          out.summary = summary
          out.based_on = mergeUnique(out.based_on, op.basedOn)
          changes.push("folder summary updated")
          dirty = true
        }
        break
      }
      case "entry": {
        const prev = out.entries[op.name]
        const summary = op.summary.trim()
        if (prev) {
          if (summary && summary !== prev.summary) {
            prev.summary = summary
            prev.confidence = maxConfidence(prev.confidence, op.confidence)
            prev.based_on = mergeUnique(prev.based_on, op.basedOn)
            changes.push(`entry ${op.name} updated`)
            dirty = true
          }
        } else if (summary) {
          out.entries[op.name] = { name: op.name, summary, based_on: op.basedOn, confidence: op.confidence }
          changes.push(`entry ${op.name} added`)
          dirty = true
        }
        break
      }
      case "removeEntry": {
        if (out.entries[op.name]) {
          delete out.entries[op.name]
          changes.push(`entry ${op.name} removed`)
          dirty = true
        } else {
          changes.push(`entry ${op.name} not found`)
        }
        break
      }
      case "relation": {
        const description = op.description.trim()
        const idx = out.relations.findIndex((r) => r.from === op.from && r.to === op.to)
        if (idx >= 0) {
          const prev = out.relations[idx]
          if (description && (description !== prev.description || op.confidence !== prev.confidence)) {
            prev.description = description
            prev.confidence = maxConfidence(prev.confidence, op.confidence)
            prev.based_on = mergeUnique(prev.based_on, op.basedOn)
            changes.push(`relation ${op.from} → ${op.to} updated`)
            dirty = true
          }
        } else if (description) {
          out.relations.push({
            from: op.from,
            to: op.to,
            description,
            based_on: op.basedOn,
            confidence: op.confidence,
          })
          changes.push(`relation ${op.from} → ${op.to} added`)
          dirty = true
        }
        break
      }
      case "removeRelation": {
        const idx = out.relations.findIndex((r) => r.from === op.from && r.to === op.to)
        if (idx >= 0) {
          out.relations.splice(idx, 1)
          changes.push(`relation ${op.from} → ${op.to} removed`)
          dirty = true
        } else {
          changes.push(`relation ${op.from} → ${op.to} not found`)
        }
        break
      }
    }
  }

  return { nb: out, dirty, changes }
}

// ---------- skeleton ----------

export type SkeletonEntry = {
  rel: string
  dirs: number
  files: number
  sample: string[]
}

export async function buildSkeleton(worktree: string, maxDirs = 40): Promise<SkeletonEntry[]> {
  const out: SkeletonEntry[] = []
  let entries
  try {
    entries = await readdir(worktree, { withFileTypes: true })
  } catch {
    return out
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue
    const abs = path.join(worktree, entry.name)
    const counts = await countDir(abs)
    const sample = await sampleFiles(abs, 4)
    out.push({ rel: entry.name, dirs: counts.dirs, files: counts.files, sample })
    if (out.length >= maxDirs) break
  }
  return out
}

async function countDir(dir: string): Promise<{ dirs: number; files: number }> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return { dirs: 0, files: 0 }
  }
  let dirs = 0
  let files = 0
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue
      dirs += 1
      const sub = await countDir(path.join(dir, entry.name))
      dirs += sub.dirs
      files += sub.files
    } else if (entry.isFile() && !entry.name.startsWith(".")) {
      files += 1
    }
  }
  return { dirs, files }
}

async function sampleFiles(dir: string, n: number): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .slice(0, n)
    .map((entry) => entry.name)
}

// ---------- diff ----------

export function unifiedDiff(oldText: string, newText: string, label: string): string {
  const a = oldText.split("\n")
  const b = newText.split("\n")
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const ops: Array<[string, string]> = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push([" ", a[i]])
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push(["-", a[i]])
      i++
    } else {
      ops.push(["+", b[j]])
      j++
    }
  }
  while (i < a.length) ops.push(["-", a[i++]])
  while (j < b.length) ops.push(["+", b[j++]])

  const changed = ops.filter(([sign]) => sign !== " ").length
  if (changed === 0) return ""

  const idx: number[] = []
  for (let k = 0; k < ops.length; k++) if (ops[k][0] !== " ") idx.push(k)
  const start = Math.max(0, idx[0] - 2)
  const end = Math.min(ops.length - 1, idx[idx.length - 1] + 2)

  let oldBefore = 0
  let newBefore = 0
  for (let k = 0; k < start; k++) {
    const sign = ops[k][0]
    if (sign === "-") oldBefore++
    else if (sign === "+") newBefore++
    else {
      oldBefore++
      newBefore++
    }
  }
  let oldCount = 0
  let newCount = 0
  for (let k = start; k <= end; k++) {
    const sign = ops[k][0]
    if (sign === "-") oldCount++
    else if (sign === "+") newCount++
    else {
      oldCount++
      newCount++
    }
  }

  const body = ops.slice(start, end + 1).map(([sign, line]) => `${sign}${line}`).join("\n")
  return `--- a/${label}\n+++ b/${label}\n@@ -${oldBefore + 1},${oldCount} +${newBefore + 1},${newCount} @@\n${body}`
}
