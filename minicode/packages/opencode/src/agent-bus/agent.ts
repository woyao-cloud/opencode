import { Context, Effect, Layer } from "effect"
import * as Log from "@minicode/core/util/log"
import { Bus } from "@/bus"
import { ACPBus, onPlanRequest, onBuildRequest } from "./bus"
import {
  type MessageEnvelope,
  type PlanRequestContent,
  type BuildRequestContent,
  PlannerAgent,
  BuilderAgent,
} from "./message"
import { Planner } from "@/pipeline/planner"
import { Builder } from "@/pipeline/builder"

const log = Log.create({ service: "acp.agent" })

// ── Agent Registry Service ──────────────────────────────
export interface Interface {
  readonly start: () => Effect.Effect<void>
  readonly stop: () => Effect.Effect<void>
  readonly isRunning: () => boolean
}

export class Service extends Context.Service<Service, Interface>()("@minicode/ACP") {}

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

// ── Layer ────────────────────────────────────────────────
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service
  let running = false
  let unsubscribers: Array<() => void> = []

  const start = Effect.fn("ACP.start")(function* () {
    if (running) return
    log.info("starting ACP agents")
    const plannerUnsub = yield* createPlannerAgent(bus)
    const builderUnsub = yield* createBuilderAgent(bus)
    unsubscribers = [plannerUnsub, builderUnsub]
    running = true
    log.info("ACP agents started")
  })

  const stop = Effect.fn("ACP.stop")(function* () {
    if (!running) return
    log.info("stopping ACP agents")
    for (const unsub of unsubscribers) {
      try { unsub() } catch { /* ignore */ }
    }
    unsubscribers = []
    running = false
    log.info("ACP agents stopped")
  })

  const isRunning = () => running

  return Service.of({ start, stop, isRunning } as any)
}))

export const defaultLayer = layer

export * as ACPAgent from "./agent"
