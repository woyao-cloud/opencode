/**
 * session/retry.ts — Session 重试
 *
 * 支持对失败的 LLM 调用进行重试，带指数退避
 */

import { Effect, Schedule } from "effect"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "session.retry" })

export interface RetryPolicy {
  readonly maxRetries: number
  readonly baseDelay: number
  readonly maxDelay: number
}

export const defaultPolicy: RetryPolicy = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
}

/**
 * 使用指数退避重试一个 Effect
 */
export const withRetry = <A, E>(
  effect: Effect.Effect<A, E>,
  policy: RetryPolicy = defaultPolicy,
): Effect.Effect<A, E> =>
  effect.pipe(
    Effect.retry({
      times: policy.maxRetries,
      schedule: Schedule.exponential(policy.baseDelay, 2).pipe(
        Schedule.intersect(Schedule.spaced(policy.maxDelay)),
      ),
    }),
    Effect.tapError((err) =>
      Effect.sync(() => log.warn("retry exhausted", { error: String(err) }))
    ),
  )
