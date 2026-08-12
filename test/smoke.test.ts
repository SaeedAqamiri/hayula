import { afterAll, describe, expect, test } from "bun:test"
import { NotesPlugin } from "../src/index.ts"
import type { PluginInput } from "@opencode-ai/plugin"

const TMP = "/tmp/notes-plugin-smoke"

await Bun.write(`${TMP}/src/auth/password-reset.ts`, "export function resetPassword() {}")
await Bun.write(`${TMP}/src/auth/session-store.ts`, "export class SessionStore { invalidateUser() {} }")
await Bun.write(`${TMP}/src/billing/customer.ts`, "export class Customer {}")
await Bun.write(`${TMP}/README.md`, "demo")

type FakeCtx = {
  sessionID: string
  messageID: string
  agent: string
  directory: string
  worktree: string
  abort: AbortSignal
  metadata: () => void
  ask: (req: any) => Promise<void>
  question: (req: any) => Promise<string[][]>
}

function context(overrides: Partial<FakeCtx> = {}): FakeCtx {
  return {
    sessionID: "s1",
    messageID: "m1",
    agent: "build",
    directory: TMP,
    worktree: TMP,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
    question: async (req) => req.questions.map(() => ["Save as proposed"]),
    ...overrides,
  }
}

async function plugin() {
  return NotesPlugin(
    {
      worktree: TMP,
      directory: TMP,
      client: {} as any,
      project: {} as any,
      serverUrl: new URL("http://localhost"),
      $: {} as any,
      experimental_workspace: {} as any,
    } as unknown as PluginInput,
  )
}

async function markExplored(after: (input: any, output?: any) => Promise<any>, sessionID: string, filePath: string) {
  await after({ tool: "read", sessionID, callID: "c", args: { filePath } }, {} as any)
}

afterAll(async () => {
  await Bun.$`rm -rf ${TMP}`.quiet()
})

describe("notes plugin (tree memory)", () => {
  test("commits a folder summary + entries + relation, and notes_get recalls them", async () => {
    const hooks = await plugin()
    const commit = hooks.tool!["notes_commit"]
    const get = hooks.tool!["notes_get"]
    const after = hooks["tool.execute.after"]!
    const asked: Array<{
      questions: Array<{
        header: string
        question: string
        options: Array<{ label: string; description: string }>
        default: string
      }>
    }> = []

    await markExplored(after, "s1", "src/auth/password-reset.ts")

    const commitResult = await (commit.execute as any)(
      {
        task: "fix-password-reset-bug",
        folder_summaries: [{ path: "src/auth", summary: "Authentication subsystem: credentials, sessions, password reset." }],
        entries: [
          { path: "src/auth/password-reset.ts", summary: "Password reset flow; resetPassword() rotates credentials on save.", based_on: ["src/auth/password-reset.ts"] },
          { path: "src/auth/session-store.ts", summary: "SessionStore owns session persistence and invalidate_user() clears stored sessions.", based_on: ["src/auth/session-store.ts"] },
        ],
        relations: [
          {
            from: "src/auth/password-reset.ts",
            to: "src/auth/session-store.ts",
            description: "Credential changes invalidate active sessions through SessionStore.",
            based_on: ["src/auth/password-reset.ts", "src/auth/session-store.ts"],
          },
        ],
      },
      context({ question: async (req) => (asked.push(req as any), req.questions.map(() => ["Save as proposed"])) }),
    )
    expect(commitResult.output).toContain("src/auth/.note.yaml")
    expect(commitResult.output).toContain("entry password-reset.ts added")
    expect(commitResult.output).toContain("entry session-store.ts added")
    expect(commitResult.output).toContain("relation password-reset.ts → session-store.ts added")
    expect(asked.length).toBe(1)
    // One question per note (folder + 2 entries + 1 relation = 4) even though
    // they all land in the same src/auth/.note.yaml.
    expect(asked[0].questions.length).toBe(4)
    expect(asked[0].questions[0].header).toBe("folder src/auth")
    expect(asked[0].questions[0].options[0].label).toBe("Save as proposed")
    expect(asked[0].questions[0].default).toContain("Authentication subsystem")
    const entryQuestion = asked[0].questions.find((q) => q.header === "password-reset.ts")
    expect(entryQuestion).toBeTruthy()
    expect(entryQuestion!.options[0].label).toBe("Save as proposed")
    expect(entryQuestion!.default).toContain("Password reset flow")

    const byPath = await (get.execute as any)({ path: "src/auth/password-reset.ts" }, context())
    expect(byPath.output).toContain("Authentication subsystem")
    expect(byPath.output).toContain("Password reset flow")
    expect(byPath.output).toContain("Credential changes invalidate active sessions")

    const byTask = await (get.execute as any)({ task: "password reset invalidates sessions" }, context())
    expect(byTask.output).toContain("session-store.ts")
  })

  test("attaches the local notebook note to the first read of a file, once per session", async () => {
    const hooks = await plugin()
    const after = hooks["tool.execute.after"]!
    const sessionID = "attach-s1"

    const first: any = { output: "export function resetPassword() {}" }
    await after({ tool: "read", sessionID, callID: "c1", args: { filePath: "src/auth/password-reset.ts" } }, first)
    expect(first.output).toContain("## Local notebook")
    expect(first.output).toContain("Password reset flow")

    const second: any = { output: "export function resetPassword() {}" }
    await after({ tool: "read", sessionID, callID: "c2", args: { filePath: "src/auth/password-reset.ts" } }, second)
    expect(second.output).not.toContain("## Local notebook")
  })

  test("relations across subtrees land in the LCA notebook", async () => {
    const hooks = await plugin()
    const commit = hooks.tool!["notes_commit"]
    const after = hooks["tool.execute.after"]!

    await markExplored(after, "s1", "src/auth/session-store.ts")

    await (commit.execute as any)(
      {
        task: "cross-tree",
        relations: [
          {
            from: "src/auth/session-store.ts",
            to: "src/billing/customer.ts",
            description: "Billing customer lookup is gated on an active session via SessionStore.is_active().",
            based_on: ["src/auth/session-store.ts", "src/billing/customer.ts"],
          },
        ],
      },
      context(),
    )

    const src = await Bun.file(`${TMP}/src/.note.yaml`).text()
    expect(src).toContain("auth/session-store.ts")
    expect(src).toContain("billing/customer.ts")
    expect(src).toContain("Billing customer lookup")
    const auth = await Bun.file(`${TMP}/src/auth/.note.yaml`).text()
    expect(auth).not.toContain("Billing customer lookup")
  })

  test("relations whose LCA is the project root land in the root notebook", async () => {
    const hooks = await plugin()
    const commit = hooks.tool!["notes_commit"]
    const after = hooks["tool.execute.after"]!

    await markExplored(after, "s1", "src/auth/session-store.ts")

    await (commit.execute as any)(
      {
        task: "root-rel",
        relations: [
          {
            from: "src/auth/session-store.ts",
            to: "README.md",
            description: "Top-level relation whose LCA is the repo root; SessionStore links to README via relTo().",
            based_on: ["src/auth/session-store.ts", "README.md"],
          },
        ],
      },
      context(),
    )

    const root = await Bun.file(`${TMP}/.note.yaml`).text()
    expect(root).toContain("src/auth/session-store.ts")
    expect(root).toContain("README.md")
    expect(root).toContain("LCA is the repo root")
    const auth = await Bun.file(`${TMP}/src/auth/.note.yaml`).text()
    expect(auth).not.toContain("Top-level relation")
  })

  test("still drops writes that escape the session worktree", async () => {
    const hooks = await plugin()
    const commit = hooks.tool!["notes_commit"]
    const after = hooks["tool.execute.after"]!

    await markExplored(after, "s1", "src/auth/password-reset.ts")

    const result = await (commit.execute as any)(
      {
        task: "escape",
        entries: [
          {
            path: "/tmp/notes-plugin-outside/a.ts",
            summary: "out/a.ts: a file living outside the session worktree that the sandbox guard must never persist.",
            based_on: ["/tmp/notes-plugin-outside/a.ts"],
          },
        ],
      },
      context(),
    )
    expect(result.output).toContain("Nothing changed")
    const exists = await Bun.file("/tmp/notes-plugin-outside/a.ts").exists()
    expect(exists).toBe(false)
  })

  test("rewrites an entry summary instead of duplicating", async () => {
    const hooks = await plugin()
    const commit = hooks.tool!["notes_commit"]
    const after = hooks["tool.execute.after"]!

    await markExplored(after, "s1", "src/auth/session-store.ts")

    await (commit.execute as any)(
      {
        task: "learn-more",
        entries: [
          {
            path: "src/auth/session-store.ts",
            summary: "InMemorySessionStore owns session persistence, invalidation, and lazy expiration checks in expires_after().",
            based_on: ["src/auth/session-store.ts"],
            confidence: "verified",
          },
        ],
      },
      context(),
    )

    const text = await Bun.file(`${TMP}/src/auth/.note.yaml`).text()
    expect((text.match(/session-store\.ts:/g) ?? []).length).toBe(1)
    expect(text).toContain("verified")
    expect(text).toContain("lazy expiration checks")
  })

  test("removed entries are deleted", async () => {
    const hooks = await plugin()
    const commit = hooks.tool!["notes_commit"]
    const result = await (commit.execute as any)(
      { task: "cleanup", removed: { entries: ["src/auth/session-store.ts"] } },
      context(),
    )
    expect(result.output).toContain("entry session-store.ts removed")
    const text = await Bun.file(`${TMP}/src/auth/.note.yaml`).text()
    expect(text).not.toContain("session-store.ts:")
  })

  test("nothing to write when summaries already match", async () => {
    const hooks = await plugin()
    const commit = hooks.tool!["notes_commit"]
    const after = hooks["tool.execute.after"]!

    await markExplored(after, "s1", "src/auth/password-reset.ts")

    const result = await (commit.execute as any)(
      {
        task: "noop",
        entries: [
          { path: "src/auth/password-reset.ts", summary: "Password reset flow; resetPassword() rotates credentials on save.", based_on: ["src/auth/password-reset.ts"] },
        ],
      },
      context(),
    )
    expect(result.output).toContain("Nothing changed")
  })

  test("nudges the agent to save after exploration, stops after a commit", async () => {
    const hooks = await plugin()
    const commit = hooks.tool!["notes_commit"]
    const after = hooks["tool.execute.after"]!
    const transform = hooks["experimental.chat.system.transform"]!

    await after({ tool: "read", sessionID: "s2", callID: "c1", args: { filePath: "src/auth/password-reset.ts" } }, {} as any)

    const first = { system: [] as string[] }
    await transform({ sessionID: "s2", model: {} as any }, first as any)
    expect(first.system.join("\n")).toContain("Save your learnings")

    await (commit.execute as any)(
      { task: "x", folder_summaries: [{ path: "src", summary: "Source tree holding plugin implementation, tests, and notebook metadata." }] },
      context({ sessionID: "s2" }),
    )

    const second = { system: [] as string[] }
    await transform({ sessionID: "s2", model: {} as any }, second as any)
    expect(second.system.join("\n")).not.toContain("Save your learnings")
  })

  test("gate rejects thin and non-English summaries and writes nothing", async () => {
    const hooks = await plugin()
    const commit = hooks.tool!["notes_commit"]
    const after = hooks["tool.execute.after"]!

    await markExplored(after, "s1", "src/auth/password-reset.ts")

    const result = await (commit.execute as any)(
      {
        task: "bad",
        folder_summaries: [{ path: "src", summary: "Short" }],
        entries: [
          { path: "src/auth/login.ts", summary: "ورود با رمز عبور و ایجاد نشست کاربری پایدار", based_on: ["src/auth/login.ts"] },
        ],
      },
      context(),
    )
    expect(result.output).toContain("NOT applied")
    expect(result.output).toContain("too thin")
    expect(result.output).toContain("non-Latin")
    const text = await Bun.file(`${TMP}/src/.note.yaml`).text()
    expect(text).not.toContain("login")
  })

  test("gate rejects vague summaries that name no concrete symbols", async () => {
    const hooks = await plugin()
    const commit = hooks.tool!["notes_commit"]
    const after = hooks["tool.execute.after"]!

    await markExplored(after, "s1", "src/auth/session-store.ts")

    const result = await (commit.execute as any)(
      {
        task: "vague",
        entries: [
          { path: "src/auth/session-store.ts", summary: "Handles sessions and manages users in a helpful way.", based_on: ["src/auth/session-store.ts"] },
        ],
      },
      context(),
    )
    expect(result.output).toContain("NOT applied")
    expect(result.output).toContain("vague")
  })

  test("marks a session dirty on substantive Q&A (turn-aware), not only file reads", async () => {
    const hooks = await plugin()
    const msg = hooks["chat.message"]!
    const transform = hooks["experimental.chat.system.transform"]!

    await msg(
      { sessionID: "s9", agent: "build" } as any,
      { message: {} as any, parts: [{ type: "text", text: "x".repeat(400) }] } as any,
    )

    const sys = { system: [] as string[] }
    await transform({ sessionID: "s9", model: {} as any }, sys as any)
    expect(sys.system.join("\n")).toContain("Save your learnings")
  })
})
