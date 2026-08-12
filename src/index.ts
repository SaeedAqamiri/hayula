import { tool, type Plugin } from "@opencode-ai/plugin"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  NOTEBOOK_NAME,
  emptyNotebook,
  type BasedOn,
  type Confidence,
  type Freshness,
  type Notebook,
  type Op,
  applyOps,
  buildSkeleton,
  hydrateBasedOn,
  itemFreshness,
  listNotebooks,
  maxConfidence,
  parseNotebook,
  relationFolder,
  relTo,
  scoreEntry,
  scoreRelation,
  serializeNotebook,
} from "./notebook.ts"

const CACHE_TTL = 30_000
const INJECTION_LIMIT = 2_500
const SESSION_CAP = 40
const NUDGE_COOLDOWN = 10 * 60_000
const MIN_SUMMARY_CHARS = 40
const SUBSTANTIVE_TEXT = 160
const NOTE_LIMIT = 700
const ATTACH_TOOLS = new Set(["read", "edit", "write", "apply_patch"])

type SessionEvidence = {
  reads: Set<string>
  areas: Set<string>
  dirty: boolean
  lastRemind: number
}

type EntryInput = {
  path: string
  summary: string
  based_on?: string[]
  confidence?: Confidence
}

type FolderInput = {
  path: string
  summary: string
  based_on?: string[]
}

type RelationInput = {
  from: string
  to: string
  description: string
  based_on?: string[]
  confidence?: Confidence
}

// ---------- commit quality gate ----------

const hasNonLatinScript = (text: string): boolean =>
  // eslint-disable-next-line no-control-regex
  /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0900-\u097F]./u.test(text)

/** A summary is usable mid-task only if it names concrete symbols, not just describes them in vague prose. */
const hasConcreteAnchor = (text: string): boolean =>
  // CamelCase symbol (class/service name), e.g. ProgressiveMemoryService
  /[A-Z][a-z]+[A-Z][A-Za-z]*/.test(text) ||
  // snake_case identifier, e.g. create_candidate
  /[a-z][a-z0-9]*_[a-z0-9]+/.test(text) ||
  // file/module reference with an extension, e.g. retrieval.py
  /\.[a-z]{2,4}\b/.test(text) ||
  // backtick code span or a bare function call
  /`[^`\n]+`|\b[A-Za-z_][A-Za-z0-9_]*\(\)/.test(text)

function gateProblems(input: {
  folder_summaries?: FolderInput[]
  entries?: EntryInput[]
  relations?: RelationInput[]
}): string[] {
  const lines: string[] = []
  const note = (where: string, issue: string) => lines.push(`- ${where}: ${issue}`)
  for (const item of input.folder_summaries ?? []) {
    const s = item.summary?.trim() ?? ""
    const where = `folder_summaries[${item.path}]`
    if (!s) note(where, "empty summary")
    else if (hasNonLatinScript(s)) note(where, "not written in English (a non-Latin script was detected)")
    else if (s.length < MIN_SUMMARY_CHARS) note(where, `summary is too thin (< ${MIN_SUMMARY_CHARS} chars); fold in the prior folder summary and the concrete role`)
  }
  for (const item of input.entries ?? []) {
    const s = item.summary?.trim() ?? ""
    const where = `entries[${item.path}]`
    if (!s) note(where, "empty summary")
    else if (hasNonLatinScript(s)) note(where, "not written in English (a non-Latin script was detected)")
    else if (s.length < MIN_SUMMARY_CHARS) note(where, `summary is too thin (< ${MIN_SUMMARY_CHARS} chars); fold in the prior summary and concrete detail`)
    else if (!hasConcreteAnchor(s)) note(where, "summary is vague — name the concrete symbols (classes/functions/modules) so the note is usable mid-task")
    if ((item.based_on ?? []).length === 0) note(where, "no based_on files referenced")
  }
  for (const item of input.relations ?? []) {
    const s = item.description?.trim() ?? ""
    const where = `relations[${item.from} → ${item.to}]`
    if (!s) note(where, "empty description")
    else if (hasNonLatinScript(s)) note(where, "not written in English (a non-Latin script was detected)")
    else if (s.length < MIN_SUMMARY_CHARS) note(where, `description is too thin (< ${MIN_SUMMARY_CHARS} chars); describe the concrete connection`)
    if (s && !hasConcreteAnchor(s)) note(where, "description is vague — name which functions/classes connect")
    if ((item.based_on ?? []).length === 0) note(where, "no based_on files referenced")
  }
  return lines
}

export const NotesPlugin: Plugin = async ({ worktree }) => {
  const sessions = new Map<string, SessionEvidence>()
  const injected = new Map<string, string>()
  const digestCache = new Map<string, { at: number; text: string }>()
  const walkCache = new Map<string, { at: number; paths: string[] }>()
  const textCache = new Map<string, { at: number; notebook: Notebook }>()
  const skeletonCache = new Map<string, { at: number; value: Awaited<ReturnType<typeof buildSkeleton>> }>()

  function relative(abs: string): string {
    return path.relative(worktree, abs).replaceAll("\\", "/") || "."
  }

  function normalizeRel(value: string): string {
    const cleaned = value.trim().replaceAll("\\", "/").replace(/^\.\//, "")
    if (path.isAbsolute(cleaned)) {
      const rel = path.relative(worktree, cleaned).replaceAll("\\", "/")
      if (!rel.startsWith("..")) return rel
      return cleaned
    }
    return cleaned
  }

  function notebookPathFor(folder: string): string {
    return path.join(worktree, folder, NOTEBOOK_NAME)
  }

  async function notebookPaths(): Promise<string[]> {
    const hit = walkCache.get(worktree)
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.paths
    const paths = await listNotebooks(worktree)
    walkCache.set(worktree, { at: Date.now(), paths })
    return paths
  }

  async function loadNotebook(abs: string): Promise<Notebook> {
    const hit = textCache.get(abs)
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.notebook
    const content = await readFile(abs, "utf8").catch(() => "")
    const notebook = parseNotebook(content, path.dirname(abs), relative(path.dirname(abs)))
    textCache.set(abs, { at: Date.now(), notebook })
    return notebook
  }

  async function loadOrEmpty(folder: string): Promise<Notebook> {
    const abs = notebookPathFor(folder)
    return loadNotebook(abs).catch(() => emptyNotebook(path.join(worktree, folder), folder || "."))
  }

  async function saveNotebook(abs: string, notebook: Notebook) {
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, serializeNotebook(notebook), "utf8")
    textCache.set(abs, { at: Date.now(), notebook })
  }

  function invalidateWorktree() {
    walkCache.clear()
    skeletonCache.clear()
    digestCache.clear()
  }

  function sessionEvidence(sessionID: string): SessionEvidence {
    if (sessions.size >= SESSION_CAP) {
      const first = sessions.keys().next().value
      if (first) sessions.delete(first)
    }
    let entry = sessions.get(sessionID)
    if (!entry) {
      entry = { reads: new Set(), areas: new Set(), dirty: false, lastRemind: 0 }
      sessions.set(sessionID, entry)
    }
    return entry
  }

  function recordExploration(sessionID: string, filePath: string) {
    const evidence = sessionEvidence(sessionID)
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(worktree, filePath)
    const rel = relative(abs)
    if (rel === "." || rel.startsWith("..")) return
    evidence.reads.add(abs)
    const dir = path.posix.dirname(rel)
    if (dir !== ".") evidence.areas.add(dir)
    else evidence.areas.add("/")
    evidence.dirty = true
  }

  /** `path`/`pattern` args from directory-indexing tools (grep/glob) narrow an area, not a single file. */
  function recordArea(sessionID: string, areaPath: string) {
    const evidence = sessionEvidence(sessionID)
    const rel = normalizeRel(areaPath)
    if (rel === "." || rel.startsWith("..") || rel.includes("*")) return
    const dir = path.posix.dirname(rel)
    evidence.areas.add(dir !== "." ? dir : "/")
    evidence.dirty = true
  }

  async function commitSuggestion(evidence: SessionEvidence): Promise<string | undefined> {
    if (!evidence.dirty || Date.now() - evidence.lastRemind < NUDGE_COOLDOWN) return

    const candidates: string[] = []
    for (const abs of evidence.reads) {
      if (candidates.length >= 4) break
      const rel = relative(abs)
      if (rel === "." || rel.startsWith("..")) continue
      const dir = path.posix.dirname(rel)
      const name = path.posix.basename(rel)
      try {
        const nb = await loadOrEmpty(dir)
        const entry = nb.entries[name]
        if (entry && (await freshnessOf(entry.based_on)) === "fresh") continue
        candidates.push(rel)
      } catch {
        continue
      }
    }

    const areas = Array.from(evidence.areas).slice(0, 3).join(", ")
    const files =
      candidates.length > 0
        ? `Newly explored but not yet recorded: ${candidates.map((c) => `\`${c}\``).join(", ")}.`
        : ""
    const suggestion = [
      "## Save your learnings",
      `You explored ${areas || "the repository"} and have not saved learnings yet.`,
      files,
      "When you finish the current task — including a pure explanation or Q&A — call `notes_commit` with the durable takeaways.",
      "Summaries must be English, source-backed, and at least 40 chars (the plugin gates empty/thin/non-English entries).",
      "The user will approve or reject the change (a diff is shown). Only call it when there is something worth remembering.",
    ]
      .filter((line) => line !== "")
      .join("\n")

    evidence.lastRemind = Date.now()
    return suggestion
  }

  /** Turn-aware dirt marking: a substantive reply indicates understanding worth persisting, not just file reads. */
  function markUnderstanding(sessionID: string, textLength: number) {
    if (textLength >= SUBSTANTIVE_TEXT) sessionEvidence(sessionID).dirty = true
  }

  function badge(freshness: Freshness): string {
    return freshness === "fresh" ? "✓" : freshness === "suspect" ? "⚠ suspect" : "✗ stale"
  }

  async function freshnessOf(basedOn: BasedOn): Promise<Freshness> {
    return itemFreshness(basedOn, worktree)
  }

  /** Single file path the given tool worked on, or "" when it is not a path-touching tool. */
  function attachFileRel(args: unknown): string {
    if (!args || typeof args !== "object") return ""
    const record = args as Record<string, unknown>
    if (typeof record.filePath === "string" && record.filePath.trim()) return normalizeRel(record.filePath)
    if (Array.isArray(record.files)) {
      for (const file of record.files) {
        if (!file || typeof file !== "object") continue
        const item = file as Record<string, unknown>
        const p = typeof item.filePath === "string" ? item.filePath : item.relativePath
        if (typeof p === "string" && p.trim()) return normalizeRel(p)
      }
    }
    return ""
  }

  /** Leaf note for a file, surfaced at the moment the agent first works on it. */
  async function buildAttachNote(rel: string): Promise<string> {
    if (rel === "." || rel.startsWith("..")) return ""
    const folder = path.posix.dirname(rel)
    const name = path.posix.basename(rel)
    try {
      const nb = await loadOrEmpty(folder)
      const entry = nb.entries[name]
      if (!entry) return ""
      const freshness = await freshnessOf(entry.based_on)
      const confidence = entry.confidence === "observed" ? "" : ` · ${entry.confidence}`
      return (
        `## Local notebook · ${rel} [${badge(freshness)}]${confidence}\n` +
        `${entry.summary}\n\n` +
        "_Memory is a hint, not ground truth — trust the file you are working on over this note._"
      ).slice(0, NOTE_LIMIT)
    } catch {
      return ""
    }
  }

  /** Prepend the note to a tool's model-visible text output. */
  function prependAttachNote(output: string, note: string): string {
    return note ? `${note}\n\n${output}` : output
  }

  async function allNotebooks(): Promise<Notebook[]> {
    const paths = await notebookPaths()
    const out: Notebook[] = []
    for (const abs of paths) out.push(await loadNotebook(abs))
    return out
  }

  function scoredEntries(nbs: Notebook[], query: string, limit: number) {
    const out: Array<{ nb: Notebook; name: string; summary: string; basedOn: BasedOn; confidence: Confidence; score: number }> = []
    for (const nb of nbs) {
      for (const entry of Object.values(nb.entries)) {
        out.push({
          nb,
          name: entry.name,
          summary: entry.summary,
          basedOn: entry.based_on,
          confidence: entry.confidence,
          score: scoreEntry(entry, query),
        })
      }
    }
    return out
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  function scoredRelations(nbs: Notebook[], query: string, limit: number) {
    const out: Array<{ nb: Notebook; rel: { from: string; to: string; description: string }; basedOn: BasedOn; score: number }> = []
    for (const nb of nbs) {
      for (const rel of nb.relations) {
        out.push({ nb, rel, basedOn: rel.based_on, score: scoreRelation(rel, query) })
      }
    }
    return out
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  async function buildDigest(limit = INJECTION_LIMIT): Promise<string> {
    const hit = digestCache.get(worktree)
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.text
    const text = await computeDigest(limit)
    digestCache.set(worktree, { at: Date.now(), text })
    return text
  }

  async function computeDigest(limit = INJECTION_LIMIT): Promise<string> {
    const nbs = await allNotebooks()
    if (nbs.length === 0) return ""
    let suspect = 0
    let stale = 0
    let itemCount = 0
    for (const nb of nbs) {
      for (const entry of Object.values(nb.entries)) {
        const freshness = await freshnessOf(entry.based_on)
        itemCount++
        if (freshness === "suspect") suspect++
        else if (freshness === "stale") stale++
      }
      for (const rel of nb.relations) {
        const freshness = await freshnessOf(rel.based_on)
        itemCount++
        if (freshness === "suspect") suspect++
        else if (freshness === "stale") stale++
      }
    }
    const lines: string[] = []
    lines.push("## Notebook memory (notes plugin)")
    lines.push(
      `Coverage: ${nbs.length} notebook${nbs.length === 1 ? "" : "s"} · ${itemCount} entr${itemCount === 1 ? "y" : "ies"}${suspect ? ` · ${suspect} suspect` : ""}${stale ? ` · ${stale} stale` : ""}`,
    )
    for (const nb of nbs) {
      if (!nb.summary && Object.keys(nb.entries).length === 0) continue
      const head = `- \`${nb.rel || "."}\``
      const body: string[] = []
      if (nb.summary) body.push(nb.summary)
      for (const entry of Object.values(nb.entries).slice(0, 2)) body.push(`  · ${entry.name}: ${entry.summary}`)
      const block = [head, ...body].join("\n")
      lines.push(block)
      if (lines.join("\n").length > limit) break
    }
    lines.push("")
    lines.push("This notebook memory MUST be read via the `notes_get` tool — never read `.note.yaml` files directly with read/grep (that bypasses tracking and freshness badges). At the start of a task call `notes_get`; when a task is done call `notes_commit`. Write every notebook summary in English, even when the conversation is in another language.")
    return lines.join("\n")
  }

  const notesGet = tool({
    description:
      "Query the project's notebook memory — a per-folder mental model (`.note.yaml`) the agent accumulated in previous tasks: folder summaries, per-file/dir summaries, and cross-file relations. This is the ONLY supported way to read notebook memory — never read `.note.yaml` files directly with read/grep. Call at the START of a task, before exploring, to recall what is already known — AND again mid-task before working on any file/dir you have not consulted this session (a note for the file you just touched is auto-attached to read/edit results on first touch). Two modes: pass `path` to read the ancestor chain for that file/dir (root → leaf, most local knowledge last), or pass `task` to keyword-search all notebooks. It is cheap and local — it returns only the relevant subtree, so use it freely mid-task rather than re-reading code. Entries carry a freshness badge: ✓ fresh, ⚠ suspect (source changed), ✗ stale (source gone). Hints, not ground truth — trust the code over the notebook.",
    args: {
      task: tool.schema.string().optional().describe("A description of what you are about to do; matched against all notebooks."),
      path: tool.schema
        .string()
        .optional()
        .describe("A file or directory (relative to the project root). Returns the ancestor-chain memory for it."),
      limit: tool.schema.number().int().min(1).max(50).optional().describe("Max results (default 20)."),
    },
    async execute(args, ctx) {
      const nbs = await allNotebooks()
      const byRel = new Map(nbs.map((nb) => [nb.rel, nb]))
      const lines: string[] = []
      const limit = args.limit ?? 20

      if (args.path) {
        const target = normalizeRel(args.path)
        const targetDir = path.posix.dirname(target)
        const parts = targetDir === "." ? [] : targetDir.split("/")
        const chain: string[] = []
        for (let i = 0; i <= parts.length; i++) chain.push(parts.slice(0, i).join("/"))
        // When the target is a directory that carries its own notebook, descend into it
        // as a leaf so its summary/entries/relations are shown (not just the parent chain).
        if (byRel.has(target)) chain.push(target)
        const leaf = chain[chain.length - 1]

        lines.push(`## Notebook memory · ${target}`)
        let shown = 0
        for (let i = 0; i < chain.length; i++) {
          const dir = chain[i]
          const nb = byRel.get(dir)
          if (!nb || (!nb.summary && Object.keys(nb.entries).length === 0 && nb.relations.length === 0)) continue
          const isLeaf = dir === leaf
          if (i === chain.length - 1) {
            lines.push(`### ${dir || "."}`)
          } else {
            lines.push(`### ${dir || "."}`)
          }
          if (nb.summary) {
            const f = await freshnessOf(nb.based_on)
            lines.push(`- [${badge(f)}] **folder** — ${nb.summary}`)
            shown++
          }
          if (isLeaf) {
            for (const entry of Object.values(nb.entries)) {
              const f = await freshnessOf(entry.based_on)
              lines.push(`- [${badge(f)}] **${entry.name}** — ${entry.summary}`)
              shown++
            }
            for (const rel of nb.relations) {
              const f = await freshnessOf(rel.based_on)
              lines.push(`- [${badge(f)}] **rel ${rel.from} → ${rel.to}** — ${rel.description}`)
              shown++
            }
          } else {
            const next = chain[i + 1]
            const child = next ? path.posix.basename(next) : ""
            const descent = child ? nb.entries[child] : undefined
            if (descent) {
              const f = await freshnessOf(descent.based_on)
              lines.push(`- [${badge(f)}] **${child}/** — ${descent.summary}`)
              shown++
            }
          }
        }
        if (shown === 0) lines.push("_No memory on this path yet — explore with read/grep and commit what you learn._")
      }

      if (args.task) {
        const hits = scoredEntries(nbs, args.task, limit)
        const relHits = scoredRelations(nbs, args.task, limit)
        lines.push("")
        lines.push(`## Matches for "${args.task}"`)
        if (hits.length === 0 && relHits.length === 0) {
          lines.push("_Nothing relevant in the notebooks for this yet._")
        }
        for (const hit of hits) {
          const f = await freshnessOf(hit.basedOn)
          lines.push(`- [${badge(f)}] \`${hit.nb.rel || "."}\` · **${hit.name}** — ${hit.summary}`)
        }
        for (const hit of relHits) {
          const f = await freshnessOf(hit.basedOn)
          lines.push(`- [${badge(f)}] \`${hit.nb.rel || "."}\` · **rel ${hit.rel.from} → ${hit.rel.to}** — ${hit.rel.description}`)
        }
      }

      lines.push("")
      lines.push("### Repo skeleton")
      const skeleton = await cachedSkeleton()
      if (skeleton.length === 0) {
        lines.push("_no top-level source directories_")
      } else {
        for (const entry of skeleton) {
          const sample = entry.sample.length > 0 ? ` · e.g. ${entry.sample.join(", ")}` : ""
          lines.push(`- \`${entry.rel}/\` (${entry.dirs} dirs, ${entry.files} files)${sample}`)
        }
      }
      lines.push("")
      lines.push("Notebook entries are hints, not ground truth — re-verify before trusting, especially ⚠/✗ entries.")

      const header = args.path ? args.path : args.task ? `"${args.task}"` : "all"
      return { title: `notes_get: ${header}`, output: lines.join("\n") }
    },
  })

  const notesCommit = tool({
    description:
      "Write what a task learned into the per-folder notebooks (`.note.yaml`), the way a senior engineer's mental model accumulates. Call this when you finish a task that produced durable understanding — INCLUDING a pure explanation or Q&A (e.g. 'explain this repo', 'why does this bug happen'): explaining the code is real understanding, so offer to save the map, the architecture, and the gotchas you found.\nThree kinds of knowledge:\n- `folder_summaries`: the role of a whole subtree (high-level, abstract — the higher the folder, the more abstract it should be).\n- `entries`: knowledge about ONE file or subdirectory, written as its compact summary. A directory's notebook describes only its IMMEDIATE children — put deep-file knowledge in the notebook of the folder that directly contains it.\n- `relations`: a connection between two files/dirs. These are placed automatically in the notebook of their lowest common ancestor.\nWrite REWRITTEN compact summaries, not additions — read the old summary via notes_get, fold the new understanding into it, and pass the result. Keep summaries to a paragraph. Write every summary in English even if the user wrote in another language. Skip line-level detail; that lives in source code. Requires user approval (shows a diff) — the user may reject; that is fine.",
    args: {
      task: tool.schema.string().describe("The task that produced these learnings (e.g. 'fix-password-reset-bug')."),
      folder_summaries: tool.schema
        .array(
          tool.schema.object({
            path: tool.schema.string().describe("A directory, relative to the project root."),
            summary: tool.schema.string().describe("The folder's role — abstract, one paragraph."),
            based_on: tool.schema.array(tool.schema.string()).optional().describe("file paths (relative to root) this summary is based on; hashes are filled automatically."),
          }),
        )
        .optional(),
      entries: tool.schema
        .array(
          tool.schema.object({
            path: tool.schema.string().describe("A file or directory, relative to the project root. Stored in the notebook of its direct parent."),
            summary: tool.schema.string().describe("The rewritten compact summary of this entry."),
            based_on: tool.schema.array(tool.schema.string()).optional().describe("file paths this summary is based on; hashes are filled automatically."),
            confidence: tool.schema.enum(["observed", "inferred", "verified"]).optional(),
          }),
        )
        .optional(),
      relations: tool.schema
        .array(
          tool.schema.object({
            from: tool.schema.string().describe("Source file path, relative to the project root."),
            to: tool.schema.string().describe("Target file path, relative to the project root."),
            description: tool.schema.string().describe("What connects them — one sentence."),
            based_on: tool.schema.array(tool.schema.string()).optional(),
            confidence: tool.schema.enum(["observed", "inferred", "verified"]).optional(),
          }),
        )
        .optional(),
      removed: tool.schema
        .object({
          entries: tool.schema.array(tool.schema.string()).optional().describe("Entry file/dir paths to remove."),
          relations: tool.schema
            .array(tool.schema.object({ from: tool.schema.string(), to: tool.schema.string() }))
            .optional(),
        })
        .optional(),
    },
    async execute(args, ctx) {
      const now = new Date().toISOString()
      const evidence = sessionEvidence(ctx.sessionID)
      const opsByFolder = new Map<string, Op[]>()

      function pushOp(folder: string, op: Op) {
        const bucket = opsByFolder.get(folder) ?? []
        bucket.push(op)
        opsByFolder.set(folder, bucket)
      }

      const readAny = (file: string) => evidence.reads.has(path.resolve(worktree, normalizeRel(file)))

      for (const item of args.folder_summaries ?? []) {
        const folder = normalizeRel(item.path)
        const basedOn = await hydrateBasedOn(item.based_on ?? [], worktree)
        pushOp(folder, { kind: "folder", summary: item.summary, basedOn })
      }

      for (const item of args.entries ?? []) {
        const full = normalizeRel(item.path)
        const folder = path.posix.dirname(full)
        const name = path.posix.basename(full)
        const basedOn = await hydrateBasedOn(item.based_on ?? [full], worktree)
        const confidence: Confidence = item.confidence ?? "observed"
        const finalConfidence = confidence === "observed" && !readAny(full) ? "inferred" : confidence
        pushOp(folder, { kind: "entry", name, summary: item.summary, basedOn, confidence: finalConfidence })
      }

      for (const item of args.relations ?? []) {
        const from = normalizeRel(item.from)
        const to = normalizeRel(item.to)
        const folder = relationFolder(from, to)
        const basedOn = await hydrateBasedOn(item.based_on ?? [], worktree)
        const confidence: Confidence = item.confidence ?? "observed"
        const finalConfidence = confidence === "observed" && !(readAny(from) || readAny(to)) ? "inferred" : confidence
        pushOp(folder, {
          kind: "relation",
          from: relTo(from, folder),
          to: relTo(to, folder),
          description: item.description,
          basedOn,
          confidence: finalConfidence,
        })
      }

      for (const entryPath of args.removed?.entries ?? []) {
        const full = normalizeRel(entryPath)
        pushOp(path.posix.dirname(full), { kind: "removeEntry", name: path.posix.basename(full) })
      }
      for (const rel of args.removed?.relations ?? []) {
        const from = normalizeRel(rel.from)
        const to = normalizeRel(rel.to)
        const folder = relationFolder(from, to)
        pushOp(folder, { kind: "removeRelation", from: relTo(from, folder), to: relTo(to, folder) })
      }

      const gate = gateProblems(args)
      const hasAdded =
        (args.folder_summaries?.length ?? 0) > 0 || (args.entries?.length ?? 0) > 0 || (args.relations?.length ?? 0) > 0
      if (hasAdded && evidence.reads.size === 0) {
        gate.push(
          "- the session has not read any files in this worktree; read/grep the files you describe first (pure removals are exempt)",
        )
      }
      if (gate.length > 0) {
        return {
          title: "notes_commit",
          output:
            "notes_commit was NOT applied. Good, English, source-backed summaries were required before saving:\n" +
            gate.join("\n"),
        }
      }

      if (opsByFolder.size === 0) {
        return { title: "notes_commit", output: "Nothing to write — provide folder_summaries, entries, relations, or removed." }
      }

      // Per-note review: one question for each distinct op (folder/entry/
      // relation/remove), even when several ops land in the same notebook.
      type ReviewItem = {
        folder: string
        op: Op
        header: string
        question: string
        content: string | undefined
        contentField: "summary" | "description" | undefined
        remove: boolean
      }
      const items: ReviewItem[] = []
      for (const [folder, ops] of opsByFolder) {
        const folderDisplay = folder || "."
        for (const op of ops) {
          if (op.kind === "folder") {
            items.push({
              folder,
              op,
              header: `folder ${folderDisplay}`,
              question: `Set the folder summary for ${folderDisplay}. Review or edit the content below:`,
              content: op.summary,
              contentField: "summary",
              remove: false,
            })
          } else if (op.kind === "entry") {
            items.push({
              folder,
              op,
              header: op.name,
              question: `Set the summary for entry ${op.name} in ${folderDisplay}. Review or edit the content below:`,
              content: op.summary,
              contentField: "summary",
              remove: false,
            })
          } else if (op.kind === "relation") {
            items.push({
              folder,
              op,
              header: `${op.from} → ${op.to}`,
              question: `Set the description for relation ${op.from} → ${op.to}. Review or edit the content below:`,
              content: op.description,
              contentField: "description",
              remove: false,
            })
          } else if (op.kind === "removeEntry") {
            items.push({
              folder,
              op,
              header: op.name,
              question: `Remove entry ${op.name} in ${folderDisplay}?`,
              content: undefined,
              contentField: undefined,
              remove: true,
            })
          } else if (op.kind === "removeRelation") {
            items.push({
              folder,
              op,
              header: `${op.from} → ${op.to}`,
              question: `Remove relation ${op.from} → ${op.to}?`,
              content: undefined,
              contentField: undefined,
              remove: true,
            })
          }
        }
      }

      const questions = items.map((item) => ({
        question: item.question,
        header: item.header,
        options: item.remove
          ? [
              { label: "Confirm & remove", description: "Remove it from the notebook." },
              { label: "Keep", description: "Leave it as is and move on." },
            ]
          : [
              { label: "Save as proposed", description: "Write this note as shown in the text box below." },
              { label: "Skip", description: "Skip this note and move on." },
            ],
        default: item.content,
      }))

      let answers: ReadonlyArray<ReadonlyArray<string>>
      try {
        answers = await ctx.question({ questions })
      } catch {
        return { title: "notes_commit", output: "Review cancelled — no notebooks were written." }
      }

      const approved = new Map<string, Op[]>()
      const editedFolders = new Set<string>()
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const chosen = answers[i] ?? []
        if (item.remove) {
          if (chosen.includes("Keep")) continue
          const bucket = approved.get(item.folder) ?? []
          bucket.push(item.op)
          approved.set(item.folder, bucket)
          continue
        }
        if (chosen.includes("Skip")) continue
        const edited = chosen[0]?.trim()
        const applied = edited && !chosen.includes("Save as proposed") ? ({ ...item.op, [item.contentField!]: edited } as Op) : item.op
        const bucket = approved.get(item.folder) ?? []
        bucket.push(applied)
        approved.set(item.folder, bucket)
        if ((applied as any)[item.contentField!] !== (item as any).content) editedFolders.add(item.folder)
      }

      if (approved.size === 0) {
        return { title: "notes_commit", output: "Review skipped — no notebooks were written." }
      }

      const edits: Array<{ abs: string; label: string; notebook: Notebook; changes: string[]; edited: boolean }> = []
      for (const [folder, ops] of approved) {
        const resolvedFolder = normalizeRel(folder)
        // Sandbox: drop writes that would land outside the session worktree.
        // The project root ("" or ".") is inside the worktree and is allowed.
        const target = path.resolve(worktree, resolvedFolder)
        if (target !== worktree && !target.startsWith(worktree + path.sep)) continue
        const notebook = await loadOrEmpty(resolvedFolder)
        const result = applyOps(notebook, ops)
        if (!result.dirty) continue
        edits.push({
          abs: notebookPathFor(resolvedFolder),
          label: `${resolvedFolder || "."}/${NOTEBOOK_NAME}`,
          notebook: { ...result.nb, updated: now },
          changes: result.changes,
          edited: editedFolders.has(folder),
        })
      }
      invalidateWorktree()

      if (edits.length === 0) {
        return {
          title: "notes_commit",
          output: "Nothing changed — summaries already match, and nothing in `removed` was found.",
        }
      }

      for (const edit of edits) await saveNotebook(edit.abs, edit.notebook)
      sessionEvidence(ctx.sessionID).dirty = false

      const result: string[] = []
      for (const edit of edits) {
        result.push(`- ${edit.label}: ${edit.changes.join("; ")}${edit.edited ? " (content edited during review)" : ""}`)
      }
      return { title: `notes_commit: ${result.length} notebook${result.length === 1 ? "" : "s"}`, output: result.join("\n") }
    },
  })

  async function cachedSkeleton() {
    const hit = skeletonCache.get(worktree)
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value
    const value = await buildSkeleton(worktree)
    skeletonCache.set(worktree, { at: Date.now(), value })
    return value
  }

  return {
    tool: {
      notes_get: notesGet,
      notes_commit: notesCommit,
    },
    "experimental.chat.system.transform": async (input, output) => {
      const sessionID = input.sessionID
      if (!sessionID) return
      const digest = await buildDigest().catch(() => "")
      if (digest && injected.get(sessionID) !== digest) {
        output.system.push(digest)
        injected.set(sessionID, digest)
      }
      const evidence = sessions.get(sessionID)
      if (!evidence) return
      const nudge = await commitSuggestion(evidence).catch(() => undefined)
      if (nudge) output.system.push(nudge)
    },
    "chat.message": async (input, output) => {
      let textLength = 0
      for (const part of output.parts) {
        if (part.type === "text" && typeof part.text === "string") textLength += part.text.length
      }
      markUnderstanding(input.sessionID, textLength)
    },
    "tool.execute.after": async (input, output) => {
      const tool = input.tool ?? ""
      // Attach the relevant per-file notebook note to the tool output the first
      // time the agent works on a file, so leaf memory reaches the model mid-task.
      if (ATTACH_TOOLS.has(tool)) {
        const rel = attachFileRel(input.args)
        if (rel && typeof output.output === "string") {
          const evidence = sessionEvidence(input.sessionID)
          if (!evidence.reads.has(path.resolve(worktree, rel))) {
            const note = await buildAttachNote(rel)
            output.output = prependAttachNote(output.output, note)
          }
        }
      }
      const fileArg = input.args?.filePath
      if (typeof fileArg === "string" && fileArg.trim()) {
        recordExploration(input.sessionID, fileArg)
        return
      }
      // Only treat a bare `path` arg as exploration for tools that genuinely index
      // the filesystem; generic `path` args (e.g. notes_get) are not file reads.
      if (tool === "grep" || tool === "glob") {
        const areaArg = input.args?.path ?? input.args?.pattern
        if (typeof areaArg === "string" && areaArg.trim()) {
          recordArea(input.sessionID, areaArg)
          return
        }
      }
      if (tool === "apply_patch") {
        const files = input.args?.files
        if (Array.isArray(files)) {
          for (const file of files) {
            const p = typeof file?.filePath === "string" ? file.filePath : file?.relativePath
            if (typeof p === "string") recordExploration(input.sessionID, p)
          }
        }
      }
    },
    event: async ({ event }) => {
      if (event.type === "session.deleted") {
        const sessionID = event.properties.info.id
        sessions.delete(sessionID)
        injected.delete(sessionID)
      }
    },
  }
}
