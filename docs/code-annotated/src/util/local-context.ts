/**
 * util/local-context - 异步本地上下文工具
 *
 * 功能概述：
 * - 基于 AsyncLocalStorage 提供类型安全的异步上下文管理
 * - 支持创建、读取和提供上下文值
 *
 * 核心导出：
 * - create：创建命名上下文，返回 use（读取）和 provide（设置）方法
 * - NotFound：上下文未找到时的自定义错误
 *
 * 架构位置：通用工具层，依赖 Node.js async_hooks 模块
 */

import { AsyncLocalStorage } from "async_hooks"

export class NotFound extends Error {
  constructor(public override readonly name: string) {
    super(`No context found for ${name}`)
  }
}

export function create<T>(name: string) {
  const storage = new AsyncLocalStorage<T>()
  return {
    use() {
      const result = storage.getStore()
      if (!result) {
        throw new NotFound(name)
      }
      return result
    },
    provide<R>(value: T, fn: () => R) {
      return storage.run(value, fn)
    },
  }
}

export * as LocalContext from "./local-context"
