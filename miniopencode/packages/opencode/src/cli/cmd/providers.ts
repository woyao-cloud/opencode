// ── Providers CLI Command ─────────────────────────────────
// Shows configured providers from config file and environment.

import { Effect } from "effect"
import { AppRuntime, init } from "../bootstrap"
import { ConfigService } from "@/config/config"
import { ProviderService } from "@/provider/index"
import { DEFAULT_PROVIDER } from "@/provider/index"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "cli.providers" })

export async function providersListCommand() {
  await init()

  const config = await AppRuntime.runPromise(
    ConfigService.use((svc) => Effect.succeed(svc.config)),
  ) as any

  const defaultModel = await AppRuntime.runPromise(
    ProviderService.use((svc) => svc.defaultModel()),
  ).catch(() => null) as any

  const providerCfg = config.provider ?? {}
  const providers = providerCfg.providers ?? {} as Record<string, { apiKey?: string; baseURL?: string; model?: string }>
  const defaultProviderId = providerCfg.default ?? DEFAULT_PROVIDER
  const providerIds = Object.keys(providers)

  if (providerIds.length === 0) {
    console.log("No providers configured in config file.")
    console.log(`Default provider: ${defaultProviderId}`)
    console.log(`Config path: ${config.configPath ?? "(none — using defaults)"}`)
    console.log("")
    console.log("Environment:")
    console.log(`  OPENAI_API_KEY:      ${process.env.OPENAI_API_KEY ? "***" : "(not set)"}`)
    console.log(`  MINICODE_API_KEY:    ${process.env.MINICODE_API_KEY ? "***" : "(not set)"}`)
    console.log(`  MINICODE_MODEL:      ${process.env.MINICODE_MODEL ?? "(not set)"}`)
    if (defaultModel) {
      console.log(`\nResolved default model: ${defaultModel.modelID} (via ${defaultModel.providerID})`)
    }
    return
  }

  console.log(`Configured providers (${providerIds.length}):`)
  console.log(`Config path: ${config.configPath ?? "(none)"}`)
  console.log("")

  for (const id of providerIds) {
    const entry = providers[id]
    const isDefault = id === defaultProviderId
    const marker = isDefault ? "*" : " "
    const apiKeySrc = entry?.apiKey
      ? "config"
      : process.env.OPENAI_API_KEY
        ? "env(OPENAI_API_KEY)"
        : process.env.MINICODE_API_KEY
          ? "env(MINICODE_API_KEY)"
          : "(not set)"
    const baseURL = entry?.baseURL ?? "(default)"
    const model = entry?.model ?? "(default)"

    console.log(`${marker} ${id}${isDefault ? " (default)" : ""}`)
    console.log(`    model:   ${model}`)
    console.log(`    apiKey:  ${apiKeySrc}`)
    console.log(`    baseURL: ${baseURL}`)
  }

  if (defaultModel) {
    console.log(`\nResolved default: ${defaultModel.modelID} @ ${defaultModel.providerID}`)
  }
}

export async function providersResolveCommand(opts: { model?: string; provider?: string }) {
  await init()

  const result = await AppRuntime.runPromise(
    ProviderService.use((svc) => svc.resolve(opts.model, opts.provider)),
  ) as any

  console.log(`Resolved model:`)
  console.log(`  providerID: ${result.providerID}`)
  console.log(`  modelID:    ${result.modelID}`)
  console.log(`  baseURL:    ${result.baseURL ?? "(default)"}`)
  console.log(`  apiKey:     ${result.apiKey ? "***" : "(not set)"}`)
}

export * as ProvidersCommand from "./providers"
