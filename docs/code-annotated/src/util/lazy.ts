/**
 * util/lazy - 惰性求值工具
 *
 * 功能概述：
 * - 实现延迟初始化，值在首次访问时计算并缓存
 * - 支持重置和状态查询
 *
 * 核心导出：
 * - lazy：创建惰性求值函数，附带 reset 和 loaded 方法
 *
 * 架构位置：通用工具层，无其他依赖
 */

export function lazy<T>(fn: () => T) {
  let value: T | undefined
  let loaded = false

  const result = (): T => {
    if (loaded) return value as T
    value = fn()
    loaded = true
    return value as T
  }

  result.reset = () => {
    loaded = false
    value = undefined
  }

  result.loaded = () => loaded

  return result
}
