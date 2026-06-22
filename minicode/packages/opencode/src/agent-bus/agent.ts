import { Context, Effect, Layer } from "effect"
import * as Log from "@minicode/core/util/log"
import { Bus } from "@/bus"
import { ACPBus, onPlanRequest, onBuildRequest, onReviewRequest } from "./bus"
import {
  type MessageEnvelope,
  type PlanRequestContent,
  type BuildRequestContent,
  type ReviewRequestContent,
  PlannerAgent,
  BuilderAgent,
  ReviewerAgent,
} from "./message"
import { Planner } from "@/pipeline/planner"
import { Builder } from "@/pipeline/builder"
import { Reviewer } from "@/pipeline/reviewer"

const log = Log.create({ service: "agent-bus.agent" })

// ── Agent Registry Service ──────────────────────────────
export interface Interface {
  readonly start: () => Effect.Effect<void>
  readonly stop: () => Effect.Effect<void>
  readonly isRunning: () => boolean
}

export class Service extends Context.Service<Service, Interface>()("@minicode/AgentBus") {}

// ── Agent implementations ────────────────────────────────

function createPlannerAgent(bus: Bus.Interface) {
  return Effect.gen(function* () {
    log.info("planner agent started")
    const unsubscribe = yield* onPlanRequest(bus, (envelope: MessageEnvelope<PlanRequestContent>) => {
      const content = envelope.content
      log.info("planner received request", { correlationID: envelope.correlationID, prompt: content.prompt.slice(0, 60) })

      Effect.runFork(
        Effect.gen(function* () {
          const plan = yield* Planner.plan({
            prompt: content.prompt,
            model: {
              providerID: content.model.providerID as any,
              modelID: content.model.modelID as any,
              apiKey: content.model.apiKey,
              baseURL: content.model.baseURL,
            },
          })
          yield* ACPBus.sendPlanResult(bus, PlannerAgent, envelope.source, envelope.correlationID, { plan })
        }).pipe(
          Effect.catchEager((e: any) => Effect.sync(() => log.error("planner failed", { error: e?.message ?? String(e) }))),
        ) as any,
      )
    })
    return unsubscribe
  })
}

function createBuilderAgent(bus: Bus.Interface) {
  return Effect.gen(function* () {
    log.info("builder agent started")
    const unsubscribe = yield* onBuildRequest(bus, (envelope: MessageEnvelope<BuildRequestContent>) => {
      const content = envelope.content
      log.info("builder received request", { correlationID: envelope.correlationID, plan: content.plan.name })

      Effect.runFork(
        Effect.gen(function* () {
          const result = yield* Builder.build(content.plan, content.baseDir)
          yield* ACPBus.sendBuildResult(bus, BuilderAgent, envelope.source, envelope.correlationID, {
            name: result.name,
            files: result.files.map((f) => ({
              path: f.path,
              bytes: f.bytes,
              status: f.status,
              error: f.error,
            })),
            totalBytes: result.totalBytes,
            totalFiles: result.totalFiles,
            failedFiles: result.failedFiles,
          })
        }).pipe(
          Effect.catchEager((e: any) => Effect.sync(() => log.error("builder failed", { error: e?.message ?? String(e) }))),
        ) as any,
      )
    })
    return unsubscribe
  })
}

function createReviewerAgent(bus: Bus.Interface) {
  return Effect.gen(function* () {
    log.info("reviewer agent started")
    const unsubscribe = yield* onReviewRequest(bus, (envelope: MessageEnvelope<ReviewRequestContent>) => {
      const content = envelope.content
      log.info("reviewer received request", { correlationID: envelope.correlationID, plan: content.plan.name })

      Effect.runFork(
        Effect.gen(function* () {
          const result = yield* Reviewer.review({
            plan: content.plan,
            result: content.buildResult,
          })
          yield* ACPBus.sendReviewResult(bus, ReviewerAgent, envelope.source, envelope.correlationID, {
            passed: result.passed,
            feedback: result.feedback,
          })
        }).pipe(
          Effect.catchEager((e: any) => Effect.sync(() => log.error("reviewer failed", { error: e?.message ?? String(e) }))),
        ) as any,
      )
    })
    return unsubscribe
  })
}

// ── Layer ────────────────────────────────────────────────
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service
  let running = false
  let unsubscribers: Array<() => void> = []

  const start = Effect.fn("AgentBus.start")(function* () {
    if (running) return
    log.info("starting agent-bus agents")
    const plannerUnsub = yield* createPlannerAgent(bus)
    const builderUnsub = yield* createBuilderAgent(bus)
    const reviewerUnsub = yield* createReviewerAgent(bus)
    unsubscribers = [plannerUnsub, builderUnsub, reviewerUnsub]
    running = true
    log.info("agent-bus agents started")
  })

  const stop = Effect.fn("AgentBus.stop")(function* () {
    if (!running) return
    log.info("stopping agent-bus agents")
    for (const unsub of unsubscribers) {
      try { unsub() } catch { /* ignore */ }
    }
    unsubscribers = []
    running = false
    log.info("agent-bus agents stopped")
  })

  const isRunning = () => running

  return Service.of({ start, stop, isRunning } as any)
}))

export const defaultLayer = layer

export * as AgentBusAgent from "./agent"
