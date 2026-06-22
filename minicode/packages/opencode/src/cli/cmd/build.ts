import * as Log from "@minicode/core/util/log"
import { Effect, Schema } from "effect"
import { AppRuntime, init } from "../bootstrap"
import { Bus } from "@/bus"
import { ACPAgent, ACPBus } from "@/agent-bus"
import { BuilderAgent, createCorrelationID, MessageTypes } from "@/agent-bus/message"
import { PlanSchema, type Plan } from "@/pipeline/plan"

const log = Log.create({ service: "cli.build" })

export async function buildCommand(opts: {
  plan?: string
  planFile?: string
  model?: string
  baseURL?: string
  apiKey?: string
}) {
  await init()

  const planJson = opts.plan ?? (opts.planFile ? await readFile(opts.planFile) : undefined)
  if (!planJson) {
    console.error("Error: provide --plan (JSON string) or --plan-file (path to JSON file)")
    process.exit(1)
  }

  let plan: Plan
  try {
    const parsed = JSON.parse(planJson)
    plan = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(PlanSchema)(parsed).pipe(
          Effect.catchEager((e) => Effect.fail(new Error(`Invalid plan: ${e}`))),
        )
        return decoded
      }),
    ) as Plan
  } catch (e) {
    console.error("Error: invalid plan JSON:", e instanceof Error ? e.message : String(e))
    process.exit(1)
  }

  console.log(`Building: ${plan.name}`)
  console.log(`  Files: ${plan.files.length}`)

  await AppRuntime.runPromise(
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const agentBus = yield* ACPAgent.Service
      yield* agentBus.start()

      const buildCorrID = createCorrelationID()
      const buildEnvelope = yield* ACPBus.request<{
        name: string
        files: Array<{ path: string; bytes: number; status: string; error?: string }>
        totalBytes: number
        totalFiles: number
        failedFiles: number
      }>(
        bus,
        ACPBus.sendBuildRequest(bus, BuilderAgent, BuilderAgent, buildCorrID, { plan }),
        MessageTypes.BuildResult,
        buildCorrID,
      )
      const result = buildEnvelope.content

      console.log(`\nBuild complete: ${result.totalFiles} files, ${result.totalBytes} bytes`)
      for (const f of result.files) {
        const icon = f.status === "written" ? "+" : f.status === "failed" ? "!" : "-"
        console.log(`  ${icon} ${f.path} (${f.bytes} bytes)${f.error ? ` - ${f.error}` : ""}`)
      }

      if (result.failedFiles > 0) process.exit(1)
    }),
  ).catch((e: Error) => {
    console.error("Error:", e.message)
    process.exit(1)
  })
}

async function readFile(filePath: string): Promise<string> {
  const file = Bun.file(filePath)
  if (!await file.exists()) {
    console.error(`Error: file not found: ${filePath}`)
    process.exit(1)
  }
  return file.text()
}

export * as BuildCommand from "./build"
