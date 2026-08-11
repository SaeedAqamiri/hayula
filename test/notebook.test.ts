import { describe, expect, test } from "bun:test"
import {
  applyOps,
  buildSkeleton,
  emptyNotebook,
  itemFreshness,
  parseNotebook,
  relationFolder,
  relTo,
  serializeNotebook,
  unifiedDiff,
  type Entry,
  type Notebook,
  type Relation,
} from "../src/notebook.ts"

function entry(name: string, summary: string): Entry {
  return { name, summary, based_on: [`src/auth/${name}@abc`], confidence: "observed" }
}

function relation(from: string, to: string, description: string): Relation {
  return { from, to, description, based_on: [], confidence: "observed" }
}

function nb(overrides: Partial<Notebook> = {}): Notebook {
  return {
    dir: "/p/src/auth",
    rel: "src/auth",
    summary: "Authentication subsystem",
    based_on: [],
    entries: { "login.ts": entry("login.ts", "Password login"), "session.ts": entry("session.ts", "Session handling") },
    relations: [relation("login.ts", "session.ts", "Login creates a session")],
    updated: "2026-08-09T10:00:00.000Z",
    ...overrides,
  }
}

describe("parse/serialize roundtrip", () => {
  test("roundtrips a notebook with entries and relations", () => {
    const text = serializeNotebook(nb())
    const parsed = parseNotebook(text, "/p/src/auth", "src/auth")
    expect(parsed.rel).toBe("src/auth")
    expect(parsed.summary).toBe("Authentication subsystem")
    expect(Object.keys(parsed.entries)).toEqual(["login.ts", "session.ts"])
    expect(parsed.entries["session.ts"].summary).toBe("Session handling")
    expect(parsed.entries["session.ts"].based_on).toEqual(["src/auth/session.ts@abc"])
    expect(parsed.relations).toHaveLength(1)
    expect(parsed.relations[0]).toEqual(relation("login.ts", "session.ts", "Login creates a session"))
  })

  test("empty notebook roundtrips", () => {
    const text = serializeNotebook(emptyNotebook("/p", "."))
    const parsed = parseNotebook(text, "/p", ".")
    expect(parsed.summary).toBe("")
    expect(Object.keys(parsed.entries)).toHaveLength(0)
    expect(parsed.relations).toHaveLength(0)
  })

  test("survives block-scalar folding", () => {
    const long =
      "Creates, validates and invalidates user sessions. Expiration is checked lazily during validation, and credential changes invalidate every active session."
    const parsed = parseNotebook(serializeNotebook(nb({ entries: { "session.ts": entry("session.ts", long) } })), "/p/src/auth", "src/auth")
    expect(parsed.entries["session.ts"].summary).toBe(long)
  })
})

describe("tree placement", () => {
  test("relation folder is the LCA", () => {
    expect(relationFolder("src/auth/login.ts", "src/auth/session.ts")).toBe("src/auth")
    expect(relationFolder("src/auth/session.ts", "src/billing/customer.ts")).toBe("src")
    expect(relationFolder("login.ts", "session.ts")).toBe("")
    expect(relationFolder("src/auth/oauth/google.ts", "src/auth/oauth/github.ts")).toBe("src/auth/oauth")
  })

  test("relTo is relative to the folder", () => {
    expect(relTo("src/auth/oauth/google.ts", "src/auth")).toBe("oauth/google.ts")
    expect(relTo("src/auth/login.ts", "src/auth")).toBe("login.ts")
  })
})

describe("applyOps", () => {
  test("adds an entry", () => {
    const { dirty, changes } = applyOps(nb(), [{ kind: "entry", name: "reset.ts", summary: "Password reset", basedOn: ["src/auth/reset.ts@x"], confidence: "observed" }])
    expect(dirty).toBe(true)
    expect(changes).toEqual(["entry reset.ts added"])
  })

  test("rewrites an existing entry summary (compression)", () => {
    const result = applyOps(nb(), [{ kind: "entry", name: "session.ts", summary: "New compact summary", basedOn: ["src/auth/session.ts@y"], confidence: "verified" }])
    expect(result.changes).toEqual(["entry session.ts updated"])
    const updated = result.nb.entries["session.ts"]
    expect(updated.summary).toBe("New compact summary")
    expect(updated.confidence).toBe("verified")
    expect(updated.based_on).toContain("src/auth/session.ts@abc")
    expect(updated.based_on).toContain("src/auth/session.ts@y")
  })

  test("no-op when summary unchanged", () => {
    const result = applyOps(nb(), [{ kind: "entry", name: "session.ts", summary: "Session handling", basedOn: [], confidence: "observed" }])
    expect(result.dirty).toBe(false)
  })

  test("updates folder summary", () => {
    const result = applyOps(nb(), [{ kind: "folder", summary: "Auth + identity", basedOn: [] }])
    expect(result.dirty).toBe(true)
    expect(result.nb.summary).toBe("Auth + identity")
  })

  test("adds and dedupes relations by from/to", () => {
    const first = applyOps(nb(), [{ kind: "relation", from: "a.ts", to: "b.ts", description: "A calls B", basedOn: [], confidence: "observed" }])
    expect(first.nb.relations).toHaveLength(2)
    const second = applyOps(nb(), [{ kind: "relation", from: "login.ts", to: "session.ts", description: "New desc", basedOn: [], confidence: "verified" }])
    expect(second.nb.relations).toHaveLength(1)
    expect(second.nb.relations[0].description).toBe("New desc")
  })

  test("removes entries and relations", () => {
    const result = applyOps(nb(), [
      { kind: "removeEntry", name: "login.ts" },
      { kind: "removeRelation", from: "login.ts", to: "session.ts" },
    ])
    expect(result.nb.entries["login.ts"]).toBeUndefined()
    expect(result.nb.relations).toHaveLength(0)
  })
})

describe("freshness", () => {
  test("stale when a based_on file is missing", async () => {
    expect(await itemFreshness(["missing.ts@abc"], "/tmp")).toBe("stale")
  })

  test("fresh when no provenance", async () => {
    expect(await itemFreshness([], "/tmp")).toBe("fresh")
  })
})

describe("skeleton", () => {
  test("lists top-level dirs", async () => {
    const skeleton = await buildSkeleton("/tmp")
    expect(Array.isArray(skeleton)).toBe(true)
  })
})

describe("unifiedDiff", () => {
  test("produces a diff with + and - lines", () => {
    const diff = unifiedDiff("a\nb\nc\n", "a\nB\nc\n", "test")
    expect(diff).toContain("-b")
    expect(diff).toContain("+B")
    expect(diff).toContain("@@")
  })

  test("empty when unchanged", () => {
    expect(unifiedDiff("x\ny\n", "x\ny\n", "test")).toBe("")
  })
})
