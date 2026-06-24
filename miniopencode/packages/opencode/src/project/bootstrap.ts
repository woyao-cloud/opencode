import { Effect, Layer } from "effect"
import { ConfigService, MiniOpenCodeConfig, ConfigShape, findConfigFile, loadConfigFile, defaultConfig } from "@/config/config"
import { AgentService, makeAgent, type AgentShape, AgentLive } from "@/agent/agent"
import { PermissionService, makePermission, type PermissionShape, PermissionLive } from "@/permission/index"
import { ProjectService, makeProject, makeProjectLive } from "./project"
import { ToolRuntimeService, makeRuntime } from "@/tool/tool"
import { ReadTool, WriteTool, BashTool, GlobTool, GrepTool } from "@/tool"
import { ProviderService, makeProvider, type ProviderShape, ProviderLive } from "@/provider/index"
import { SessionLive, LlmLive, PromptLive } from "@/session/index"
import { BusLive } from "@/bus/index"

// ── Service Layers (mix of Layer.succeed + Layer.effect) ─────

const dir = process.cwd()

// 1. Config — loaded synchronously, no Effect dependencies
const configPath = findConfigFile(dir)
const config: MiniOpenCodeConfig = configPath ? loadConfigFile(configPath) : defaultConfig
const configShape: ConfigShape = { config, configPath }
const configLayer = Layer.succeed(ConfigService, configShape)

// 2. Tool runtime — no Effect dependencies, pre-resolved
const runtime = makeRuntime([
  Effect.runSync(ReadTool),
  Effect.runSync(WriteTool),
  Effect.runSync(BashTool),
  Effect.runSync(GlobTool),
  Effect.runSync(GrepTool),
])
const toolLayer = Layer.succeed(ToolRuntimeService, runtime)

// 3. Session — Effect-based, depends on BusService
const sessionLayer = Layer.provide(SessionLive, BusLive)

// 4. Provider/Agent/Permission — Effect-based, each depends on ConfigService
const providerLayer = Layer.provide(ProviderLive, configLayer)
const agentLayer = Layer.provide(AgentLive, configLayer)
const permissionLayer = Layer.provide(PermissionLive, configLayer)

// 5. Project — Effect-based, depends on ConfigService + AgentService + PermissionService
const projectDeps = Layer.mergeAll(configLayer, agentLayer, permissionLayer)
const projectLayer = Layer.provide(makeProjectLive(dir), projectDeps)

// Merge all layers into one. Layers with satisfied requirements resolve cleanly.
export const InstanceLayer = Layer.mergeAll(
  configLayer,
  toolLayer,
  providerLayer,
  agentLayer,
  permissionLayer,
  projectLayer,
  sessionLayer,
  LlmLive,
  PromptLive,
)
