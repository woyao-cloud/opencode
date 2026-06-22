import * as Log from "@minicode/core/util/log"
import { Effect } from "effect"
import { AppRuntime, init } from "../bootstrap"
import { Bus } from "@/bus"
import { ACPAgent } from "@/agent-bus"
import { Pipeline, type PipelineContext } from "@/pipeline/pipeline"
import { OpenAI } from "@minicode/llm/providers"

const log = Log.create({ service: "cli.plan" })

export async function planCommand(opts: {
  prompt?: string
  build?: boolean
  review?: boolean
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
      const agentBus = yield* ACPAgent.Service
      yield* agentBus.start()

      const ctx = yield* Pipeline.run(bus, {
        prompt: opts.prompt!,
        model,
        build: opts.build,
        review: opts.review,
      })

      console.log(Pipeline.formatReport(ctx))

      if (ctx.state === "build_failed" || ctx.state === "review_failed" || ctx.state === "plan_failed") {
        process.exit(1)
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
