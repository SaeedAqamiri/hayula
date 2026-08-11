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

afterAll(async () => {
  await Bun.$`rm -rf ${TMP}`.quiet()
})

describe("notes plugin (tree memory)", () => {
  test("commits a folder summary + entries + relation, and notes_get recalls them", async () => {
    const hooks = await plugin()
    const commit = hooks.tool!["notes_commit"]
    const get = hooks.tool!["notes_get"]
    const asked: Array<{ permission: string; patterns: string[]; always: string[] }> = []

    const commitResult = await (commit.execute as any)(
      {
        task: "fix-password-reset-bug",
        folder_summaries: [{ path: "src/auth", summary: "Authentication subsystem: credentials, sessions, password reset." }],
        entries: [
          { path: "src/auth/password-reset.ts", summary: "Password reset flow; rotates credentials.", based_on: ["src/auth/password-reset.ts"] },
          { path: "src/auth/session-store.ts", summary: "Owns session persistence and invalidation." },
        ],
        relations: [
          {
            from: "src/auth/password-reset.ts",
            to: "src/auth/session-store.ts",
            description: "Credential changes invalidate active sessions through SessionStore.",
          },
        ],
      },
      context({ ask: async (req) => void asked.push(req) }),
    )
    expect(commitResult.output).toContain("src/auth/.note.yaml")
    expect(commitResult.output).toContain("entry password-reset.ts added")
    expect(commitResult.output).toContain("relation password-reset.ts → session-store.ts added")
    expect(asked.length).toBe(1)
    expect(asked[0].patterns[0]).toContain(".note.yaml")

    const byPath = await (get.execute as any)({ path: "src/auth/password-reset.ts" }, context())
    expect(byPath.output).toContain("Authentication subsystem")
    expect(byPath.output).toContain("Password reset flow")
    expect(byPath.output).toContain("Credential changes invalidate active sessions")

    const byTask = await (get.execute as any)({ task: "password reset invalidates sessions" }, context())
    expect(byTask.output).toContain("session-store.ts")
  })

  test("relations across subtrees land in the LCA notebook", async () => {
    const hooks = await plugin()
    const commit = hooks.tool!["notes_commit"]

    await (commit.execute as any)(
      {
        task: "cross-tree",
        relations: [
          {
            from: "src/auth/session-store.ts",
            to: "src/billing/customer.ts",
            description: "Billing customer lookup is gated on an active session.",
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

  test("rewrites an entry summary instead of duplicating", async () => {
    const hooks = await plugin()
    const commit = hooks.tool!["notes_commit"]

    await (commit.execute as any)(
      {
        task: "learn-more",
        entries: [
          {
            path: "src/auth/session-store.ts",
            summary: "Owns session persistence, invalidation, and lazy expiration checks.",
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
    const result = await (commit.execute as any)(
      { task: "noop", entries: [{ path: "src/auth/password-reset.ts", summary: "Password reset flow; rotates credentials." }] },
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
      { task: "x", folder_summaries: [{ path: "src", summary: "Source root" }] },
      context({ sessionID: "s2" }),
    )

    const second = { system: [] as string[] }
    await transform({ sessionID: "s2", model: {} as any }, second as any)
    expect(second.system.join("\n")).not.toContain("Save your learnings")
  })
})
