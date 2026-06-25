// ── Models CLI Command ──────────────────────────────────
// Shows model configuration: default resolved model, agent->model mappings.

import { Effect } from "effect"
import { AppRuntime, init } from "../bootstrap"
import { ConfigService } from "@/config/config"
import { ProviderService } from "@/provider/index"
import { AgentService } from "@/agent/agent"

export async function modelsListCommand() {
  await init()

  // Resolve the default model
  const defaultModel = await AppRuntime.runPromise(
    ProviderService.use((svc) => svc.defaultModel()),
  ).catch(() => null) as any

  // List agents with their models
  const agentIds = await AppRuntime.runPromise(
    AgentService.use((svc) => svc.list()),
  ).catch(() => []) as string[]

  const agentInfos = await Promise.all(
    agentIds.map((id) =>
      AppRuntime.runPromise(
        AgentService.use((svc) => svc.get(id)),
      ).catch(() => null) as any,
    ),
  )

  // Read config for provider entries
  const config = await AppRuntime.runPromise(
    ConfigService.use((svc) => Effect.succeed(svc.config)),
  ) as any

  const providerCfg = config.provider ?? {}

  console.log("=== Models ===")
  if (defaultModel) {
    console.log(`Default model:      ${defaultModel.modelID}`)
    console.log(`Default provider:   ${defaultModel.providerID}`)
    console.log(`Base URL:           ${defaultModel.baseURL ?? "(default)"}`)
    console.log(`API key:            ${defaultModel.apiKey ? "***" : "(not set)"}`)
  } else {
    console.log("No default model could be resolved.")
  }

  // Show provider -> model mappings from config
  const providers = (providerCfg.providers ?? {}) as Record<string, { model?: string }>
  const providerIds = Object.keys(providers)
  if (providerIds.length > 0) {
    console.log("\n=== Provider Models ===")
    for (const [id, entry] of Object.entries(providers)) {
      console.log(`  ${id}: model=${entry.model ?? "(default)"}`)
    }
  }

  // Show agent -> model mappings
  const validAgents = agentInfos.filter(Boolean)
  if (validAgents.length > 0) {
    console.log("\n=== Agent Models ===")
    for (const agent of validAgents) {
      console.log(`  ${agent.id}: model=${agent.model}`)
    }
  }

  // Show environment variables
  console.log("\n=== Environment ===")
  console.log(`  MINICODE_MODEL:       ${process.env.MINICODE_MODEL ?? "(not set)"}`)
  console.log(`  OPENAI_API_KEY:       ${process.env.OPENAI_API_KEY ? "***" : "(not set)"}`)
  console.log(`  MINICODE_API_KEY:     ${process.env.MINICODE_API_KEY ? "***" : "(not set)"}`)
  console.log(`  MINIOPENCODE_MODEL:   ${process.env.MINIOPENCODE_MODEL ?? "(not set)"}`)
}

export async function modelsResolveCommand(opts: { model?: string; provider?: string }) {
  await init()

  const result = await AppRuntime.runPromise(
    ProviderService.use((svc) => svc.resolve(opts.model, opts.provider)),
  ) as any

  console.log(`Resolved: ${result.modelID} @ ${result.providerID}`)
  console.log(`  baseURL: ${result.baseURL ?? "(default)"}`)
  console.log(`  apiKey:  ${result.apiKey ? "***" : "(not set)"}`)
}

export * as ModelsCommand from "./models"
