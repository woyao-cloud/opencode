/**
 * util/effect-http-client - Effect HTTP 客户端重试工具
 *
 * 功能概述：
 * - 为 Effect HTTP 客户端添加瞬态错误重试能力
 * - 使用指数退避 + 抖动策略
 *
 * 核心导出：
 * - withTransientReadRetry：为 HTTP 客户端添加最多 2 次重试
 *
 * 架构位置：通用工具层，依赖 effect 框架的 Schedule 和 HttpClient
 */

import { Schedule } from "effect"
import { HttpClient } from "effect/unstable/http"

export const withTransientReadRetry = <E, R>(client: HttpClient.HttpClient.With<E, R>) =>
  client.pipe(
    HttpClient.retryTransient({
      retryOn: "errors-and-responses",
      times: 2,
      schedule: Schedule.exponential(200).pipe(Schedule.jittered),
    }),
  )
