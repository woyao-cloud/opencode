import { Effect, Exit, Layer, PubSub, Scope, Context, Stream, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import * as EffectBridge from "@/effect/bridge"
import * as InstanceState from "@/effect/instance-state"
import { makeRuntime } from "@/effect/run-service"
import { BusEvent } from "./bus-event"
const log = Log.create({ service: "bus" })
type BusProperties<D extends BusEvent.Definition<string, Schema.Top>> = Schema.Schema.Type<D["properties"]>
export const InstanceDisposed = BusEvent.define("server.instance.disposed", Schema.Struct({ directory: Schema.String }))
type Payload<D extends BusEvent.Definition = BusEvent.Definition> = { id: string; type: D["type"]; properties: BusProperties<D> }
type State = { wildcard: PubSub.PubSub<Payload>; typed: Map<string, PubSub.PubSub<Payload>> }
export interface Interface {
  readonly publish: <D extends BusEvent.Definition>(def: D, properties: BusProperties<D>, options?: { id?: string }) => Effect.Effect<void, unknown, unknown>
  readonly subscribe: <D extends BusEvent.Definition>(def: D) => Stream.Stream<Payload<D>, unknown, unknown>
  readonly subscribeAll: () => Stream.Stream<Payload, unknown, unknown>
  readonly subscribeCallback: <D extends BusEvent.Definition>(def: D, callback: (event: Payload<D>) => unknown) => Effect.Effect<() => void, unknown, unknown>
  readonly subscribeAllCallback: (callback: (event: any) => unknown) => Effect.Effect<() => void, unknown, unknown>
}
export class Service extends Context.Service<Service, Interface>()("@minicode/Bus") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* (InstanceState.make<State>(Effect.fn("Bus.state")(function* (ctx: any) {
    const wildcard = yield* PubSub.unbounded<Payload>()
    const typed = new Map<string, PubSub.PubSub<Payload>>()
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      yield* PubSub.publish(wildcard, { type: InstanceDisposed.type, id: createID(), properties: { directory: ctx.directory } })
      yield* PubSub.shutdown(wildcard)
      for (const ps of typed.values()) yield* PubSub.shutdown(ps)
    }))
    return { wildcard, typed }
  }) as any) as any)
  function getOrCreate<D extends BusEvent.Definition>(s: State, def: D) {
    return Effect.gen(function* () {
      let ps = s.typed.get(def.type)
      if (!ps) { ps = yield* PubSub.unbounded<Payload>(); s.typed.set(def.type, ps) }
      return ps as unknown as PubSub.PubSub<Payload<D>>
    })
  }
  function publish<D extends BusEvent.Definition>(def: D, properties: BusProperties<D>, options?: { id?: string }) {
    return Effect.gen(function* () {
      const s = (yield* InstanceState.get(state)) as State
      const payload: Payload = { id: options?.id ?? createID(), type: def.type, properties }
      log.info("publishing", { type: def.type })
      const ps = s.typed.get(def.type)
      if (ps) yield* PubSub.publish(ps, payload)
      yield* PubSub.publish(s.wildcard, payload)
    })
  }
  function subscribe<D extends BusEvent.Definition>(def: D): Stream.Stream<Payload<D>> {
    log.info("subscribing", { type: def.type })
    return Stream.unwrap(Effect.gen(function* () { const s = (yield* InstanceState.get(state)) as State; const ps = yield* getOrCreate(s, def); return Stream.fromPubSub(ps) })).pipe(Stream.ensuring(Effect.sync(() => log.info("unsubscribing", { type: def.type })))) as any
  }
  function subscribeAll(): Stream.Stream<Payload> {
    return Stream.unwrap(Effect.gen(function* () { const s = (yield* InstanceState.get(state)) as State; return Stream.fromPubSub(s.wildcard) })) as any
  }
  function on<T>(pubsub: PubSub.PubSub<T>, type: string, callback: (event: T) => unknown) {
    return Effect.gen(function* () {
      const bridge = yield* EffectBridge.make()
      const scope = yield* Scope.make()
      const subscription = yield* Scope.provide(scope)(PubSub.subscribe(pubsub))
      yield* Scope.provide(scope)(Stream.fromSubscription(subscription).pipe(Stream.runForEach((msg) => Effect.tryPromise({ try: () => Promise.resolve().then(() => callback(msg)), catch: (cause) => { log.error("subscriber failed", { type, cause }) } }).pipe(Effect.ignore)), Effect.forkScoped))
      return () => { log.info("unsubscribing", { type }); bridge.fork(Scope.close(scope, Exit.void)) }
    })
  }
  const subscribeCallback = Effect.fn("Bus.subscribeCallback")(function* <D extends BusEvent.Definition>(def: D, callback: (event: Payload<D>) => unknown) { const s = (yield* InstanceState.get(state)) as State; const ps = yield* getOrCreate(s, def); return yield* on(ps, def.type, callback) })
  const subscribeAllCallback = Effect.fn("Bus.subscribeAllCallback")(function* (callback: (event: any) => unknown) { const s = (yield* InstanceState.get(state)) as State; return yield* on(s.wildcard, "*", callback) })
  return Service.of({ publish, subscribe, subscribeAll, subscribeCallback, subscribeAllCallback } as any)
}))
export const defaultLayer = layer
const { runPromise, runSync } = makeRuntime(Service, layer as any) as any
export function createID() { return "evt_" + Math.random().toString(36).slice(2, 10) }
export async function publish<D extends BusEvent.Definition>(def: D, properties: BusProperties<D>, options?: { id?: string }) { return runPromise((svc: any) => svc.publish(def, properties, options)) }
export function subscribe<D extends BusEvent.Definition>(def: D, callback: (event: Payload<D>) => unknown) { return runSync((svc: any) => svc.subscribeCallback(def, callback)) }
export function subscribeAll(callback: (event: any) => unknown) { return runSync((svc: any) => svc.subscribeAllCallback(callback)) }
export * as Bus from "."
