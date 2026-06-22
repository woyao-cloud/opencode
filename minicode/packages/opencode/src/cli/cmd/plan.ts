import * as Log from "@minicode/core/util/log"
import { Effect } from "effect"
import { AppRuntime, init } from "../bootstrap"
import { Bus } from "@/bus"
import { ACPAgent, ACPBus } from "@/agent-bus"
import {
  PlannerAgent,
  BuilderAgent,
  ReviewerAgent,
  createCorrelationID,
  MessageTypes,
} from "@/agent-bus/message"
import type { Plan } from "@/pipeline/plan"
import { OpenAI } from "@minicode/llm/providers"

const log = Log.create({ service: "cli.plan" })

const MAX_ITERATIONS = 3

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

      let currentPrompt = opts.prompt!
      let currentPlan: Plan | null = null
      let iteration = 0

      while (iteration < MAX_ITERATIONS) {
        iteration++
        const tag = iteration > 1 ? ` (iteration ${iteration})` : ""

        // ── Plan ──
        console.log(`\nPlanning${tag}...`)
        const planCorrID = createCorrelationID()
        const planEnvelope = yield* ACPBus.request<{ plan: Plan }>(
          bus,
          ACPBus.sendPlanRequest(bus, PlannerAgent, PlannerAgent, planCorrID, {
            prompt: currentPrompt,
            model,
          }),
          MessageTypes.PlanResult,
          planCorrID,
        )
        currentPlan = planEnvelope.content.plan

        console.log(`\nPlan: ${currentPlan.name}`)
        console.log(`   Files: ${currentPlan.files.length}`)
        for (const f of currentPlan.files) {
          const deps = f.deps?.length ? ` (depends on: ${f.deps.join(", ")})` : ""
          console.log(`   - ${f.path}${deps}`)
        }

        // If not building, stop after planning
        if (!opts.build) break

        // ── Build ──
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
            plan: currentPlan,
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

        // If review is disabled or build failed structurally, stop
        if (!opts.review) break
        if (result.failedFiles > 0) {
          console.log("\nBuild has errors. Skipping review.")
          process.exit(1)
        }

        // ── Review ──
        console.log("\nReviewing...")
        const reviewCorrID = createCorrelationID()
        const reviewEnvelope = yield* ACPBus.request<{ passed: boolean; feedback?: string }>(
          bus,
          ACPBus.sendReviewRequest(bus, ReviewerAgent, ReviewerAgent, reviewCorrID, {
            plan: currentPlan,
            buildResult: {
              name: result.name,
              files: result.files.map((f) => ({
                path: f.path,
                bytes: f.bytes,
                status: f.status as "written" | "skipped" | "failed",
                error: f.error,
              })),
              totalBytes: result.totalBytes,
              totalFiles: result.totalFiles,
              failedFiles: result.failedFiles,
            },
          }),
          MessageTypes.ReviewResult,
          reviewCorrID,
        )
        const reviewResult = reviewEnvelope.content

        if (reviewResult.passed) {
          console.log("\nReview passed!")
          break
        }

        console.log(`\nReview failed: ${reviewResult.feedback}`)
        if (iteration >= MAX_ITERATIONS) {
          console.log(`\nMax iterations (${MAX_ITERATIONS}) reached. Stopping.`)
          process.exit(1)
        }

        // Re-prompt with feedback
        currentPrompt = `${opts.prompt}\n\nPrevious attempt had issues:\n${reviewResult.feedback}\n\nPlease fix these issues in the new plan.`
        console.log("\nRe-planning with feedback...")
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
