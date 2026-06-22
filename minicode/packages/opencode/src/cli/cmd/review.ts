import * as Log from "@minicode/core/util/log"
import { Effect, Schema } from "effect"
import { AppRuntime, init } from "../bootstrap"
import { Bus } from "@/bus"
import { ACPAgent, ACPBus } from "@/agent-bus"
import { ReviewerAgent, createCorrelationID, MessageTypes } from "@/agent-bus/message"
import { PlanSchema, type Plan } from "@/pipeline/plan"

const log = Log.create({ service: "cli.review" })

export async function reviewCommand(opts: {
  plan?: string
  planFile?: string
  buildResult?: string
  buildResultFile?: string
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

  const buildResultJson = opts.buildResult ?? (opts.buildResultFile ? await readFile(opts.buildResultFile) : undefined)
  if (!buildResultJson) {
    console.error("Error: provide --build-result (JSON string) or --build-result-file (path to JSON file)")
    process.exit(1)
  }

  let plan: Plan
  let buildResult: any
  try {
    plan = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(PlanSchema)(JSON.parse(planJson)).pipe(
          Effect.catchEager((e) => Effect.fail(new Error(`Invalid plan: ${e}`))),
        )
        return decoded
      }),
    ) as Plan
    buildResult = JSON.parse(buildResultJson)
  } catch (e) {
    console.error("Error: invalid JSON:", e instanceof Error ? e.message : String(e))
    process.exit(1)
  }

  console.log(`Reviewing: ${plan.name}`)
  console.log(`  Files: ${plan.files.length}`)

  await AppRuntime.runPromise(
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const agentBus = yield* ACPAgent.Service
      yield* agentBus.start()

      const reviewCorrID = createCorrelationID()
      const reviewEnvelope = yield* ACPBus.request<{ passed: boolean; feedback?: string }>(
        bus,
        ACPBus.sendReviewRequest(bus, ReviewerAgent, ReviewerAgent, reviewCorrID, {
          plan,
          buildResult: {
            name: buildResult.name ?? plan.name,
            files: (buildResult.files ?? []).map((f: any) => ({
              path: f.path,
              bytes: f.bytes,
              status: f.status as "written" | "skipped" | "failed",
              error: f.error,
            })),
            totalBytes: buildResult.totalBytes ?? 0,
            totalFiles: buildResult.totalFiles ?? 0,
            failedFiles: buildResult.failedFiles ?? 0,
          },
        }),
        MessageTypes.ReviewResult,
        reviewCorrID,
      )
      const result = reviewEnvelope.content

      if (result.passed) {
        console.log("\nReview: PASSED")
      } else {
        console.log("\nReview: FAILED")
        if (result.feedback) console.log(`  Feedback: ${result.feedback}`)
        process.exit(1)
      }
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

export * as ReviewCommand from "./review"
