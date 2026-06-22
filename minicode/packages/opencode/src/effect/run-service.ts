import { Effect, Fiber, Layer, ManagedRuntime } from "effect"
import * as Context from "effect/Context"
import { InstanceRef, WorkspaceRef, type InstanceContext } from "./instance-ref"
type Refs = { instance?: InstanceContext; workspace?: string }
export function attachWith<A, E, R>(effect: Effect.Effect<A, E, R>, refs: Refs): Effect.Effect<A, E, R> {
  if (!refs.instance && !refs.workspace) return effect
  if (!refs.instance) return effect.pipe(Effect.provideService(WorkspaceRef, refs.workspace))
  if (!refs.workspace) return effect.pipe(Effect.provideService(InstanceRef, refs.instance))
  return effect.pipe(Effect.provideService(InstanceRef, refs.instance), Effect.provideService(WorkspaceRef, refs.workspace))
}
export function attach<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
  const fiber = Fiber.getCurrent()
  const instance = (fiber ? Context.getReferenceUnsafe(fiber.context, InstanceRef as any) : undefined) as InstanceContext | undefined
  const workspace = (fiber ? Context.getReferenceUnsafe(fiber.context, WorkspaceRef as any) : undefined) as string | undefined
  return attachWith(effect, { instance, workspace })
}
export function makeRuntime<I, S, E>(service: Context.Service<I, S>, layer: Layer.Layer<I, E>) {
  let rt: ManagedRuntime.ManagedRuntime<I, E> | undefined
  const getRuntime = () => (rt ??= ManagedRuntime.make(layer))
  return {
    runSync: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>) => getRuntime().runSync(attach(service.use(fn))),
    runPromiseExit: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>, options?: Effect.RunOptions) => getRuntime().runPromiseExit(attach(service.use(fn)), options),
    runPromise: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>, options?: Effect.RunOptions) => getRuntime().runPromise(attach(service.use(fn)), options),
    runFork: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>) => getRuntime().runFork(attach(service.use(fn))),
    runCallback: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>) => getRuntime().runCallback(attach(service.use(fn))),
  }
}
