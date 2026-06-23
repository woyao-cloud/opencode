import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { AppRuntime, init } from "../bootstrap"
import { LLM } from "@miniopencode/llm"
import { OpenAI } from "@miniopencode/llm/providers/openai"

const log = Log.create({ service: "cli.run" })

export async function runCommand(opts: { prompt?: string; model?: string; baseURL?: string; apiKey?: string }) {
  await init()
  if (!opts.prompt) {
    console.error("Error: provide --prompt")
    process.exit(1)
  }

  const model = resolveModel(opts)
  log.info("calling LLM", { prompt: opts.prompt.slice(0, 60) })

  const result = await AppRuntime.runPromise(
    LLM.generate({
      model,
      system: "You are a helpful assistant.",
      messages: [{ role: "user" as const, content: opts.prompt }],
    }),
  ).catch((e: Error) => {
    console.error("Error:", e.message)
    process.exit(1)
  }) as any

  console.log(result.text)
}

function resolveModel(opts: { model?: string; baseURL?: string; apiKey?: string }) {
  const modelID = opts.model ?? process.env.MINICODE_MODEL ?? "gpt-4o-mini"
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
  if (opts.baseURL) {
    return { providerID: "openai-compatible" as any, modelID: modelID as any, apiKey, baseURL: opts.baseURL }
  }
  return OpenAI.model(modelID, { apiKey })
}

export * as RunCommand from "./run"
