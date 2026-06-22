import { describe, expect, it, beforeAll, afterAll } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { Session } from "@/session/session"
import { InstanceRef } from "@/effect/instance-ref"
import { Global } from "@minicode/core/global"
import path from "path"
import os from "os"
import fs from "fs/promises"

// Session layer needs InstanceRef + Global.Path.db (SQLite file).
// We provide InstanceRef with a temp directory and let the layer
// use the real Global.Path.db (tables use CREATE TABLE IF NOT EXISTS).
async function withSessionRuntime<T>(fn: (runtime: ReturnType<typeof ManagedRuntime.make>, dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "minicode-session-test-"))
  const refLayer = Layer.succeed(InstanceRef as any, { directory: dir, worktree: "/" } as any)
  const fullLayer = (Session.defaultLayer as any).pipe(Layer.provideMerge(refLayer as any)) as any
  const runtime = ManagedRuntime.make(fullLayer)
  try {
    return await fn(runtime, dir)
  } finally {
    await runtime.dispose()
    await fs.rm(dir, { recursive: true, force: true })
  }
}

describe("session - create", () => {
  it("creates a session and returns Info", async () => {
    await withSessionRuntime(async (runtime) => {
      const svc = await runtime.runPromise(Effect.gen(function* () {
        return yield* Session.Service
      }))
      const info = await runtime.runPromise(svc.create({
        projectID: "test-project",
        directory: "/test/dir",
        title: "Test Session",
        agent: "build",
      })) as any
      expect(info.title).toBe("Test Session")
      expect(info.projectID).toBe("test-project")
      expect(info.agent).toBe("build")
      expect(info.version).toBe(1)
      expect(info.tokens.input).toBe(0)
      expect(info.tokens.output).toBe(0)
      expect(info.cost).toBe(0)
      expect(info.time.created).toBeGreaterThan(0)
    })
  })

  it("creates a session with default title when none provided", async () => {
    await withSessionRuntime(async (runtime) => {
      const svc = await runtime.runPromise(Effect.gen(function* () {
        return yield* Session.Service
      }))
      const info = await runtime.runPromise(svc.create({
        projectID: "proj",
        directory: "/test",
      })) as any
      expect(info.title).toMatch(/^New session/)
    })
  })
})

describe("session - get", () => {
  it("retrieves a created session by id", async () => {
    await withSessionRuntime(async (runtime) => {
      const svc = await runtime.runPromise(Effect.gen(function* () {
        return yield* Session.Service
      }))
      const created = await runtime.runPromise(svc.create({
        projectID: "p1",
        directory: "/d1",
        title: "Find Me",
      })) as any
      const found = await runtime.runPromise(svc.get(created.id))
      expect(found).toBeDefined()
      expect((found as any).title).toBe("Find Me")
    })
  })

  it("returns undefined for non-existent session", async () => {
    await withSessionRuntime(async (runtime) => {
      const svc = await runtime.runPromise(Effect.gen(function* () {
        return yield* Session.Service
      }))
      const found = await runtime.runPromise(svc.get("ses_nonexistent" as any))
      expect(found).toBeUndefined()
    })
  })
})

describe("session - list", () => {
  it("returns sessions sorted by creation time descending", async () => {
    await withSessionRuntime(async (runtime) => {
      const svc = await runtime.runPromise(Effect.gen(function* () {
        return yield* Session.Service
      }))
      await runtime.runPromise(svc.create({ projectID: "p", directory: "/d", title: "First" }))
      // Small delay to ensure different timestamps
      await new Promise(r => setTimeout(r, 10))
      await runtime.runPromise(svc.create({ projectID: "p", directory: "/d", title: "Second" }))
      const sessions = await runtime.runPromise(svc.list()) as any
      expect(sessions.length).toBeGreaterThanOrEqual(2)
      // Most recent first
      expect(sessions[0].title).toBe("Second")
    })
  })
})

describe("session - appendMessage and messages", () => {
  it("appends a message and retrieves it", async () => {
    await withSessionRuntime(async (runtime) => {
      const svc = await runtime.runPromise(Effect.gen(function* () {
        return yield* Session.Service
      }))
      const session = await runtime.runPromise(svc.create({
        projectID: "p",
        directory: "/d",
        title: "Chat",
      })) as any
      const { PartID: PartIDBrand } = require("@/session/schema") as any
      const part = {
        id: PartIDBrand.make("prt_" + Math.random().toString(36).slice(2, 12)),
        type: "text" as const,
        text: "Hello, world!",
      }
      const msg = await runtime.runPromise(svc.appendMessage({
        sessionID: session.id,
        role: "user",
        parts: [part],
      })) as any
      expect(msg.role).toBe("user")
      expect(msg.parts.length).toBe(1)
      expect(msg.parts[0].text).toBe("Hello, world!")

      const msgs = await runtime.runPromise(svc.messages(session.id)) as any
      expect(msgs.length).toBe(1)
      expect(msgs[0].role).toBe("user")
    })
  })

  it("appends multiple messages and retrieves them in order", async () => {
    await withSessionRuntime(async (runtime) => {
      const svc = await runtime.runPromise(Effect.gen(function* () {
        return yield* Session.Service
      }))
      const session = await runtime.runPromise(svc.create({
        projectID: "p",
        directory: "/d",
        title: "Multi",
      })) as any
      const { PartID: PartIDBrand } = require("@/session/schema") as any
      await runtime.runPromise(svc.appendMessage({
        sessionID: session.id,
        role: "user",
        parts: [{ id: PartIDBrand.make("prt_" + Math.random().toString(36).slice(2, 12)), type: "text", text: "first" }],
      }))
      await runtime.runPromise(svc.appendMessage({
        sessionID: session.id,
        role: "assistant",
        parts: [{ id: PartIDBrand.make("prt_" + Math.random().toString(36).slice(2, 12)), type: "text", text: "second" }],
      }))
      const msgs = await runtime.runPromise(svc.messages(session.id)) as any
      expect(msgs.length).toBe(2)
      expect(msgs[0].role).toBe("user")
      expect(msgs[1].role).toBe("assistant")
    })
  })

  it("messages returns empty array for session with no messages", async () => {
    await withSessionRuntime(async (runtime) => {
      const svc = await runtime.runPromise(Effect.gen(function* () {
        return yield* Session.Service
      }))
      const session = await runtime.runPromise(svc.create({
        projectID: "p",
        directory: "/d",
        title: "Empty",
      })) as any
      const msgs = await runtime.runPromise(svc.messages(session.id)) as any
      expect(msgs).toEqual([])
    })
  })
})
