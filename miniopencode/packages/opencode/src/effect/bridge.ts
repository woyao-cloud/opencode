import { Context, Effect, Exit, Fiber } from "effect"
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
    const instance = (yield* InstanceRef) as any
    const workspace = (yield* WorkspaceRef) as any
    const wrap = <A, E, R>(effect: Effect.Effect<A, E, R>): any =>
      attachWith(effect.pipe(Effect.provide(ctx)) as any, { instance, workspace }) as any
    return {
      promise: <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> => Effect.runPromise(wrap(effect)) as any,
      fork: <A, E, R>(effect: Effect.Effect<A, E, R>): Fiber.Fiber<A, E> => Effect.runFork(wrap(effect)) as any,
      run: <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E> =>
        Effect.tryPromise(() => Effect.runPromise(wrap(effect))) as any,
    } as Shape
  }) as any
}

export * as EffectBridge from "./bridge"
