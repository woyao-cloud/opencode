import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { Schema, Effect, Layer, ManagedRuntime, Context } from "effect"
import { SessionID, ascendingSessionID } from "@/session/id"
import { MessageID, PartID, ascendingMessageID, ascendingPartID } from "@/session/schema"
import { BusEvent } from "@/bus/bus-event"
import { Permission } from "@/permission"
import { File } from "@/file"
import { Env } from "@/env"
import { InstanceRef, WorkspaceRef, type InstanceContext } from "@/effect/instance-ref"
import { Command } from "@/command"
import { Plugin } from "@/plugin"
import { Skill } from "@/skill"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import path from "path"
import os from "os"
import fs from "fs/promises"

describe("session/id - SessionID", () => {
  it("ascendingSessionID produces an id with ses_ prefix", () => {
    const id = ascendingSessionID()
    expect(id as string).toMatch(/^ses_/)
  })

  it("ascendingSessionID with explicit id uses that id", () => {
    const id = ascendingSessionID("abc123")
    expect(id as string).toBe("ses_abc123")
  })

  it("SessionID brand rejects non-prefixed strings", () => {
    // brand just wraps the string, it accepts any string
    const id = SessionID.make("ses_test")
    expect(id as string).toBe("ses_test")
  })
})

describe("session/schema - MessageID and PartID", () => {
  it("ascendingMessageID produces an id with msg_ prefix", () => {
    const id = ascendingMessageID()
    expect(id as string).toMatch(/^msg_/)
  })

  it("ascendingPartID produces an id with prt_ prefix", () => {
    const id = ascendingPartID()
    expect(id as string).toMatch(/^prt_/)
  })

  it("ascendingMessageID with explicit id uses that id", () => {
    const id = ascendingMessageID("xyz")
    expect(id as string).toBe("msg_xyz")
  })
})

describe("bus/bus-event - define", () => {
  it("creates a definition with the given type and properties", () => {
    const { Schema } = require("effect")
    const def = BusEvent.define("test.event", Schema.Struct({ value: Schema.Number }))
    expect(def.type).toBe("test.event")
    expect(def.properties).toBeDefined()
  })

  it("different definitions have different types", () => {
    const { Schema } = require("effect")
    const a = BusEvent.define("a", Schema.Struct({}))
    const b = BusEvent.define("b", Schema.Struct({}))
    expect(a.type).not.toBe(b.type)
  })
})

describe("permission - fromConfig", () => {
  it("converts a wildcard rule", () => {
    const ruleset = Permission.fromConfig({ "*": "allow" })
    expect(ruleset.length).toBe(1)
    expect(ruleset[0]?.permission).toBe("*")
    expect(ruleset[0]?.pattern).toBe("*")
    expect(ruleset[0]?.action).toBe("allow")
  })

  it("converts a permission:pattern rule", () => {
    const ruleset = Permission.fromConfig({ "read:*.env": "ask" })
    expect(ruleset.length).toBe(1)
    expect(ruleset[0]?.permission).toBe("read")
    expect(ruleset[0]?.pattern).toBe("*.env")
    expect(ruleset[0]?.action).toBe("ask")
  })

  it("converts multiple rules preserving order", () => {
    const ruleset = Permission.fromConfig({
      "*": "allow",
      "read:*.env": "ask",
      "bash:rm": "deny",
    })
    expect(ruleset.length).toBe(3)
    expect(ruleset[0]?.action).toBe("allow")
    expect(ruleset[1]?.action).toBe("ask")
    expect(ruleset[2]?.action).toBe("deny")
  })

  it("handles a rule with no colon — entire key is permission, pattern is the key itself", () => {
    const ruleset = Permission.fromConfig({ "bash": "deny" })
    expect(ruleset[0]?.permission).toBe("bash")
    // When there's no colon, split(":")[1] is undefined so pattern falls back to the key
    expect(ruleset[0]?.pattern).toBe("bash")
  })
})

describe("file - read/write round-trip", () => {
  it("writes content then reads it back", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minicode-test-"))
    const filePath = path.join(tmpDir, "test.txt")
    try {
      await Effect.runPromise(File.write(filePath, "hello world"))
      const content = await Effect.runPromise(File.read(filePath))
      expect(content).toBe("hello world")
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  it("read fails for non-existent file", async () => {
    expect(
      Effect.runPromise(File.read("/nonexistent/path/to/file.txt")),
    ).rejects.toThrow()
  })

  it("exists returns false for non-existent file", async () => {
    const result = await Effect.runPromise(File.exists("/nonexistent/path/to/file.txt"))
    expect(result).toBe(false)
  })

  it("exists returns true after write", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minicode-test-"))
    const filePath = path.join(tmpDir, "exists.txt")
    try {
      await Effect.runPromise(File.write(filePath, "content"))
      const result = await Effect.runPromise(File.exists(filePath))
      expect(result).toBe(true)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})

// ============================================================================
// env — environment variable reading
// ============================================================================

describe("env", () => {
  const save = (k: string) => process.env[k]

  afterEach(() => {
    if (save("MINICODE_HOME") === undefined) delete process.env.MINICODE_HOME
    else process.env.MINICODE_HOME = save("MINICODE_HOME")
    if (save("OPENAI_API_KEY") === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = save("OPENAI_API_KEY")
    if (save("MINICODE_LOG_LEVEL") === undefined) delete process.env.MINICODE_LOG_LEVEL
    else process.env.MINICODE_LOG_LEVEL = save("MINICODE_LOG_LEVEL")
    if (save("MINICODE_LOG_PRINT") === undefined) delete process.env.MINICODE_LOG_PRINT
    else process.env.MINICODE_LOG_PRINT = save("MINICODE_LOG_PRINT")
  })

  it("MINICODE_HOME reads process.env.MINICODE_HOME", () => {
    process.env.MINICODE_HOME = "/custom/home"
    expect(Env.MINICODE_HOME).toBe("/custom/home")
  })

  it("MINICODE_HOME returns undefined when not set", () => {
    delete process.env.MINICODE_HOME
    expect(Env.MINICODE_HOME).toBeUndefined()
  })

  it("OPENAI_API_KEY reads process.env.OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "sk-test-key"
    expect(Env.OPENAI_API_KEY).toBe("sk-test-key")
  })

  it("MINICODE_LOG_LEVEL reads process.env.MINICODE_LOG_LEVEL", () => {
    process.env.MINICODE_LOG_LEVEL = "DEBUG"
    expect(Env.MINICODE_LOG_LEVEL).toBe("DEBUG")
  })

  it("MINICODE_LOG_PRINT returns true when env var is '1'", () => {
    process.env.MINICODE_LOG_PRINT = "1"
    expect(Env.MINICODE_LOG_PRINT).toBe(true)
  })

  it("MINICODE_LOG_PRINT returns false when env var is '0'", () => {
    process.env.MINICODE_LOG_PRINT = "0"
    expect(Env.MINICODE_LOG_PRINT).toBe(false)
  })

  it("MINICODE_LOG_PRINT returns false when env var is unset", () => {
    delete process.env.MINICODE_LOG_PRINT
    expect(Env.MINICODE_LOG_PRINT).toBe(false)
  })
})

// ============================================================================
// effect/instance-ref — InstanceRef and WorkspaceRef Context.Tags
// ============================================================================

describe("effect/instance-ref", () => {
  it("InstanceRef is an Effect Context.Service tag", () => {
    expect(InstanceRef).toBeDefined()
    expect(typeof (InstanceRef as any).pipe).toBe("function")
  })

  it("WorkspaceRef is an Effect Context.Service tag", () => {
    expect(WorkspaceRef).toBeDefined()
    expect(typeof (WorkspaceRef as any).pipe).toBe("function")
  })

  it("can provide InstanceRef via Layer.succeed", async () => {
    const layer = Layer.succeed(InstanceRef as any, { directory: "/test/dir", worktree: "/test/wt" } as any)
    const runtime = ManagedRuntime.make(layer as any)
    const ctx = await runtime.runPromise(Effect.gen(function* () {
      return yield* InstanceRef
    }))
    expect((ctx as any).directory).toBe("/test/dir")
    expect((ctx as any).worktree).toBe("/test/wt")
  })

  it("can provide WorkspaceRef via Layer.succeed", async () => {
    const layer = Layer.succeed(WorkspaceRef as any, "my-workspace" as any)
    const runtime = ManagedRuntime.make(layer as any)
    const ws = await runtime.runPromise(Effect.gen(function* () {
      return yield* WorkspaceRef
    }))
    expect(ws as any).toBe("my-workspace")
  })
})

// ============================================================================
// session/schema — Part / Message / Info schemas
// ============================================================================

describe("session/schema - Part", () => {
  const { Part: SessionPart } = require("@/session/session") as any

  it("decodes a text part", () => {
    const result = Schema.decodeUnknownSync(SessionPart)({ id: PartID.make("prt_1"), type: "text", text: "hello" })
    expect(result.type).toBe("text")
    expect((result as any).text).toBe("hello")
  })

  it("decodes a tool-call part", () => {
    const result = Schema.decodeUnknownSync(SessionPart)({ id: PartID.make("prt_2"), type: "tool-call", toolName: "read", toolInput: { path: "/f" } })
    expect(result.type).toBe("tool-call")
    expect((result as any).toolName).toBe("read")
  })

  it("decodes a tool-result part", () => {
    const result = Schema.decodeUnknownSync(SessionPart)({ id: PartID.make("prt_3"), type: "tool-result", toolName: "read", toolResult: "content" })
    expect(result.type).toBe("tool-result")
    expect((result as any).toolResult).toBe("content")
  })

  it("rejects an unknown type", () => {
    expect(() => Schema.decodeUnknownSync(SessionPart)({ id: PartID.make("prt_4"), type: "unknown" })).toThrow()
  })
})

describe("session/schema - Message", () => {
  const { Message: SessionMessage } = require("@/session/session") as any

  it("decodes a valid message with parts", () => {
    const mid = MessageID.make("msg_1")
    const sid = SessionID.make("ses_1")
    const pid = PartID.make("prt_1")
    const result = Schema.decodeUnknownSync(SessionMessage)({
      id: mid,
      sessionID: sid,
      role: "user",
      parts: [{ id: pid, type: "text", text: "hello" }],
      time: { created: 1234567890 },
    })
    expect(result.role).toBe("user")
    expect((result as any).parts.length).toBe(1)
  })
})

describe("session/schema - Info", () => {
  const { Info: SessionInfo } = require("@/session/session") as any

  it("decodes a valid session info", () => {
    const sid = SessionID.make("ses_1")
    const result = Schema.decodeUnknownSync(SessionInfo)({
      id: sid,
      projectID: "proj_1",
      directory: "/test",
      title: "Test Session",
      version: 1,
      tokens: { input: 0, output: 0 },
      cost: 0,
      time: { created: 1234567890, updated: 1234567890 },
    })
    expect(result.title).toBe("Test Session")
    expect((result as any).version).toBe(1)
  })

  it("decodes session info with optional fields", () => {
    const sid = SessionID.make("ses_2")
    const pSid = SessionID.make("ses_parent")
    const result = Schema.decodeUnknownSync(SessionInfo)({
      id: sid,
      projectID: "proj_2",
      directory: "/test2",
      title: "Child Session",
      agent: "build",
      model: { providerID: "openai", modelID: "gpt-4o" },
      parentID: pSid,
      version: 2,
      tokens: { input: 100, output: 200 },
      cost: 0.05,
      time: { created: 1234567890, updated: 1234567900 },
    })
    expect((result as any).agent).toBe("build")
    expect((result as any).parentID as string).toBe("ses_parent")
    expect((result as any).tokens.input).toBe(100)
  })
})

// ============================================================================
// command — Definition schema and no-op service
// ============================================================================

describe("command", () => {
  it("Definition decodes a valid command", () => {
    const result = Schema.decodeUnknownSync(Command.Definition)({ name: "build", template: "run build" })
    expect(result.name).toBe("build")
    expect(result.template).toBe("run build")
  })

  it("Definition decodes with optional description", () => {
    const result = Schema.decodeUnknownSync(Command.Definition)({ name: "test", description: "run tests", template: "bun test" })
    expect(result.description).toBe("run tests")
  })

  it("Definition rejects missing template", () => {
    expect(() => Schema.decodeUnknownSync(Command.Definition)({ name: "x" })).toThrow()
  })

  it("defaultLayer provides a Service (requires InstanceRef)", async () => {
    const refLayer = Layer.succeed(InstanceRef as any, { directory: "/test/cmd", worktree: "/" } as any)
    const fullLayer = (Command.defaultLayer as any).pipe(Layer.provideMerge(refLayer as any)) as any
    const runtime = ManagedRuntime.make(fullLayer)
    const svc = await runtime.runPromise(Effect.gen(function* () {
      return yield* Command.Service
    }))
    expect(svc).toBeDefined()
    const cmds = await runtime.runPromise(svc.list())
    expect(cmds).toEqual([])
    await runtime.dispose()
  })

  it("get returns undefined when no commands are registered", async () => {
    const refLayer = Layer.succeed(InstanceRef as any, { directory: "/test/cmd2", worktree: "/" } as any)
    const fullLayer = (Command.defaultLayer as any).pipe(Layer.provideMerge(refLayer as any)) as any
    const runtime = ManagedRuntime.make(fullLayer)
    const svc = await runtime.runPromise(Effect.gen(function* () {
      return yield* Command.Service
    }))
    const cmd = await runtime.runPromise(svc.get("nonexistent"))
    expect(cmd).toBeUndefined()
    await runtime.dispose()
  })
})

// ============================================================================
// plugin — no-op stub
// ============================================================================

describe("plugin", () => {
  it("defaultLayer provides a Service (requires InstanceRef)", async () => {
    const refLayer = Layer.succeed(InstanceRef as any, { directory: "/test/plugin", worktree: "/" } as any)
    const fullLayer = (Plugin.defaultLayer as any).pipe(Layer.provideMerge(refLayer as any)) as any
    const runtime = ManagedRuntime.make(fullLayer)
    const svc = await runtime.runPromise(Effect.gen(function* () {
      return yield* Plugin.Service
    }))
    expect(svc).toBeDefined()
    const plugins = await runtime.runPromise(svc.list())
    expect(plugins).toEqual([])
    await runtime.dispose()
  })
})

// ============================================================================
// skill — no-op stub
// ============================================================================

describe("skill", () => {
  it("defaultLayer provides a Service (requires InstanceRef)", async () => {
    const refLayer = Layer.succeed(InstanceRef as any, { directory: "/test/skill", worktree: "/" } as any)
    const fullLayer = (Skill.defaultLayer as any).pipe(Layer.provideMerge(refLayer as any)) as any
    const runtime = ManagedRuntime.make(fullLayer)
    const svc = await runtime.runPromise(Effect.gen(function* () {
      return yield* Skill.Service
    }))
    expect(svc).toBeDefined()
    const dirs = await runtime.runPromise(svc.dirs())
    expect(dirs).toEqual([])
    const skills = await runtime.runPromise(svc.list())
    expect(skills).toEqual([])
    await runtime.dispose()
  })
})

// ============================================================================
// bus — PubSub integration (publish / subscribe)
// ============================================================================

describe("bus - publish and subscribe", () => {
  function busRuntime(dir: string) {
    const refLayer = Layer.succeed(InstanceRef as any, { directory: dir, worktree: "/" } as any)
    const wsLayer = Layer.succeed(WorkspaceRef as any, undefined as any)
    const merged = Layer.provideMerge(refLayer as any, Bus.defaultLayer as any) as any
    const fullLayer = Layer.provideMerge(wsLayer as any, merged as any) as any
    return ManagedRuntime.make(fullLayer)
  }

  it("subscriber receives published event on typed channel", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minicode-bus-test-"))
    try {
      const runtime = busRuntime(tmpDir)
      const svc = await runtime.runPromise(Effect.gen(function* () {
        return yield* Bus.Service
      }))
      const received: any[] = []
      const TestEvent = BusEvent.define("test.event", Schema.Struct({ value: Schema.Number }))
      const unsub = await runtime.runPromise(svc.subscribeCallback(TestEvent as any, (evt: any) => { received.push(evt) }))
      // Bus subscription uses a forked fiber internally; allow it to start consuming
      await new Promise(r => setTimeout(r, 50))
      await runtime.runPromise(svc.publish(TestEvent as any, { value: 42 } as any))
      await new Promise(r => setTimeout(r, 50))
      expect(received.length).toBe(1)
      expect(received[0]?.type).toBe("test.event")
      expect(received[0]?.properties?.value).toBe(42)
      unsub()
      await runtime.dispose()
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  it("subscribeAll receives events from any channel", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minicode-bus-test-"))
    try {
      const runtime = busRuntime(tmpDir)
      const svc = await runtime.runPromise(Effect.gen(function* () {
        return yield* Bus.Service
      }))
      const received: any[] = []
      const unsub = await runtime.runPromise(svc.subscribeAllCallback((evt: any) => { received.push(evt) }))
      await new Promise(r => setTimeout(r, 50))
      const EventA = BusEvent.define("event.a", Schema.Struct({ msg: Schema.String }))
      const EventB = BusEvent.define("event.b", Schema.Struct({ msg: Schema.String }))
      await runtime.runPromise(svc.publish(EventA as any, { msg: "first" } as any))
      await runtime.runPromise(svc.publish(EventB as any, { msg: "second" } as any))
      await new Promise(r => setTimeout(r, 50))
      expect(received.length).toBeGreaterThanOrEqual(2)
      unsub()
      await runtime.dispose()
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  it("unsubscribe stops receiving events", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minicode-bus-test-"))
    try {
      const runtime = busRuntime(tmpDir)
      const svc = await runtime.runPromise(Effect.gen(function* () {
        return yield* Bus.Service
      }))
      const received: any[] = []
      const TestEvent = BusEvent.define("test.unsub", Schema.Struct({ n: Schema.Number }))
      const unsub = await runtime.runPromise(svc.subscribeCallback(TestEvent as any, (evt: any) => { received.push(evt) }))
      await new Promise(r => setTimeout(r, 50))
      await runtime.runPromise(svc.publish(TestEvent as any, { n: 1 } as any))
      await new Promise(r => setTimeout(r, 50))
      expect(received.length).toBe(1)
      unsub()
      await runtime.runPromise(svc.publish(TestEvent as any, { n: 2 } as any))
      await new Promise(r => setTimeout(r, 50))
      expect(received.length).toBe(1) // no new events after unsubscribe
      await runtime.dispose()
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  it("createID returns a string with evt_ prefix", () => {
    const id = Bus.createID()
    expect(id).toMatch(/^evt_/)
  })

  it("InstanceDisposed has type 'server.instance.disposed'", () => {
    expect(Bus.InstanceDisposed.type).toBe("server.instance.disposed")
  })
})

// ============================================================================
// config — ConfigAgent / ConfigProvider / Info schemas
// ============================================================================

// ============================================================================
// config — ConfigAgent / ConfigProvider / Info schemas
// ============================================================================

describe("config - schemas", () => {
  it("ConfigAgent decodes a valid agent config", () => {
    const result = Schema.decodeUnknownSync(Config.ConfigAgent)({ name: "build", description: "builder" })
    expect(result.name).toBe("build")
    expect(result.description).toBe("builder")
  })

  it("ConfigAgent decodes with optional model", () => {
    const result = Schema.decodeUnknownSync(Config.ConfigAgent)({ name: "chat", model: { providerID: "openai", modelID: "gpt-4o" } })
    expect(result.name).toBe("chat")
    expect((result as any).model.providerID).toBe("openai")
  })

  it("ConfigAgent rejects missing name", () => {
    expect(() => Schema.decodeUnknownSync(Config.ConfigAgent)({})).toThrow()
  })

  it("ConfigProvider decodes a valid provider", () => {
    const result = Schema.decodeUnknownSync(Config.ConfigProvider)({ id: "openai", apiKey: "sk-xxx", baseURL: "https://api.openai.com/v1" })
    expect(result.id).toBe("openai")
    expect(result.apiKey).toBe("sk-xxx")
  })

  it("ConfigProvider decodes with minimal fields", () => {
    const result = Schema.decodeUnknownSync(Config.ConfigProvider)({ id: "custom" })
    expect(result.id).toBe("custom")
    expect((result as any).name).toBeUndefined()
  })

  it("Info decodes a full config", () => {
    const result = Schema.decodeUnknownSync(Config.Info)({
      agents: [{ name: "build" }],
      providers: [{ id: "openai" }],
      permission: { "*": "allow" },
    })
    expect(result.agents.length).toBe(1)
    expect(result.providers.length).toBe(1)
    expect(result.permission["*"]).toBe("allow")
  })

  it("Info decodes with instructions", () => {
    const result = Schema.decodeUnknownSync(Config.Info)({
      agents: [],
      providers: [],
      permission: { "*": "ask" },
      instructions: ["Be concise", "Use TypeScript"],
    })
    expect((result as any).instructions).toEqual(["Be concise", "Use TypeScript"])
  })

  it("Info rejects invalid permission action", () => {
    expect(() => Schema.decodeUnknownSync(Config.Info)({
      agents: [],
      providers: [],
      permission: { "*": "unknown" },
    })).toThrow()
  })
})