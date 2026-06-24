import { Effect, Layer } from "effect"
import { ConfigService, MiniOpenCodeConfig, ConfigShape, findConfigFile, loadConfigFile, defaultConfig } from "@/config/config"
import { AgentService, makeAgent, type AgentShape } from "@/agent/agent"
import { PermissionService, makePermission, type PermissionShape } from "@/permission/index"
import { ProjectService, makeProject } from "./project"
import { ToolRuntimeService, makeRuntime } from "@/tool/tool"
import { ReadTool, WriteTool, BashTool, GlobTool, GrepTool } from "@/tool"
import { ProviderService, makeProvider, type ProviderShape } from "@/provider/index"
import { SessionLive } from "@/session/session"
import { BusLive } from "@/bus/index"

// ── Pre-compute all services synchronously ──────────────────
// This avoids Effect's layer dependency resolution which can
// cause "Service not found" errors with Layer.provide + Layer.effect.

const dir = process.cwd()

// 1. Config (no dependencies)
const configPath = findConfigFile(dir)
const config: MiniOpenCodeConfig = configPath ? loadConfigFile(configPath) : defaultConfig
const configShape: ConfigShape = { config, configPath }
const configLayer = Layer.succeed(ConfigService, configShape)

// 2. Tool runtime — resolve tool define() Effects synchronously (no deps)
const runtime = makeRuntime([
  Effect.runSync(ReadTool),
  Effect.runSync(WriteTool),
  Effect.runSync(BashTool),
  Effect.runSync(GlobTool),
  Effect.runSync(GrepTool),
])
const toolLayer = Layer.succeed(ToolRuntimeService, runtime)

// 3. Provider (depends on config value)
const provider: ProviderShape = makeProvider(config.provider, process.env.MINICODE_MODEL)
const providerLayer = Layer.succeed(ProviderService, provider)

// 4. Agent (depends on config value)
const agent: AgentShape = makeAgent(config.agent)
const agentLayer = Layer.succeed(AgentService, agent)

// 5. Permission (depends on config value)
const permission: PermissionShape = makePermission(config.permission)
const permissionLayer = Layer.succeed(PermissionService, permission)

// 7. Project (depends on directory, config, agent, permission)
const project = makeProject(dir, config, agent, permission)
const projectLayer = Layer.succeed(ProjectService, project)

// Compose all layers. Use Layer.provide to wire SessionLive → BusLive.
const sessionLayer = Layer.provide(SessionLive, BusLive)
export const InstanceLayer = Layer.mergeAll(
  configLayer,
  toolLayer,
  providerLayer,
  agentLayer,
  permissionLayer,
  projectLayer,
  sessionLayer,
)
