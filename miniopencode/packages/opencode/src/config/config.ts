import { Schema, Effect, Context, Layer } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { Global } from "@miniopencode/core/global"
import { InstanceRef } from "@/effect/instance-ref"
import path from "path"
import fs from "fs"

const log = Log.create({ service: "config" })

// ── Config Schema ──────────────────────────────────────────

export const AgentEntry = Schema.Struct({
  model: Schema.optional(Schema.String),
  system: Schema.optional(Schema.String),
  permissions: Schema.optional(Schema.Array(Schema.String)),
})
export type AgentEntry = Schema.Schema.Type<typeof AgentEntry>

export const AgentConfig = Schema.Struct({
  default: Schema.optional(Schema.String),
  agents: Schema.optional(Schema.Record(Schema.String, AgentEntry)),
})
export type AgentConfig = Schema.Schema.Type<typeof AgentConfig>

export const ProviderEntry = Schema.Struct({
  apiKey: Schema.optional(Schema.String),
  baseURL: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
})
export type ProviderEntry = Schema.Schema.Type<typeof ProviderEntry>

export const ProviderConfig = Schema.Struct({
  providers: Schema.optional(Schema.Record(Schema.String, ProviderEntry)),
})
export type ProviderConfig = Schema.Schema.Type<typeof ProviderConfig>

export const PermissionRule = Schema.Struct({
  pattern: Schema.String,
  allow: Schema.optional(Schema.Boolean),
  deny: Schema.optional(Schema.Boolean),
})
export type PermissionRule = Schema.Schema.Type<typeof PermissionRule>

export const PermissionConfig = Schema.Struct({
  rules: Schema.optional(Schema.Array(PermissionRule)),
})
export type PermissionConfig = Schema.Schema.Type<typeof PermissionConfig>

export const MiniOpenCodeConfig = Schema.Struct({
  agent: Schema.optional(AgentConfig),
  provider: Schema.optional(ProviderConfig),
  permission: Schema.optional(PermissionConfig),
})
export type MiniOpenCodeConfig = Schema.Schema.Type<typeof MiniOpenCodeConfig>

// ── Default Config ─────────────────────────────────────────

export const defaultConfig: MiniOpenCodeConfig = {
  agent: {
    default: "default",
    agents: {
      default: {
        model: "gpt-4o-mini",
        system: "You are a helpful assistant.",
        permissions: ["allow:*"],
      },
    },
  },
  provider: {
    providers: {
      openai: { baseURL: "https://api.openai.com/v1" },
    },
  },
  permission: {
    rules: [{ pattern: "allow:*", allow: true }],
  },
}

// ── Config Service ───────────────────────────────────────────

export interface ConfigShape {
  readonly config: MiniOpenCodeConfig
  readonly configPath: string | undefined
}

export class ConfigService extends Context.Service<ConfigService, ConfigShape>()("@miniopencode/Config") {}

function findConfigFile(dir: string): string | undefined {
  const candidates = ["miniopencode.json", "miniopencode.jsonc", ".miniopencode.json"]
  for (const name of candidates) {
    const p = path.join(dir, name)
    if (fs.existsSync(p)) return p
  }
  const parent = path.dirname(dir)
  if (parent !== dir) return findConfigFile(parent)
  return undefined
}

function loadConfigFile(filePath: string): MiniOpenCodeConfig {
  const raw = fs.readFileSync(filePath, "utf-8")
  const parsed = JSON.parse(raw)
  const decoded = Schema.decodeUnknownSync(MiniOpenCodeConfig as any)(parsed)
  log.info("config loaded", { path: filePath })
  return decoded
}

export const ConfigLive = Layer.effect(
  ConfigService,
  Effect.gen(function* () {
    const ref = yield* InstanceRef
    const configPath = findConfigFile(ref.directory)
    const config: MiniOpenCodeConfig = configPath
      ? loadConfigFile(configPath)
      : defaultConfig
    return { config, configPath }
  }),
)
