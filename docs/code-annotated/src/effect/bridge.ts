/**
 * [effect/bridge] - Effect 运行时桥接模块
 *
 * 功能概述：
 * - 提供 Effect 运行时与外部代码之间的桥接接口
 * - 支持 promise、fork、run、bind 等运行时操作
 * - 自动恢复工作区上下文（workspace context）
 *
 * 核心导出：
 * - Shape：桥接接口类型定义
 * - make()：创建桥接实例
 *
 * 架构位置：上游依赖 Effect、workspace-context、instance-ref；下游被 bus/index.ts 引用
 */
import { Context, Effect, Exit, Fiber } from "effect"
import { WorkspaceContext } from "@/control-plane/workspace-context"
import type { WorkspaceID } from "@/control-plane/schema"
import { InstanceRef, WorkspaceRef } from "./instance-ref"
import { attachWith } from "./run-service"

export interface Shape {
  readonly promise: <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>
  readonly fork: <A, E, R>(effect: Effect.Effect<A, E, R>) => Fiber.Fiber<A, E>
  readonly run: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>
  readonly bind: <Args extends readonly unknown[], Result>(fn: (...args: Args) => Result) => (...args: Args) => Result
}

function restoreWorkspace<R>(workspace: WorkspaceID | undefined, fn: () => R): R {
  if (workspace !== undefined) return WorkspaceContext.restore(workspace, fn)
  return fn()
}

function captureSync() {
  const fiber = Fiber.getCurrent()
  const instance = fiber ? Context.getReferenceUnsafe(fiber.context, InstanceRef) : undefined
  const workspace =
    (fiber ? Context.getReferenceUnsafe(fiber.context, WorkspaceRef) : undefined) ?? WorkspaceContext.workspaceID
  return { instance, workspace }
}

export const bind = <Args extends readonly unknown[], Result>(fn: (...args: Args) => Result) => {
  const captured = captureSync()
  return (...args: Args) =>
    restoreWorkspace(captured.workspace, () =>
      Effect.runSync(
        attachWith(
          Effect.sync(() => fn(...args)),
          captured,
        ),
      ),
    )
}

/**
 * Bridge from Effect into a Promise-returning JS callback while preserving
 * `WorkspaceContext` AsyncLocalStorage for callback code that still reads it.
 * `InstanceRef` is captured for effects run through the returned bridge APIs;
 * plain JS callbacks that need it should receive the ref explicitly.
 *
 * Mirrors `Effect.promise` but restores workspace ALS first.
 */
export const fromPromise = <T>(fn: () => Promise<T> | T): Effect.Effect<T> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRef
    return yield* Effect.promise(() => Promise.resolve(restoreWorkspace(workspace, () => fn())))
  })

export function make(): Effect.Effect<Shape> {
  return Effect.gen(function* () {
    const ctx = yield* Effect.context()
    const captured = captureSync()
    const instance = (yield* InstanceRef) ?? captured.instance
    const workspace = (yield* WorkspaceRef) ?? captured.workspace
    const wrap = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      attachWith(effect.pipe(Effect.provide(ctx)) as Effect.Effect<A, E, never>, { instance, workspace })

    return {
      promise: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        restoreWorkspace(workspace, () => Effect.runPromise(wrap(effect))),
      fork: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        restoreWorkspace(workspace, () => Effect.runFork(wrap(effect))),
      run: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.callback<A, E>((resume) => {
          restoreWorkspace(workspace, () =>
            Effect.runPromiseExit(wrap(effect)).then((exit) =>
              resume(Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause)),
            ),
          )
        }),
      bind:
        <Args extends readonly unknown[], Result>(fn: (...args: Args) => Result) =>
        (...args: Args) =>
          restoreWorkspace(workspace, () => Effect.runSync(wrap(Effect.sync(() => fn(...args))))),
    } satisfies Shape
  })
}

export * as EffectBridge from "./bridge"
