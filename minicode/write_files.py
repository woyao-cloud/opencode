import os

base = r"D:\claude-code-project\opencode.ai\opencode\minicode\packages\opencode\src"

files = {}

files["env/index.ts"] = '''export const Env = {
  get MINICODE_HOME() { return process.env.MINICODE_HOME },
  get OPENAI_API_KEY() { return process.env.OPENAI_API_KEY },
  get MINICODE_LOG_LEVEL() { return process.env.MINICODE_LOG_LEVEL as "DEBUG" | "INFO" | "WARN" | "ERROR" | undefined },
  get MINICODE_LOG_PRINT() { return process.env.MINICODE_LOG_PRINT === "1" },
}
export * as Env from "./index"
'''

files["effect/instance-ref.ts"] = '''import { Context } from "effect"
export interface InstanceContext { readonly directory: string; readonly worktree: string }
export class InstanceRef extends Context.Service<InstanceRef, InstanceContext>()("@minicode/InstanceRef") {}
export class WorkspaceRef extends Context.Service<WorkspaceRef, string | undefined>()("@minicode/WorkspaceRef") {}
'''

files["effect/instance-state.ts"] = '''import { Effect, ScopedCache, Scope } from "effect"
import { InstanceRef, type InstanceContext } from "./instance-ref"
const TypeId = "~minicode/InstanceState"
export interface InstanceState<A, E = never, R = never> { readonly [TypeId]: typeof TypeId; readonly cache: ScopedCache.ScopedCache<string, A, E, R> }
export const context = Effect.gen(function* () { return yield* InstanceRef })
export const directory = Effect.map(context, (ctx) => ctx.directory)
export function make<A, E = never, R = never>(init: (ctx: InstanceContext) => Effect.Effect<A, E, R | Scope.Scope>): Effect.Effect<InstanceState<A, E, R>, never, R | Scope.Scope> {
  return Effect.gen(function* () {
    const cache = yield* ScopedCache.make<string, A, E, R>({ capacity: Number.POSITIVE_INFINITY, lookup: () => Effect.gen(function* () { return yield* init(yield* context) }) })
    return { [TypeId]: TypeId, cache }
  })
}
export const get = <A, E, R>(self: InstanceState<A, E, R>) => Effect.gen(function* () { return yield* ScopedCache.get(self.cache, yield* directory) })
export const use = <A, E, R, B>(self: InstanceState<A, E, R>, select: (v: A) => B) => Effect.map(get(self), select)
export const useEffect = <A, E, R, B, E2, R2>(self: InstanceState<A, E, R>, select: (v: A) => Effect.Effect<B, E2, R2>) => Effect.flatMap(get(self), select)
export const has = <A, E, R>(self: InstanceState<A, E, R>) => Effect.gen(function* () { return yield* ScopedCache.has(self.cache, yield* directory) })
export const invalidate = <A, E, R>(self: InstanceState<A, E, R>) => Effect.gen(function* () { return yield* ScopedCache.invalidate(self.cache, yield* directory) })
'''

files["effect/run-service.ts"] = '''import { Effect, Fiber, Layer, ManagedRuntime } from "effect"
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
  const instance = fiber ? Context.getReferenceUnsafe(fiber.context, InstanceRef) : undefined
  const workspace = fiber ? Context.getReferenceUnsafe(fiber.context, WorkspaceRef) : undefined
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
'''

files["effect/bridge.ts"] = '''import { Context, Effect, Exit, Fiber } from "effect"
import { InstanceRef, WorkspaceRef } from "./instance-ref"
import { attachWith } from "./run-service"
export interface Shape {
  readonly promise: <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>
  readonly fork: <A, E, R>(effect: Effect.Effect<A, E, R>) => Fiber.Fiber<A, E>
  readonly run: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>
}
export function make(): Effect.Effect<Shape, unknown, unknown> {
  return Effect.gen(function* () {
    const ctx = yield* Effect.context()
    const fiber = Fiber.getCurrent()
    const instance = (yield* InstanceRef) ?? (fiber ? Context.getReferenceUnsafe(fiber.context, InstanceRef) : undefined)
    const workspace = (yield* WorkspaceRef) ?? (fiber ? Context.getReferenceUnsafe(fiber.context, WorkspaceRef) : undefined)
    const wrap = <A, E, R>(effect: Effect.Effect<A, E, R>) => attachWith(effect.pipe(Effect.provide(ctx)) as any, { instance: instance as any, workspace: workspace as any })
    return {
      promise: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.runPromise(wrap(effect)),
      fork: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.runFork(wrap(effect)),
      run: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.callback<A, E>((resume) => { Effect.runPromiseExit(wrap(effect)).then((exit) => resume(Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause))) }),
    } satisfies Shape
  })
}
'''

files["effect/index.ts"] = '''export * as InstanceState from "./instance-state"
export { InstanceRef, WorkspaceRef, type InstanceContext } from "./instance-ref"
export * as RunService from "./run-service"
export * as EffectBridge from "./bridge"
'''

for name, content in files.items():
    path = os.path.join(base, name.replace("/", os.sep))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Wrote: {name}")