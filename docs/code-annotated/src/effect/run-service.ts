/**
 * [effect/run-service] - 运行时服务管理模块
 *
 * 功能概述：
 * - 提供 Effect 运行时环境的创建和管理
 * - 支持在工作区上下文中附加和运行 Effect
 * - 提供便捷的 runSync、runPromise、runFork 等运行时方法
 *
 * 核心导出：
 * - attachWith()：在指定实例/工作区上下文中运行 Effect
 * - makeRuntime()：创建 ManagedRuntime 实例
 * - attach()：将运行时方法与服务绑定
 *
 * 架构位置：上游依赖 Effect、instance-ref、workspace-context；下游被 bootstrap-runtime.ts、bridge.ts 引用
 */
import { Effect, Fiber, Layer, ManagedRuntime } from "effect"
import * as Context from "effect/Context"
import { InstanceRef, WorkspaceRef } from "./instance-ref"
import * as Observability from "@opencode-ai/core/effect/observability"
import { WorkspaceContext } from "@/control-plane/workspace-context"
import type { InstanceContext } from "@/project/instance-context"
import { memoMap } from "@opencode-ai/core/effect/memo-map"

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
  const workspace = WorkspaceContext.workspaceID
  const fiber = Fiber.getCurrent()
  return attachWith(effect, {
    instance: fiber ? Context.getReferenceUnsafe(fiber.context, InstanceRef) : undefined,
    workspace: workspace ?? (fiber ? Context.getReferenceUnsafe(fiber.context, WorkspaceRef) : undefined),
  })
}

export function makeRuntime<I, S, E>(service: Context.Service<I, S>, layer: Layer.Layer<I, E>) {
  let rt: ManagedRuntime.ManagedRuntime<I, E> | undefined
  const getRuntime = () => (rt ??= ManagedRuntime.make(Layer.provideMerge(layer, Observability.layer), { memoMap }))

  return {
    runSync: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>) => getRuntime().runSync(attach(service.use(fn))),
    runPromiseExit: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>, options?: Effect.RunOptions) =>
      getRuntime().runPromiseExit(attach(service.use(fn)), options),
    runPromise: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>, options?: Effect.RunOptions) =>
      getRuntime().runPromise(attach(service.use(fn)), options),
    runFork: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>) => getRuntime().runFork(attach(service.use(fn))),
    runCallback: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>) =>
      getRuntime().runCallback(attach(service.use(fn))),
  }
}
