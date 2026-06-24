// ── SessionStatus Service — Track per-session runtime state ──
// Lightweight in-memory tracker: idle | busy | retry(attempt, message) | error(message).
// State is stored per-instance via InstanceState so it survives scope boundaries.

import { Context, Effect, Layer, Scope } from "effect"
import { InstanceState } from "@/effect/index"
import { BusService } from "@/bus/index"
import { SessionStatusChanged } from "@/bus/bus-event"

// ── Types ────────────────────────────────────────────────────

export interface StatusIdle {
  readonly type: "idle"
}

export interface StatusBusy {
  readonly type: "busy"
}

export interface StatusRetry {
  readonly type: "retry"
  readonly attempt: number
  readonly message: string
  readonly next: number  // ms until next retry
}

export interface StatusError {
  readonly type: "error"
  readonly message: string
}

export type Info = StatusIdle | StatusBusy | StatusRetry | StatusError

// ── Service Interface ────────────────────────────────────────

export interface SessionStatusShape {
  readonly get: (sessionID: string) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Map<string, Info>>
  readonly set: (sessionID: string, status: Info) => Effect.Effect<void>
}

export class SessionStatusService extends Context.Service<SessionStatusService, SessionStatusShape>()("@miniopencode/SessionStatus") {}

// ── Factory ──────────────────────────────────────────────────

export function makeSessionStatus(): Effect.Effect<SessionStatusShape, never, BusService | Scope.Scope> {
  return Effect.gen(function* () {
    const bus = yield* BusService

    const state = yield* InstanceState.make(() =>
      Effect.succeed(new Map<string, Info>()),
    )

    const get = (sessionID: string) =>
      Effect.gen(function* () {
        const data = yield* InstanceState.get(state)
        return data.get(sessionID) ?? { type: "idle" } as Info
      })

    const list = () =>
      Effect.gen(function* () {
        return new Map(yield* InstanceState.get(state))
      })

    const set = (sessionID: string, status: Info) =>
      Effect.gen(function* () {
        const data = yield* InstanceState.get(state)
        if (status.type === "idle") {
          data.delete(sessionID)
        } else {
          data.set(sessionID, status)
        }
        // Publish status change event via bus
        yield* bus.publish(SessionStatusChanged, {
          sessionId: sessionID,
          status: status.type,
          detail: ("message" in status ? (status as any).message : undefined),
        }).pipe(Effect.ignore)
      })

    return SessionStatusService.of({ get, list, set })
  })
}

export const SessionStatusLive = Layer.effect(SessionStatusService, makeSessionStatus())

export * as SessionStatus from "./status"
