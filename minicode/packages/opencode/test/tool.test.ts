import { describe, expect, it } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import * as Tool from "@/tool/tool"
import { ReadTool } from "@/tool/read"
import { WriteTool } from "@/tool/write"
import { BashTool } from "@/tool/bash"
import { ToolRegistry } from "@/tool/registry"
import path from "path"
import os from "os"
import fs from "fs/promises"

// Helper to run an Effect with the ToolRegistry layer
const runtime = ManagedRuntime.make(ToolRegistry.defaultLayer as any)
const runPromise = <A>(effect: Effect.Effect<A, any, any>) => runtime.runPromise(effect as any)

describe("tool/tool - define and init", () => {
  it("define creates an Info with the given id", async () => {
    const info = await Effect.runPromise(Tool.define("test", Effect.succeed({
      description: "test tool",
      parameters: { decodeUnknownSync: () => ({}) } as any,
      execute: () => Effect.succeed({ title: "t", output: "o" }) as any,
    })) as any) as any
    expect(info.id).toBe("test")
  })

  it("init returns a Def with the id from Info", async () => {
    const info = await Effect.runPromise(Tool.define("my-tool", Effect.succeed({
      description: "desc",
      parameters: { decodeUnknownSync: () => ({}) } as any,
      execute: () => Effect.succeed({ title: "t", output: "o" }) as any,
    })) as any) as any
    const def = await Effect.runPromise(Tool.init(info as any) as any) as any
    expect(def.id).toBe("my-tool")
    expect(def.description).toBe("desc")
  })
})

describe("tool/read - ReadTool", () => {
  it("is defined with id 'read'", async () => {
    const info = await Effect.runPromise(ReadTool as any) as any
    expect(info.id).toBe("read")
  })

  it("reads file content and returns it as output", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minicode-test-"))
    const filePath = path.join(tmpDir, "hello.txt")
    try {
      await fs.writeFile(filePath, "line1\nline2\nline3")
      const info = await Effect.runPromise(ReadTool as any) as any
      const def = await Effect.runPromise(Tool.init(info as any) as any) as any
      const result = await Effect.runPromise(def.execute({ filePath } as any, { sessionID: "s" as any, messageID: "m" as any, agent: "build" }) as any) as any
      expect(result.output).toContain("line1")
      expect(result.output).toContain("line2")
      expect(result.output).toContain("line3")
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  it("respects offset and limit parameters", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minicode-test-"))
    const filePath = path.join(tmpDir, "lines.txt")
    try {
      await fs.writeFile(filePath, "L1\nL2\nL3\nL4\nL5")
      const info = await Effect.runPromise(ReadTool as any) as any
      const def = await Effect.runPromise(Tool.init(info as any) as any) as any
      const result = await Effect.runPromise(def.execute({ filePath, offset: 2, limit: 2 } as any, { sessionID: "s" as any, messageID: "m" as any, agent: "build" }) as any) as any
      expect(result.output).toBe("L2\nL3")
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})

describe("tool/write - WriteTool", () => {
  it("is defined with id 'write'", async () => {
    const info = await Effect.runPromise(WriteTool as any) as any
    expect(info.id).toBe("write")
  })

  it("writes content to a file", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minicode-test-"))
    const filePath = path.join(tmpDir, "output.txt")
    try {
      const info = await Effect.runPromise(WriteTool as any) as any
      const def = await Effect.runPromise(Tool.init(info as any) as any) as any
      const result = await Effect.runPromise(def.execute({ filePath, content: "written content" } as any, { sessionID: "s" as any, messageID: "m" as any, agent: "build" }) as any) as any
      expect(result.output).toContain("15 bytes")
      const content = await fs.readFile(filePath, "utf-8")
      expect(content).toBe("written content")
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})

describe("tool/bash - BashTool", () => {
  it("is defined with id 'bash'", async () => {
    const info = await Effect.runPromise(BashTool as any) as any
    expect(info.id).toBe("bash")
  })

  it("executes a command and returns stdout", async () => {
    const info = await Effect.runPromise(BashTool as any) as any
    const def = await Effect.runPromise(Tool.init(info as any) as any) as any
    const result = await Effect.runPromise(def.execute({ command: "echo hello_from_bash" } as any, { sessionID: "s" as any, messageID: "m" as any, agent: "build" }) as any) as any
    expect(result.output.trim()).toBe("hello_from_bash")
    expect(result.metadata?.exitCode).toBe(0)
  })

  it("returns non-zero exit code in metadata on failure", async () => {
    const info = await Effect.runPromise(BashTool as any) as any
    const def = await Effect.runPromise(Tool.init(info as any) as any) as any
    const cmd = process.platform === "win32" ? "exit /b 42" : "exit 42"
    const result = await Effect.runPromise(def.execute({ command: cmd } as any, { sessionID: "s" as any, messageID: "m" as any, agent: "build" }) as any) as any
    expect(result.metadata?.exitCode).toBe(42)
  })
})

describe("tool/registry - ToolRegistry", () => {
  it("registers exactly 3 tools: read, write, bash", async () => {
    const ids = await runPromise(Effect.gen(function* () {
      const svc = yield* ToolRegistry.Service
      return yield* svc.ids()
    })) as any
    expect(ids).toContain("read")
    expect(ids).toContain("write")
    expect(ids).toContain("bash")
    expect(ids.length).toBe(3)
  })

  it("all() returns Def objects with id and description", async () => {
    const tools = await runPromise(Effect.gen(function* () {
      const svc = yield* ToolRegistry.Service
      return yield* svc.all()
    })) as any
    expect(tools.length).toBe(3)
    for (const t of tools) {
      expect(typeof t.id).toBe("string")
      expect(typeof t.description).toBe("string")
      expect(typeof t.execute).toBe("function")
    }
  })
})
