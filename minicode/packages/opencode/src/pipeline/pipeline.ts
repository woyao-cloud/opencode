import { Effect, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import { Bus } from "@/bus"
import { ACPBus } from "@/agent-bus"
import {
  PlannerAgent,
  BuilderAgent,
  ReviewerAgent,
  createCorrelationID,
  MessageTypes,
} from "@/agent-bus/message"
import type { Plan } from "./plan"

const log = Log.create({ service: "pipeline" })

// ── Pipeline state machine ──────────────────────────────

export const PipelineState = Schema.Literals([
  "idle",
  "planning",
  "planned",
  "building",
  "built",
  "reviewing",
  "done",
  "plan_failed",
  "build_failed",
  "review_failed",
])
export type PipelineState = typeof PipelineState.Type

export interface PipelineContext {
  state: PipelineState
  prompt: string
  plan?: Plan
  buildResult?: {
    name: string
    files: Array<{ path: string; bytes: number; status: string; error?: string }>
    totalBytes: number
    totalFiles: number
    failedFiles: number
  }
  reviewResult?: { passed: boolean; feedback?: string }
  iteration: number
  maxIterations: number
}

export interface PipelineOptions {
  prompt: string
  model: { providerID: string; modelID: string; apiKey?: string; baseURL?: string }
  build?: boolean
  review?: boolean
  maxIterations?: number
}

// ── Pipeline runner ─────────────────────────────────────

export function run(
  bus: Bus.Interface,
  opts: PipelineOptions,
): Effect.Effect<PipelineContext, Error> {
  const maxIterations = opts.maxIterations ?? 3

  const ctx: PipelineContext = {
    state: "idle",
    prompt: opts.prompt,
    iteration: 0,
    maxIterations,
  }

  return (Effect.gen(function* () {
    while (ctx.iteration < maxIterations) {
      ctx.iteration++
      const tag = ctx.iteration > 1 ? ` (iteration ${ctx.iteration})` : ""

      // ── Plan ──
      ctx.state = "planning"
      log.info("pipeline planning", { iteration: ctx.iteration, prompt: ctx.prompt.slice(0, 60) })

      const planCorrID = createCorrelationID()
      const planEnvelope = yield* ACPBus.request<{ plan: Plan }>(
        bus,
        ACPBus.sendPlanRequest(bus, PlannerAgent, PlannerAgent, planCorrID, {
          prompt: ctx.prompt,
          model: opts.model,
        }),
        MessageTypes.PlanResult,
        planCorrID,
      )
      ctx.plan = planEnvelope.content.plan
      ctx.state = "planned"

      // If not building, stop
      if (!opts.build) {
        ctx.state = "done"
        return ctx
      }

      // ── Build ──
      ctx.state = "building"
      log.info("pipeline building", { name: ctx.plan.name })

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
          plan: ctx.plan,
        }),
        MessageTypes.BuildResult,
        buildCorrID,
      )
      ctx.buildResult = buildEnvelope.content
      ctx.state = "built"

      if (ctx.buildResult.failedFiles > 0) {
        ctx.state = "build_failed"
        return ctx
      }

      // If not reviewing, stop
      if (!opts.review) {
        ctx.state = "done"
        return ctx
      }

      // ── Review ──
      ctx.state = "reviewing"
      log.info("pipeline reviewing", { name: ctx.plan.name })

      const reviewCorrID = createCorrelationID()
      const reviewEnvelope = yield* ACPBus.request<{ passed: boolean; feedback?: string }>(
        bus,
        ACPBus.sendReviewRequest(bus, ReviewerAgent, ReviewerAgent, reviewCorrID, {
          plan: ctx.plan,
          buildResult: {
            name: ctx.buildResult.name,
            files: ctx.buildResult.files.map((f) => ({
              path: f.path,
              bytes: f.bytes,
              status: f.status as "written" | "skipped" | "failed",
              error: f.error,
            })),
            totalBytes: ctx.buildResult.totalBytes,
            totalFiles: ctx.buildResult.totalFiles,
            failedFiles: ctx.buildResult.failedFiles,
          },
        }),
        MessageTypes.ReviewResult,
        reviewCorrID,
      )
      ctx.reviewResult = reviewEnvelope.content

      if (ctx.reviewResult.passed) {
        ctx.state = "done"
        return ctx
      }

      // Review failed — re-prompt with feedback
      ctx.state = "review_failed"
      ctx.prompt = `${opts.prompt}\n\nPrevious attempt had issues:\n${ctx.reviewResult.feedback}\n\nPlease fix these issues in the new plan.`
    }

    ctx.state = "review_failed"
    return ctx
  }) as any) as Effect.Effect<PipelineContext, Error>
}

// ── Report formatting ──────────────────────────────────

export function formatReport(ctx: PipelineContext): string {
  const lines: string[] = []

  lines.push(`Pipeline: ${ctx.state}`)
  lines.push(`Iteration: ${ctx.iteration}/${ctx.maxIterations}`)

  if (ctx.plan) {
    lines.push(`\nPlan: ${ctx.plan.name}`)
    lines.push(`  Files: ${ctx.plan.files.length}`)
    for (const f of ctx.plan.files) {
      const deps = f.deps?.length ? ` (depends on: ${f.deps.join(", ")})` : ""
      lines.push(`  - ${f.path}${deps}`)
    }
  }

  if (ctx.buildResult) {
    lines.push(`\nBuild: ${ctx.buildResult.totalFiles} files, ${ctx.buildResult.totalBytes} bytes`)
    for (const f of ctx.buildResult.files) {
      const icon = f.status === "written" ? "+" : f.status === "failed" ? "!" : "-"
      lines.push(`  ${icon} ${f.path} (${f.bytes} bytes)${f.error ? ` - ${f.error}` : ""}`)
    }
  }

  if (ctx.reviewResult) {
    lines.push(`\nReview: ${ctx.reviewResult.passed ? "PASSED" : "FAILED"}`)
    if (ctx.reviewResult.feedback) {
      lines.push(`  Feedback: ${ctx.reviewResult.feedback}`)
    }
  }

  return lines.join("\n")
}

export * as Pipeline from "./pipeline"
