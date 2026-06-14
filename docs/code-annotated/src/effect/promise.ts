/**
 * [effect/promise] - Promise 到 Effect 的转换工具
 *
 * 功能概述：
 * - 提供将 Promise 转换为 Effect 的辅助函数
 * - 支持对拒绝原因进行精细化类型映射
 *
 * 核心导出：
 * - refineRejection()：将 Promise 拒绝映射为 Effect 错误
 *
 * 架构位置：上游依赖 Effect；作为工具函数被各模块引用
 */
import { Cause, Effect } from "effect"

export function refineRejection<A, E>(
  evaluate: (signal: AbortSignal) => PromiseLike<A>,
  refine: (cause: unknown) => E | undefined,
) {
  return Effect.tryPromise(evaluate).pipe(
    Effect.catch((error) => {
      const cause = Cause.isUnknownError(error) ? error.cause : error
      const refined = refine(cause)
      if (refined !== undefined) return Effect.fail(refined)
      return Effect.die(cause)
    }),
  )
}

export * as EffectPromise from "./promise"
