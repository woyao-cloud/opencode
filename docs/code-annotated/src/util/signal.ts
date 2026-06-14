/**
 * util/signal - 信号通知工具
 *
 * 功能概述：
 * - 提供基于 Promise 的一次性信号机制，用于异步协调
 *
 * 核心导出：
 * - signal：创建信号对象，包含 trigger（触发）和 wait（等待）方法
 *
 * 架构位置：通用工具层，无其他依赖
 */

export function signal() {
  let resolve: any
  const promise = new Promise((r) => (resolve = r))
  return {
    trigger() {
      return resolve()
    },
    wait() {
      return promise
    },
  }
}
