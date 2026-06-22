import * as Log from "@minicode/core/util/log"
import { Effect } from "effect"
import { AppRuntime, init } from "../bootstrap"
import { Bus } from "@/bus"
import { ACPAgent, ACPBus } from "@/agent-bus"
import {
  PlannerAgent,
  BuilderAgent,
  createCorrelationID,
  MessageTypes,
} from "@/agent-bus/message"
import type { Plan } from "@/pipeline/plan"
import type { BuildResult } from "@/pipeline/builder"
import { OpenAI } from "@minicode/llm/providers"

const log = Log.create({ service: "cli.plan" })

export async function planCommand(opts: {
  prompt?: string
  build?: boolean
  model?: string
  baseURL?: string
  apiKey?: string
}) {
  await init()

  if (!opts.prompt) {
    console.error("Error: --prompt (-p) is required")
    process.exit(1)
  }

  const model = resolveModel(opts)

  await AppRuntime.runPromise(
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const acp = yield* ACPAgent.Service

      // Start ACP agents so they can handle requests
      yield* acp.start()

      // Step 1: Plan — send PlanRequest via ACP, wait for PlanResult
      console.log("Planning...")
      const planCorrID = createCorrelationID()

      const planEnvelope = yield* ACPBus.request<{ plan: Plan }>(
        bus,
        ACPBus.sendPlanRequest(bus, PlannerAgent, PlannerAgent, planCorrID, {
          prompt: opts.prompt!,
          model,
        }),
        MessageTypes.PlanResult,
        planCorrID,
      )

      const plan = planEnvelope.content.plan
      console.log(`\nPlan: ${plan.name}`)
      console.log(`   Files: ${plan.files.length}`)
      for (const f of plan.files) {
        const deps = f.deps?.length ? ` (depends on: ${f.deps.join(", ")})` : ""
        console.log(`   - ${f.path}${deps}`)
      }

      // Step 2: Build (if --build flag)
      if (opts.build) {
        console.log("\nBuilding...")
        const buildCorrID = createCorrelationID()

        const buildEnvelope = yield* ACPBus.request<{
          name: string
          files: Array<{ path: string; bytes: number; status: string; error?: string }>
          totalBytes: number
          totalFiles: number
          failedFiles: number
        }>(
          bus,
          ACPBus.sendBuildRequest(bus, BuilderAgent, BuilderAgent, buildCorrID, {
            plan,
          }),
          MessageTypes.BuildResult,
          buildCorrID,
        )

        const result = buildEnvelope.content
        console.log(`\nBuild complete: ${result.totalFiles} files, ${result.totalBytes} bytes`)
        for (const f of result.files) {
          const icon = f.status === "written" ? "+" : f.status === "failed" ? "!" : "-"
          console.log(`   ${icon} ${f.path} (${f.bytes} bytes)${f.error ? ` - ${f.error}` : ""}`)
        }
        if (result.failedFiles > 0) {
          process.exit(1)
        }
      } else {
        console.log("\nRun with --build to write the files")
      }
    }),
  ).catch((e: Error) => {
    console.error("Error:", e.message)
    process.exit(1)
  })
}

function resolveModel(opts: { model?: string; baseURL?: string; apiKey?: string }) {
  const modelID = opts.model ?? process.env.MINICODE_MODEL ?? "gpt-4o-mini"
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
  if (opts.baseURL) {
    return { providerID: "openai-compatible" as any, modelID: modelID as any, apiKey, baseURL: opts.baseURL }
  }
  return OpenAI.model(modelID, { apiKey })
}

export * as PlanCommand from "./plan"
