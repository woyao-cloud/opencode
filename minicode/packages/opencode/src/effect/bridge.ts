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
