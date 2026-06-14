/**
 * util/defer - 延迟执行与资源清理工具
 *
 * 功能概述：
 * - 创建可自动清理的延迟执行函数
 * - 同时支持同步 Disposable 和异步 AsyncDisposable 接口
 *
 * 核心导出：
 * - defer：将函数包装为 Disposable 对象，在作用域退出时自动执行
 *
 * 架构位置：通用工具层，无其他依赖
 */

export function defer(fn: () => void | Promise<void>): AsyncDisposable & Disposable {
  return {
    [Symbol.dispose]() {
      void fn()
    },
    [Symbol.asyncDispose]() {
      return Promise.resolve(fn())
    },
  }
}
