// ── WebSocket Connection Tracker ─────────────────────────────────

import { Context, Effect, Layer } from "effect"

export namespace WebSocketTracker {
  export interface Interface {
    readonly closeAll: Effect.Effect<void>
  }

  export class Service extends Context.Service<Service, Interface>()("@miniopencode/WebSocketTracker") {}

  const make = Effect.gen(function* () {
    const closeFns = new Set<() => void>()

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const close of closeFns) close()
        closeFns.clear()
      }),
    )

    const closeAll = Effect.sync(() => {
      for (const close of closeFns) close()
      closeFns.clear()
    })

    return Service.of({ closeAll })
  })

  export const layer = Layer.effect(Service, Effect.scoped(make))
}
