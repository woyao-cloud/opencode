// ── CLI Pipeline E2E Smoke Test ───────────────────────────
// Tests the full CLI bootstrap: init, command parsing, service resolution,
// patch/ref/id/image modules, and session lifecycle.

import { describe, it, expect, beforeAll } from "bun:test"
import { Effect } from "effect"
import { AppRuntime, init } from "../../src/cli/bootstrap"
import { SessionService } from "../../src/session/session"
import { ProviderService } from "../../src/provider/index"
import { ConfigService } from "../../src/config/config"
import { makePatchService, parsePatch } from "../../src/patch/index"
import { makeReferenceService } from "../../src/reference/index"
import { makeId, sessionId, messageId, idTimestamp } from "../../src/id/index"
import { makeImageService } from "../../src/image/index"

let initialized = false

describe("CLI Pipeline", () => {
  beforeAll(async () => {
    if (!initialized) {
      await init()
      initialized = true
    }
  })

  // ── Bootstrap ──────────────────────────────────────────

  it("initializes the runtime without error", async () => {
    // init() already called in beforeAll
    expect(AppRuntime).toBeDefined()
  })

  it("resolves ConfigService after init", async () => {
    const svc = await AppRuntime.runPromise(ConfigService.use((s) => Effect.succeed(s)))
    expect(svc).toBeDefined()
    expect(typeof svc.config).toBe("object")
  })

  it("resolves SessionService after init", async () => {
    const svc = await AppRuntime.runPromise(SessionService.use((s) => Effect.succeed(s)))
    expect(svc).toBeDefined()
    expect(typeof svc.create).toBe("function")
    expect(typeof svc.list).toBe("function")
  })

  it("resolves ProviderService after init", async () => {
    const svc = await AppRuntime.runPromise(ProviderService.use((s) => Effect.succeed(s)))
    expect(svc).toBeDefined()
    expect(typeof svc.resolve).toBe("function")
  })

  // ── Session lifecycle ──────────────────────────────────

  it("creates and lists a session", async () => {
    const session = await AppRuntime.runPromise(
      SessionService.use((svc) => svc.create({ title: "e2e test session" })),
    ) as any
    expect(session).toBeDefined()
    expect(session.id).toMatch(/^ses_/)
    expect(session.title).toBe("e2e test session")
    expect(session.status).toBe("idle")

    const sessions = await AppRuntime.runPromise(
      SessionService.use((svc) => svc.list(10)),
    ) as any
    const found = sessions.find((s: any) => s.id === session.id)
    expect(found).toBeDefined()
  })

  it("appends and retrieves messages", async () => {
    const session = await AppRuntime.runPromise(
      SessionService.use((svc) => svc.create({ title: "msg test" })),
    ) as any

    await AppRuntime.runPromise(
      SessionService.use((svc) =>
        svc.appendMessage(session.id, { role: "user", content: "Hello" }),
      ),
    )
    await AppRuntime.runPromise(
      SessionService.use((svc) =>
        svc.appendMessage(session.id, { role: "assistant", content: "Hi there!" }),
      ),
    )

    const messages = await AppRuntime.runPromise(
      SessionService.use((svc) => svc.getMessages(session.id)),
    ) as any

    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe("Hello")
    expect(messages[1].content).toBe("Hi there!")
  })

  // ── Patch Service ──────────────────────────────────────

  it("PatchService parses add hunks", () => {
    const patch = [
      "*** Begin Patch",
      "*** Add File: test.txt",
      "+hello",
      "*** End Patch",
    ].join("\n")
    const hunks = parsePatch(patch)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].type).toBe("add")
  })

  it("PatchService provides Effect-based API", async () => {
    const svc = makePatchService()
    expect(typeof svc.parse).toBe("function")
    expect(typeof svc.applyPatch).toBe("function")

    const patch = [
      "*** Begin Patch",
      "*** Add File: nonexistent.txt",
      "+content",
      "*** End Patch",
    ].join("\n")
    expect(() => svc.parse(patch)).not.toThrow()
  })

  // ── Reference Service ──────────────────────────────────

  it("ReferenceService resolves local paths", () => {
    const svc = makeReferenceService()
    const resolved = svc.resolve("myref", { path: "." }, process.cwd())
    expect(resolved.kind).toBe("local")
    if (resolved.kind === "local") {
      expect(resolved.path).toBe(process.cwd())
    }
  })

  it("ReferenceService rejects empty entries", () => {
    const svc = makeReferenceService()
    const resolved = svc.resolve("badref", {}, process.cwd())
    expect(resolved.kind).toBe("invalid")
  })

  it("ReferenceService resolves git references", () => {
    const svc = makeReferenceService()
    const resolved = svc.resolve("lib", { repository: "https://github.com/user/repo", branch: "main" }, process.cwd())
    expect(resolved.kind).toBe("git")
  })

  it("ReferenceService list/get works", async () => {
    const svc = makeReferenceService()
    const list = await Effect.runPromise(svc.list())
    expect(Array.isArray(list)).toBe(true)
    const got = await Effect.runPromise(svc.get("nonexistent"))
    expect(got).toBeUndefined()
  })

  // ── ID System ──────────────────────────────────────────

  it("ID generation produces unique IDs", () => {
    const ids = Array.from({ length: 1000 }, () => makeId("test"))
    expect(new Set(ids).size).toBe(1000)
  })

  it("sessionId and messageId have correct prefixes", () => {
    expect(sessionId().startsWith("ses_")).toBe(true)
    expect(messageId().startsWith("msg_")).toBe(true)
  })

  it("IDs are time-sortable", () => {
    const ids = [sessionId(), sessionId(), sessionId()]
    for (let i = 1; i < ids.length; i++) {
      expect(idTimestamp(ids[i])).toBeGreaterThanOrEqual(idTimestamp(ids[i - 1]))
    }
  })

  // ── Image Service ──────────────────────────────────────

  it("ImageService parses valid data URLs", async () => {
    const svc = makeImageService()
    const { Effect } = await import("effect")
    const result = await Effect.runPromise(svc.parseDataUrl("data:image/png;base64,iVBOR"))
    expect(result.mime).toBe("image/png")
  })

  it("ImageService rejects invalid data URLs", async () => {
    const svc = makeImageService()
    const { Effect } = await import("effect")
    try {
      await Effect.runPromise(svc.parseDataUrl("not-a-data-url"))
      throw new Error("should have failed")
    } catch {
      // expected
    }
  })

  // ── Provider resolution (no actual LLM call) ───────────

  it("ProviderService resolves a model spec", async () => {
    const resolved = await AppRuntime.runPromise(
      ProviderService.use((svc) => svc.resolve("test-model")),
    ) as any
    expect(resolved).toBeDefined()
    expect(resolved.modelID).toBe("test-model")
    expect(resolved.providerID).toBeDefined()
  })
})
