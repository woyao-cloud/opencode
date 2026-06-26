/**
 * auth/index.ts — 认证服务
 *
 * 管理多 provider 的 API Key / OAuth 凭据
 * 参考: packages/opencode/src/auth/index.ts
 */

import { Effect, Layer, Schema, Context } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { Global } from "@miniopencode/core/global"
import fs from "fs"
import path from "path"

const log = Log.create({ service: "auth" })

// ===== Schema =====

export class ApiAuth extends Schema.Class<ApiAuth>("ApiAuth")({
  type: Schema.Literal("api"),
  key: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
}) {}

export class OAuthInfo extends Schema.Class<OAuthInfo>("OAuthInfo")({
  type: Schema.Literal("oauth"),
  refresh: Schema.String,
  access: Schema.String,
  expires: Schema.Number,
}) {}

export const AuthInfo = Schema.Union([ApiAuth, OAuthInfo]).annotate({
  discriminator: "type",
  identifier: "AuthInfo",
})
export type AuthInfo = Schema.Schema.Type<typeof AuthInfo>

// ===== 服务接口 =====

export interface AuthService {
  readonly get: (providerID: string) => Effect.Effect<AuthInfo | undefined>
  readonly all: () => Effect.Effect<Record<string, AuthInfo>>
  readonly set: (providerID: string, info: AuthInfo) => Effect.Effect<void>
  readonly remove: (providerID: string) => Effect.Effect<void>
  readonly getApiKey: (providerID: string) => Effect.Effect<string | undefined>
}

// ===== Context Tag =====

export class AuthServiceTag extends Context.Service<AuthServiceTag, AuthService>()("@miniopencode/Auth") {}

// ===== 持久化 =====

const authFile = path.join(Global.Path.data, "auth.json")

const readAuthFile = (): Effect.Effect<Record<string, unknown>> =>
  Effect.sync(() => {
    try {
      if (!fs.existsSync(authFile)) return {}
      const raw = fs.readFileSync(authFile, "utf-8")
      return JSON.parse(raw)
    } catch {
      return {}
    }
  })

const writeAuthFile = (data: Record<string, unknown>): Effect.Effect<void> =>
  Effect.sync(() => {
    const dir = path.dirname(authFile)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(authFile, JSON.stringify(data, null, 2), "utf-8")
  })

// ===== Layer =====

export const AuthLive = Layer.effect(
  AuthServiceTag,
  Effect.gen(function* () {
    // 从环境变量加载 API Key（OPENCODE_PROVIDER_XXX_API_KEY 格式）
    const envKeys: Record<string, string> = {}
    for (const [envKey, envVal] of Object.entries(process.env)) {
      const match = envKey.match(/^OPENCODE_PROVIDER_(.+)_API_KEY$/i)
      if (match && envVal) {
        envKeys[match[1].toLowerCase()] = envVal
      }
    }

    return {
      get: (providerID: string) =>
        Effect.gen(function* () {
          const data = yield* readAuthFile()
          const entry = data[providerID]
          if (entry) return entry as AuthInfo

          // Fallback to env var
          const envKey = envKeys[providerID.toLowerCase()]
          if (envKey) {
            return new ApiAuth({ type: "api", key: envKey })
          }
          return undefined
        }),

      all: () =>
        Effect.gen(function* () {
          const data = yield* readAuthFile()
          const result: Record<string, AuthInfo> = {}
          for (const [k, v] of Object.entries(data)) {
            result[k] = v as AuthInfo
          }
          for (const [k, v] of Object.entries(envKeys)) {
            if (!result[k]) {
              result[k] = new ApiAuth({ type: "api", key: v })
            }
          }
          return result
        }),

      set: (providerID: string, info: AuthInfo) =>
        Effect.gen(function* () {
          const data = yield* readAuthFile()
          data[providerID] = info
          yield* writeAuthFile(data)
          log.info("auth saved", { provider: providerID })
        }),

      remove: (providerID: string) =>
        Effect.gen(function* () {
          const data = yield* readAuthFile()
          delete data[providerID]
          yield* writeAuthFile(data)
          log.info("auth removed", { provider: providerID })
        }),

      getApiKey: (providerID: string) =>
        Effect.gen(function* () {
          const info = yield* AuthServiceTag.get(providerID)
          if (info && info.type === "api") return info.key
          return undefined
        }),
    }
  }),
)
