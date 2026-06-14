/**
 * util/timeout - 超时控制工具
 *
 * 功能概述：
 * - 为 Promise 添加超时限制，超时时自动拒绝
 *
 * 核心导出：
 * - withTimeout：包装 Promise，在指定毫秒后超时失败
 *
 * 架构位置：通用工具层，无其他依赖
 */

export function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  let timeout: NodeJS.Timeout
  return Promise.race([
    promise.finally(() => {
      clearTimeout(timeout)
    }),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(label ?? `Operation timed out after ${ms}ms`))
      }, ms)
    }),
  ])
}
