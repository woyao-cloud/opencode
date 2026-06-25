import { Effect, Layer } from "effect"
import { ConfigService, MiniOpenCodeConfig, ConfigShape, findConfigFile, loadConfigFile, defaultConfig } from "@/config/config"
import { AgentLive } from "@/agent/agent"
import { PermissionLive } from "@/permission/index"
import { makeProjectLive } from "./project"
import { ToolRuntimeService, makeRuntime } from "@/tool/tool"
import { ReadTool, WriteTool, BashTool, GlobTool, GrepTool } from "@/tool"
import { ProviderLive } from "@/provider/index"
import { SessionLive, SessionStatusLive, SessionRunStateLive, LlmLive, PromptLive } from "@/session/index"
import { BusLive } from "@/bus/index"
import { BackgroundJobLive } from "@/background/job"
import { StorageLive } from "@/storage/index"
import { DataMigrationLive } from "@/data-migration"
import { MCPLive } from "@/mcp/index"

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

// ── Layer composition ───────────────────────────────────────
// Effect v4 beta.65: Layer.mergeAll() does NOT resolve cross-layer
// dependencies at runtime. Layer.provide() consumes dependency tags,
// preventing them from reaching sibling layers.
// Layer.provideMerge() is the fix — it feeds deps into a layer while
// ALSO keeping those deps' tags in the output. Type erasure with `as any`
// matches the pattern used by the full opencode codebase.
// ─────────────────────────────────────────────────────────────

const configAndBus = Layer.mergeAll(configLayer, BusLive) as any

// Layers that only need ConfigService and/or BusService
const providerLayer = (ProviderLive as any).pipe(Layer.provideMerge(configAndBus))
const agentLayer = (AgentLive as any).pipe(Layer.provideMerge(configAndBus))
const permissionLayer = (PermissionLive as any).pipe(Layer.provideMerge(configAndBus))
const sessionLayer = (SessionLive as any).pipe(Layer.provideMerge(configAndBus))
const sessionStatusLayer = (SessionStatusLive as any).pipe(Layer.provideMerge(configAndBus))
const mcpLayer = (MCPLive as any).pipe(Layer.provideMerge(configAndBus))

// SessionRunStateLive needs SessionStatusService (provided by sessionStatusLayer)
const runStateLayer = (SessionRunStateLive as any).pipe(Layer.provideMerge(sessionStatusLayer))

// makeProjectLive needs ConfigService, AgentService, and PermissionService
const projectDeps = Layer.mergeAll(agentLayer, permissionLayer, configAndBus) as any
const projectLayer = (makeProjectLive(dir) as any).pipe(Layer.provideMerge(projectDeps))

// All layers have their requirements satisfied via provideMerge chains.
// Final mergeAll collects all output tags.
export const InstanceLayer = Layer.mergeAll(
  configAndBus,
  toolLayer,
  providerLayer,
  agentLayer,
  permissionLayer,
  projectLayer,
  sessionLayer,
  sessionStatusLayer,
  runStateLayer,
  LlmLive,
  PromptLive,
  BackgroundJobLive,
  StorageLive,
  DataMigrationLive,
  mcpLayer,
) as any
