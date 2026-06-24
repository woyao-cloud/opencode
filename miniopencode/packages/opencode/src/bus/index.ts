import { Effect, Context, Layer, PubSub, Stream, Schema, Scope } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { BusEvent } from "./bus-event"

const log = Log.create({ service: "bus" })

// ── Types ───────────────────────────────────────────────────

type BusProperties<D extends BusEvent.Definition<string, Schema.Top>> = Schema.Schema.Type<D["properties"]>

export interface BusPayload<D extends BusEvent.Definition = BusEvent.Definition> {
  id: string
  type: D["type"]
  properties: BusProperties<D>
}

// ── Service Interface ───────────────────────────────────────

export interface BusShape {
  readonly publish: <D extends BusEvent.Definition>(
    def: D,
    properties: BusProperties<D>,
    options?: { id?: string },
  ) => Effect.Effect<void>
  readonly subscribe: <D extends BusEvent.Definition>(def: D) => Stream.Stream<BusPayload<D>>
  readonly subscribeAll: () => Stream.Stream<BusPayload>
}

export class BusService extends Context.Service<BusService, BusShape>()("@miniopencode/Bus") {}

// ── Factory (scoped — PubSub requires Scope) ────────────────

export function makeBus(): Effect.Effect<BusShape, never, Scope.Scope> {
  return Effect.gen(function* () {
    const wildcard = yield* PubSub.unbounded<BusPayload>()
    const typed = new Map<string, PubSub.PubSub<BusPayload>>()

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* PubSub.shutdown(wildcard)
        for (const ps of typed.values()) yield* PubSub.shutdown(ps)
      }),
    )

    const getOrCreate = <D extends BusEvent.Definition>(def: D) =>
      Effect.gen(function* () {
        let ps = typed.get(def.type)
        if (!ps) {
          ps = yield* PubSub.unbounded<BusPayload>()
          typed.set(def.type, ps)
        }
        return ps as unknown as PubSub.PubSub<BusPayload<D>>
      })

    const publish = <D extends BusEvent.Definition>(
      def: D,
      properties: BusProperties<D>,
      options?: { id?: string },
    ) =>
      Effect.gen(function* () {
        const payload: BusPayload = {
          id: options?.id ?? createID(),
          type: def.type,
          properties,
        }
        log.debug("publish", { type: def.type })
        const ps = typed.get(def.type)
        if (ps) yield* PubSub.publish(ps, payload as unknown as BusPayload<D>)
        yield* PubSub.publish(wildcard, payload)
      })

    const subscribe = <D extends BusEvent.Definition>(
      def: D,
    ): Stream.Stream<BusPayload<D>> =>
      Stream.unwrap(
        getOrCreate(def).pipe(Effect.map((ps) => Stream.fromPubSub(ps))),
      )

    const subscribeAll = (): Stream.Stream<BusPayload> => Stream.fromPubSub(wildcard)

    return BusService.of({ publish, subscribe, subscribeAll })
  })
}

export const BusLive = Layer.effect(BusService, Effect.scoped(makeBus()))

// ── Helpers ────────────────────────────────────────────────

function createID(): string {
  return "evt_" + Math.random().toString(36).slice(2, 10)
}

export * as Bus from "."
