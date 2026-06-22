import { Effect, ScopedCache, Scope } from "effect"
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
