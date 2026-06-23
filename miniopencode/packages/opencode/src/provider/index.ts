import { Effect, Context, Layer } from "effect"
import * as Log from "@miniopencode/core/util/log"
import type { ProviderID, ModelID } from "@miniopencode/llm"
import type { ProviderConfig, ResolvedModel, ProviderEntry } from "./schema"

const log = Log.create({ service: "provider" })

// ── Defaults ───────────────────────────────────────────────

export const DEFAULT_PROVIDER = "openai"
export const DEFAULT_MODEL = "glm-5.1"

// ── Service Interface ──────────────────────────────────────

export interface ProviderShape {
  readonly resolve: (modelID?: string, providerID?: string) => Effect.Effect<ResolvedModel, Error>
  readonly defaultModel: () => Effect.Effect<ResolvedModel, Error>
}

export class ProviderService extends Context.Service<ProviderService, ProviderShape>()("@miniopencode/Provider") {}

// ── Factory ─────────────────────────────────────────────────

export function makeProvider(providerConfig: ProviderConfig | undefined, envModel: string | undefined): ProviderShape {
  const providers = providerConfig?.providers ?? {}
  const defaultProviderID = providerConfig?.default ?? DEFAULT_PROVIDER

  function lookupProvider(id: string): ProviderEntry | undefined {
    return providers[id]
  }

  function lookupApiKey(entry: ProviderEntry | undefined): string | undefined {
    return entry?.apiKey ?? process.env.OPENAI_API_KEY ?? process.env.MINICODE_API_KEY
  }

  const resolve = (modelID?: string, providerID?: string): Effect.Effect<ResolvedModel, Error> =>
    Effect.sync(() => {
      const pid = providerID ?? defaultProviderID
      const entry = lookupProvider(pid)
      const mid = modelID ?? entry?.model ?? envModel ?? DEFAULT_MODEL
      const apiKey = lookupApiKey(entry)
      // Only set baseURL when explicitly configured in the provider entry
      const baseURL = entry?.baseURL

      log.info("resolve", { provider: pid, model: mid, baseURL: baseURL ? baseURL.replace(/\/\/.*@/, "//***@") : "none" })

      return {
        providerID: pid as any as ProviderID,
        modelID: mid as any as ModelID,
        apiKey,
        baseURL,
      } as ResolvedModel
    })

  const defaultModel = (): Effect.Effect<ResolvedModel, Error> =>
    resolve()

  return { resolve, defaultModel }
}

// ── Layer ───────────────────────────────────────────────────

export const ProviderLive = Layer.succeed(
  ProviderService,
  (() => {
    // Bootstrap reads config later; this layer gets overridden by bootstrap.
    // The real one is created in project/bootstrap.ts with full config access.
    const envModel = process.env.MINICODE_MODEL ?? process.env.MINICODE_MODEL
    return makeProvider({}, envModel)
  })(),
)

export * as Provider from "."
