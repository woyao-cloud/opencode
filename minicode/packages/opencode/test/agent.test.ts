import { describe, expect, it } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Bus } from "@/bus"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { Skill } from "@/skill"
import { InstanceRef } from "@/effect/instance-ref"
import path from "path"
import os from "os"
import fs from "fs/promises"

// Agent depends on Config (Config is a dependency, not a sibling).
// Build Agent layer with Config provided as a dependency, then merge with Config
// so the output context has both Config and Agent.
const agentWithConfig = (Agent.defaultLayer as any).pipe(Layer.provideMerge(Config.defaultLayer as any))
const TestLayer = Layer.mergeAll(
  Bus.defaultLayer,
  Permission.defaultLayer,
  Plugin.defaultLayer,
  Skill.defaultLayer,
  agentWithConfig as any,
)

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minicode-test-"))
  try {
    return await fn(tmpDir)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

async function runWithDir<T>(dir: string, effect: Effect.Effect<T, any, any>): Promise<T> {
  const refLayer = Layer.succeed(InstanceRef as any, { directory: dir, worktree: "/" } as any)
  // Layer.provideMerge provides refLayer's outputs to TestLayer's deps AND
  // keeps InstanceRef in the final output context so Config.get() can access it.
  const fullLayer = Layer.provideMerge(refLayer as any, TestLayer as any) as any
  const rt = ManagedRuntime.make(fullLayer)
  try {
    return await rt.runPromise(effect as any)
  } finally {
    await rt.dispose()
  }
}

describe("agent - default behavior", () => {
  it("defaultAgent returns 'build'", async () => {
    await withTempDir(async (dir) => {
      const result = await runWithDir(dir, Effect.gen(function* () {
        const agent = yield* Agent.Service
        return yield* agent.defaultAgent()
      }))
      expect(result).toBe("build")
    })
  })

  it("get('build') returns the default build agent", async () => {
    await withTempDir(async (dir) => {
      const result = await runWithDir(dir, Effect.gen(function* () {
        const agent = yield* Agent.Service
        return yield* agent.get("build")
      })) as any
      expect(result.name).toBe("build")
      expect(result.mode).toBe("primary")
    })
  })

  it("get with unknown name falls back to defaultInfo", async () => {
    await withTempDir(async (dir) => {
      const result = await runWithDir(dir, Effect.gen(function* () {
        const agent = yield* Agent.Service
        return yield* agent.get("nonexistent")
      })) as any
      expect(result.name).toBe("build")
    })
  })

  it("list returns at least one agent", async () => {
    await withTempDir(async (dir) => {
      const result = await runWithDir(dir, Effect.gen(function* () {
        const agent = yield* Agent.Service
        return yield* agent.list()
      })) as any
      expect(result.length).toBeGreaterThanOrEqual(1)
    })
  })
})

describe("config - default behavior", () => {
  it("get returns a config with a 'build' agent when no minicode.json exists", async () => {
    await withTempDir(async (dir) => {
      const result = await runWithDir(dir, Effect.gen(function* () {
        const config = yield* Config.Service
        return yield* config.get()
      })) as any
      expect(result.agents.length).toBeGreaterThanOrEqual(1)
      expect(result.agents[0].name).toBe("build")
      expect(result.permission["*"]).toBe("allow")
    })
  })

  it("get loads agents from minicode.json when it exists", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(
        path.join(dir, "minicode.json"),
        JSON.stringify({
          agents: [{ name: "custom-agent", prompt: "custom prompt" }],
          providers: [],
          permission: { "*": "allow" },
        }),
      )
      const result = await runWithDir(dir, Effect.gen(function* () {
        const config = yield* Config.Service
        return yield* config.get()
      })) as any
      // Config merges user config over defaults; user agents replace defaults
      expect(result.agents.some((a: any) => a.name === "custom-agent")).toBe(true)
    })
  })

  it("get loads permission from minicode.json", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(
        path.join(dir, "minicode.json"),
        JSON.stringify({
          agents: [{ name: "build" }],
          providers: [],
          permission: { "*": "ask" },
        }),
      )
      const result = await runWithDir(dir, Effect.gen(function* () {
        const config = yield* Config.Service
        return yield* config.get()
      })) as any
      expect(result.permission["*"]).toBe("ask")
    })
  })
})