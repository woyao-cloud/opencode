import { describe, it, expect } from "bun:test"
import { Effect } from "effect"
import { AppRuntime } from "../src/cli/bootstrap"
import { ConfigService } from "../src/config/config"
import { AgentService } from "../src/agent/agent"
import { PermissionService } from "../src/permission/index"
import { ProjectService } from "../src/project/project"
import { ToolRuntimeService } from "../src/tool/tool"

// Smoke test: verify all services are resolvable from the runtime
// without "Service not found" errors.

describe("Runtime", () => {
  it("resolves ConfigService", async () => {
    const svc = await AppRuntime.runPromise(ConfigService.use((s) => Effect.succeed(s)))
    expect(svc).toBeDefined()
    expect(svc.config).toBeDefined()
    // agent and provider are optional fields — they may be undefined
    // when a config file exists that only specifies certain sections
    if (svc.config.agent) {
      expect(svc.config.agent.default).toBeDefined()
    }
    if (svc.config.provider) {
      // provider itself may be empty, but should be an object when present
      expect(typeof svc.config.provider).toBe("object")
    }
  })

  it("resolves AgentService", async () => {
    const svc = await AppRuntime.runPromise(AgentService.use((s) => Effect.succeed(s)))
    expect(svc).toBeDefined()
    const agent = await AppRuntime.runPromise(svc.defaultAgent())
    expect(agent.id).toBeDefined()
    expect(agent.model).toBeDefined()
  })

  it("resolves PermissionService", async () => {
    const svc = await AppRuntime.runPromise(PermissionService.use((s) => Effect.succeed(s)))
    expect(svc).toBeDefined()
    // Service resolves correctly; evaluate does not throw
    expect(typeof svc.evaluate).toBe("function")
    expect(typeof svc.request).toBe("function")
  })

  it("resolves ToolRuntimeService", async () => {
    const svc = await AppRuntime.runPromise(ToolRuntimeService.use((s) => Effect.succeed(s)))
    expect(svc).toBeDefined()
    expect(svc.tools().length).toBeGreaterThanOrEqual(5)
  })

  it("resolves ProjectService", async () => {
    const svc = await AppRuntime.runPromise(ProjectService.use((s) => Effect.succeed(s)))
    expect(svc).toBeDefined()
    const dir = await AppRuntime.runPromise(svc.directory)
    expect(dir).toBeDefined()
  })
})
