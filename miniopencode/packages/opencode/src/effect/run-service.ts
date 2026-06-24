import { Effect, Fiber } from "effect"
import * as Context from "effect/Context"
import { InstanceRef, WorkspaceRef } from "./instance-ref"
import type { InstanceContext } from "./instance-ref"

type Refs = {
  instance?: InstanceContext
  workspace?: string
}

export function attachWith<A, E, R>(effect: Effect.Effect<A, E, R>, refs: Refs): Effect.Effect<A, E, R> {
  if (!refs.instance && !refs.workspace) return effect
  if (!refs.instance) return effect.pipe(Effect.provideService(WorkspaceRef, refs.workspace))
  if (!refs.workspace) return effect.pipe(Effect.provideService(InstanceRef, refs.instance))
  return effect.pipe(
    Effect.provideService(InstanceRef, refs.instance),
    Effect.provideService(WorkspaceRef, refs.workspace),
  )
}

export function attach<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
  const fiber = Fiber.getCurrent()
  const instance = fiber ? Context.getReferenceUnsafe(fiber.context, InstanceRef) : undefined
  const workspace = fiber ? Context.getReferenceUnsafe(fiber.context, WorkspaceRef) : undefined
  return attachWith(effect, { instance, workspace })
}

export * as RunService from "./run-service"
