/**
 * [control-plane/workspace-adapter-runtime] - 工作区适配器运行时
 * 功能概述：封装工作区适配器的 target、configure、create、remove、openRuntime 操作，桥接 Effect 与 Promise
 * 核心导出：target, configure, create, remove, openRuntime
 * 架构位置：runtime layer，依赖 adapters 和 types，被 workspace.ts 调用
 */

import { Effect } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { InstanceRef, WorkspaceRef } from "@/effect/instance-ref"
import { getAdapter } from "./adapters"
import type { WorkspaceAdapter, WorkspaceInfo } from "./types"

const context = Effect.gen(function* () {
  return {
    instance: yield* InstanceRef,
    workspaceID: yield* WorkspaceRef,
  }
})

export const target = (info: WorkspaceInfo) =>
  Effect.gen(function* () {
    const adapter = getAdapter(info.projectID, info.type)
    const ctx = yield* context
    return yield* EffectBridge.fromPromise(() => adapter.target(info, ctx))
  })

export const configure = (adapter: WorkspaceAdapter, info: WorkspaceInfo) =>
  Effect.gen(function* () {
    const ctx = yield* context
    return yield* EffectBridge.fromPromise(() => adapter.configure(info, ctx))
  })

export const create = (
  adapter: WorkspaceAdapter,
  info: WorkspaceInfo,
  env: Record<string, string | undefined>,
  from?: WorkspaceInfo,
) =>
  Effect.gen(function* () {
    const ctx = yield* context
    return yield* EffectBridge.fromPromise(() => adapter.create(info, env, from, ctx))
  })

export const list = (adapter: WorkspaceAdapter) =>
  Effect.gen(function* () {
    const ctx = yield* context
    return yield* EffectBridge.fromPromise(() => Promise.resolve(adapter.list?.(ctx) ?? []))
  })

export const remove = (info: WorkspaceInfo) =>
  Effect.gen(function* () {
    const adapter = getAdapter(info.projectID, info.type)
    const ctx = yield* context
    return yield* EffectBridge.fromPromise(() => adapter.remove(info, ctx))
  })

export * as WorkspaceAdapterRuntime from "./workspace-adapter-runtime"
