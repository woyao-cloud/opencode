import * as Log from "@minicode/core/util/log"
import { AppRuntime, init } from "../bootstrap"
import { Planner } from "@/pipeline/planner"
import { Builder } from "@/pipeline/builder"
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

  // Step 1: Plan — call LLM to generate a structured plan
  console.log("Planning...")
  const plan = await AppRuntime.runPromise(
    Planner.plan({ prompt: opts.prompt, model }),
  ).catch((e: Error) => {
    console.error("Planning failed:", e.message)
    process.exit(1)
  }) as Plan

  console.log(`\nPlan: ${plan.name}`)
  console.log(`   Files: ${plan.files.length}`)
  for (const f of plan.files) {
    const deps = f.deps?.length ? ` (depends on: ${f.deps.join(", ")})` : ""
    console.log(`   - ${f.path}${deps}`)
  }

  // If --build flag is set, execute the plan
  if (opts.build) {
    console.log("\nBuilding...")
    const result = await AppRuntime.runPromise(Builder.build(plan)).catch((e: Error) => {
      console.error("Build failed:", e.message)
      process.exit(1)
    }) as BuildResult

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
