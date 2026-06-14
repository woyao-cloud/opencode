/**
 * [control-plane/util] - 控制面工具函数
 * 功能概述：提供等待全局事件的工具函数 waitEvent（支持超时和 AbortSignal）
 * 核心导出：waitEvent
 * 架构位置：utility layer，被 workspace.ts 依赖
 */

import { GlobalBus, type GlobalEvent } from "@/bus/global"
import { Effect } from "effect"

export function waitEvent(input: { timeout: number; signal?: AbortSignal; fn: (event: GlobalEvent) => boolean }) {
  if (input.signal?.aborted) return Effect.fail(input.signal.reason ?? new Error("Request aborted"))

  return Effect.callback<void, unknown>((resume) => {
    const abort = () => {
      cleanup()
      resume(Effect.fail(input.signal?.reason ?? new Error("Request aborted")))
    }

    const handler = (event: GlobalEvent) => {
      try {
        if (!input.fn(event)) return
        cleanup()
        resume(Effect.void)
      } catch (error) {
        cleanup()
        resume(Effect.fail(error))
      }
    }

    const cleanup = () => {
      clearTimeout(timeout)
      GlobalBus.off("event", handler)
      input.signal?.removeEventListener("abort", abort)
    }

    const timeout = setTimeout(() => {
      cleanup()
      resume(Effect.fail(new Error("Timed out waiting for global event")))
    }, input.timeout)

    GlobalBus.on("event", handler)
    input.signal?.addEventListener("abort", abort, { once: true })
    return Effect.sync(cleanup)
  })
}
