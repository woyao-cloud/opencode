// ── SessionRunState Service — Prevent concurrent runs on a session ──
// Lightweight in-memory busy-tracker per session. Uses SynchronizedRef
// for thread-safe access and SessionStatus for event publishing.
// The actual work execution happens in PromptService — this service
// just ensures no two runs overlap on the same session.

import { Context, Effect, Layer, SynchronizedRef } from "effect"
import { SessionStatusService } from "./status"

// ── Busy Error (tagged class for Effect.fail) ─────────────────

export class SessionBusyError {
  readonly _tag = "SessionBusyError"
  constructor(readonly sessionID: string) {}
}

// ── Service Interface ────────────────────────────────────────

export interface SessionRunStateShape {
  /** Fail with SessionBusyError if the session is already running. */
  readonly assertNotBusy: (sessionID: string) => Effect.Effect<void, SessionBusyError>
  /** Mark a session as busy. Returns a cleanup handle to call when done. */
  readonly acquire: (sessionID: string) => Effect.Effect<Effect.Effect<void>, SessionBusyError>
  /** Release a session's busy flag. */
  readonly release: (sessionID: string) => Effect.Effect<void>
  /** Check if a session is currently busy. */
  readonly isBusy: (sessionID: string) => Effect.Effect<boolean>
}

export class SessionRunStateService extends Context.Service<SessionRunStateService, SessionRunStateShape>()("@miniopencode/SessionRunState") {}

// ── Factory (no Scope required — uses SynchronizedRef) ───────

export function makeSessionRunState(): Effect.Effect<SessionRunStateShape, never, SessionStatusService> {
  return Effect.gen(function* () {
    const status = yield* SessionStatusService
    const busyMap = yield* SynchronizedRef.make(new Map<string, true>())

    const isBusy = (sessionID: string) =>
      Effect.gen(function* () {
        const map = yield* SynchronizedRef.get(busyMap)
        return map.has(sessionID)
      })

    const assertNotBusy = (sessionID: string) =>
      Effect.gen(function* () {
        const busy = yield* isBusy(sessionID)
        if (busy) return yield* Effect.fail(new SessionBusyError(sessionID))
      })

    const acquire = (sessionID: string) =>
      Effect.gen(function* () {
        const busy = yield* isBusy(sessionID)
        if (busy) return yield* Effect.fail(new SessionBusyError(sessionID))

        yield* SynchronizedRef.update(busyMap, (map) => { map.set(sessionID, true); return map })
        yield* status.set(sessionID, { type: "busy" })

        // Return a cleanup effect that the caller must run when work is done
        const cleanup = Effect.gen(function* () {
          yield* SynchronizedRef.update(busyMap, (map) => { map.delete(sessionID); return map })
          yield* status.set(sessionID, { type: "idle" })
        })

        return cleanup
      })

    const release = (sessionID: string) =>
      Effect.gen(function* () {
        yield* SynchronizedRef.update(busyMap, (map) => { map.delete(sessionID); return map })
        yield* status.set(sessionID, { type: "idle" })
      })

    return SessionRunStateService.of({ assertNotBusy, acquire, release, isBusy })
  })
}

export const SessionRunStateLive = Layer.effect(SessionRunStateService, makeSessionRunState())

export * as SessionRunState from "./run-state"
