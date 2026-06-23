import { Effect, ScopedCache, Scope } from "effect"
import { InstanceRef, type InstanceContext } from "./instance-ref"

const TypeId = "~miniopencode/InstanceState"

export interface InstanceState<A, E = never, R = never> {
  readonly [TypeId]: typeof TypeId
  readonly cache: ScopedCache.ScopedCache<string, A, E, R>
}

export const context = Effect.gen(function* () { return yield* InstanceRef })
export const directory = Effect.map(context, (ctx: any) => ctx.directory)

export function make<A, E = never, R = never>(
  init: (ctx: InstanceContext) => Effect.Effect<A, E, R | Scope.Scope>
): Effect.Effect<InstanceState<A, E, R>, never, R | Scope.Scope | InstanceRef> {
  return Effect.gen(function* () {
    const cache = yield* (ScopedCache.make as any)({
      capacity: Number.POSITIVE_INFINITY,
      lookup: () => Effect.gen(function* () { return yield* init(yield* context) })
    })
    return { [TypeId]: TypeId, cache }
  }) as any
}

export const get = <A, E, R>(self: InstanceState<A, E, R>): Effect.Effect<A, E, R | InstanceRef> =>
  Effect.gen(function* () { return yield* ScopedCache.get(self.cache, yield* directory) }) as any

export const use = <A, E, R, B>(self: InstanceState<A, E, R>, select: (v: A) => B): Effect.Effect<B, E, R | InstanceRef> =>
  Effect.map(get(self), select) as any

export const useEffect = <A, E, R, B, E2, R2>(
  self: InstanceState<A, E, R>, select: (v: A) => Effect.Effect<B, E2, R2>
): Effect.Effect<B, E | E2, R | R2 | InstanceRef> =>
  Effect.flatMap(get(self), select) as any

export * as InstanceState from "./instance-state"
