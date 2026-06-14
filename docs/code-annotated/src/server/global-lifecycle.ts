/**
 * server/global-lifecycle - 全局生命周期管理
 *
 * 功能概述：
 * - 管理服务端全局生命周期事件与实例存储
 *
 * 核心导出：
 * - （默认导出模块函数）
 *
 * 架构位置：依赖 GlobalBus 和 InstanceStore，引用 event 模块
 */

import { GlobalBus } from "@/bus/global"
import { InstanceStore } from "@/project/instance-store"
import * as Log from "@opencode-ai/core/util/log"
import { Effect } from "effect"
import { Event } from "./event"

const log = Log.create({ service: "server" })

export const emitGlobalDisposed = Effect.sync(() =>
  GlobalBus.emit("event", {
    directory: "global",
    payload: {
      type: Event.Disposed.type,
      properties: {},
    },
  }),
)

export const disposeAllInstancesAndEmitGlobalDisposed = Effect.fn("Server.disposeAllInstancesAndEmitGlobalDisposed")(
  function* (options?: { swallowErrors?: boolean }) {
    const store = yield* InstanceStore.Service
    yield* Effect.gen(function* () {
      yield* options?.swallowErrors
        ? store.disposeAll().pipe(
            Effect.catchCause((cause) =>
              Effect.sync(() => {
                log.warn("global disposal failed", { cause })
              }),
            ),
          )
        : store.disposeAll()
      yield* emitGlobalDisposed
    }).pipe(Effect.uninterruptible)
  },
)

export * as GlobalLifecycle from "./global-lifecycle"
