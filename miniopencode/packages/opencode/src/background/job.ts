// ── BackgroundJob Service — Manage async background tasks ────
// Simplified version: tracks background task state in-memory.
// Subagents launched with background:true are tracked here.

import { Clock, Context, Deferred, Effect, Fiber, Layer, SynchronizedRef, Cause } from "effect"

// ── Types ───────────────────────────────────────────────────

export type Status = "running" | "completed" | "error" | "cancelled"

export interface Info {
  readonly id: string
  readonly type: string
  readonly title?: string
  readonly status: Status
  readonly started_at: number
  readonly completed_at?: number
  readonly output?: string
  readonly error?: string
  readonly metadata?: Record<string, unknown>
}

export interface StartInput {
  readonly id?: string
  readonly type: string
  readonly title?: string
  readonly metadata?: Record<string, unknown>
  readonly run: Effect.Effect<string, unknown>
}

export interface WaitInput {
  readonly id: string
  readonly timeout?: number
}

export interface WaitResult {
  readonly info?: Info
  readonly timedOut: boolean
}

// ── Service Interface ───────────────────────────────────────

export interface BackgroundJobShape {
  readonly list: Effect.Effect<ReadonlyArray<Info>>
  readonly get: (id: string) => Effect.Effect<Info | undefined>
  readonly start: (input: StartInput) => Effect.Effect<Info>
  readonly wait: (input: WaitInput) => Effect.Effect<WaitResult>
  readonly cancel: (id: string) => Effect.Effect<Info | undefined>
}

export class BackgroundJobService extends Context.Service<BackgroundJobService, BackgroundJobShape>()("@miniopencode/BackgroundJob") {}

// ── Helpers ─────────────────────────────────────────────────

function snapshot(info: Info): Info {
  return { ...info, ...(info.metadata ? { metadata: { ...info.metadata } } : {}) }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

// ── Factory ─────────────────────────────────────────────────

export function makeBackgroundJob(): Effect.Effect<BackgroundJobShape> {
  return Effect.gen(function* () {
    const jobs = yield* SynchronizedRef.make(new Map<string, { info: Info; done: Deferred.Deferred<Info> }>())

    const finish = (id: string, status: Exclude<Status, "running">, data?: { output?: string; error?: string }) =>
      Effect.gen(function* () {
        const completed_at = yield* Clock.currentTimeMillis
        yield* SynchronizedRef.update(jobs, (map) => {
          const existing = map.get(id)
          if (!existing || existing.info.status !== "running") return map
          const next: Info = { ...existing.info, status, completed_at, ...data }
          map.set(id, { info: next, done: existing.done })
          return map
        })
        const current = (yield* SynchronizedRef.get(jobs)).get(id)
        if (current) yield* Deferred.succeed(current.done, current.info).pipe(Effect.ignore)
      })

    const svc: BackgroundJobShape = {
      list: Effect.gen(function* () {
        const map = yield* SynchronizedRef.get(jobs)
        return Array.from(map.values()).map((j) => snapshot(j.info)).toSorted((a, b) => a.started_at - b.started_at)
      }),

      get: (id) =>
        Effect.gen(function* () {
          const map = yield* SynchronizedRef.get(jobs)
          const job = map.get(id)
          return job ? snapshot(job.info) : undefined
        }),

      start: (input) =>
        Effect.gen(function* () {
          const id = input.id ?? "job_" + Math.random().toString(36).slice(2, 10)
          const started_at = yield* Clock.currentTimeMillis
          const done = yield* Deferred.make<Info>()

          // Check for existing running job
          const existingMap = yield* SynchronizedRef.get(jobs)
          const existing = existingMap.get(id)
          if (existing?.info.status === "running") return snapshot(existing.info)

          const jobRef: { info: Info; done: Deferred.Deferred<Info> } = {
            info: { id, type: input.type, title: input.title, status: "running" as Status, started_at, metadata: input.metadata },
            done,
          }

          yield* SynchronizedRef.update(jobs, (map) => { map.set(id, jobRef); return map })

          // Fork the task detached — outlives the calling scope
          yield* input.run.pipe(
            Effect.matchCauseEffect({
              onSuccess: (output) => finish(id, "completed", { output }).pipe(Effect.ignore),
              onFailure: (cause) =>
                finish(id, Cause.hasInterruptsOnly(cause) ? "cancelled" : "error", {
                  error: errorText(Cause.squash(cause)),
                }).pipe(Effect.ignore),
            }),
            Effect.forkDetach,
          )

          return snapshot(jobRef.info)
        }).pipe(Effect.withSpan("BackgroundJob.start")) as Effect.Effect<Info>,

      wait: (input) =>
        Effect.gen(function* () {
          const map = yield* SynchronizedRef.get(jobs)
          const job = map.get(input.id)
          if (!job) return { timedOut: false } as WaitResult
          if (job.info.status !== "running") return { info: snapshot(job.info), timedOut: false } as WaitResult
          if (input.timeout === undefined) return { info: yield* Deferred.await(job.done), timedOut: false } as WaitResult
          if (input.timeout <= 0) return { info: snapshot(job.info), timedOut: true } as WaitResult
          const info = yield* Deferred.await(job.done).pipe(Effect.timeoutOption(input.timeout))
          if (info._tag === "Some") return { info: info.value, timedOut: false } as WaitResult
          return { info: snapshot(job.info), timedOut: true } as WaitResult
        }),

      cancel: (id) =>
        Effect.gen(function* () {
          yield* finish(id, "cancelled")
          const map = yield* SynchronizedRef.get(jobs)
          const job = map.get(id)
          return job ? snapshot(job.info) : undefined
        }),
    }

    return svc
  })
}

export const BackgroundJobLive = Layer.effect(BackgroundJobService, makeBackgroundJob())

export * as BackgroundJob from "./job"
