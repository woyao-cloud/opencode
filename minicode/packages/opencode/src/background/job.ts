import { Context, Effect, Layer, Fiber, Scope } from "effect"
import * as Log from "@minicode/core/util/log"

const log = Log.create({ service: "background.job" })

export type Status = "running" | "completed" | "error" | "cancelled"

export interface Info {
  id: string
  type: string
  title?: string
  status: Status
  startedAt: number
  completedAt?: number
  output?: string
  error?: string
  metadata?: Record<string, unknown>
}

export interface StartInput {
  id?: string
  type: string
  title?: string
  metadata?: Record<string, unknown>
  run: Effect.Effect<string, unknown>
}

export interface Interface {
  readonly list: () => Effect.Effect<Info[]>
  readonly get: (id: string) => Effect.Effect<Info | undefined>
  readonly start: (input: StartInput) => Effect.Effect<Info>
  readonly cancel: (id: string) => Effect.Effect<Info | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@minicode/BackgroundJob") {}

function createID(): string {
  return "job_" + Math.random().toString(36).slice(2, 12)
}

export const layer = Layer.effect(Service, Effect.gen(function* () {
  const scope = yield* Scope.make()
  const jobs = new Map<string, { info: Info; fiber?: Fiber.Fiber<void, unknown> }>()

  const snapshot = (info: Info): Info => ({ ...info, metadata: info.metadata ? { ...info.metadata } : undefined })

  const list: Interface["list"] = Effect.fn("BackgroundJob.list")(function* () {
    return Array.from(jobs.values()).map((j) => snapshot(j.info)).toSorted((a, b) => a.startedAt - b.startedAt)
  })

  const get: Interface["get"] = Effect.fn("BackgroundJob.get")(function* (id) {
    const job = jobs.get(id)
    if (!job) return undefined
    return snapshot(job.info)
  })

  const start: Interface["start"] = Effect.fn("BackgroundJob.start")(function* (input) {
    const id = input.id ?? createID()
    const startedAt = Date.now()

    const info: Info = { id, type: input.type, title: input.title, status: "running", startedAt, metadata: input.metadata }
    jobs.set(id, { info })

    const fiber = yield* Effect.forkIn(
      input.run.pipe(
        Effect.matchEffect({
          onSuccess: (output) => Effect.sync(() => {
            const job = jobs.get(id)
            if (job) {
              job.info = { ...job.info, status: "completed", completedAt: Date.now(), output }
              jobs.set(id, job)
            }
          }),
          onFailure: (e) => Effect.sync(() => {
            const job = jobs.get(id)
            if (job) {
              job.info = { ...job.info, status: "error", completedAt: Date.now(), error: e instanceof Error ? e.message : String(e) }
              jobs.set(id, job)
            }
          }),
        }),
      ),
      scope,
    )

    const job = jobs.get(id)
    if (job) job.fiber = fiber

    log.info("background job started", { id, type: input.type })
    return snapshot(info)
  })

  const cancel: Interface["cancel"] = Effect.fn("BackgroundJob.cancel")(function* (id) {
    const job = jobs.get(id)
    if (!job) return undefined
    if (job.info.status !== "running") return snapshot(job.info)
    if (job.fiber) {
      yield* Fiber.interrupt(job.fiber).pipe(Effect.ignore)
    }
    job.info = { ...job.info, status: "cancelled", completedAt: Date.now() }
    jobs.set(id, job)
    log.info("background job cancelled", { id })
    return snapshot(job.info)
  })

  return Service.of({ list, get, start, cancel } as any)
}))

export const defaultLayer = layer

export * as BackgroundJob from "./job"
