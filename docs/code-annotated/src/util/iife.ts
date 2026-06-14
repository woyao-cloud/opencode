/**
 * util/iife - 立即执行函数工具
 *
 * 功能概述：
 * - 提供立即执行函数（IIFE）的便捷包装
 *
 * 核心导出：
 * - iife：立即执行并返回函数结果
 *
 * 架构位置：通用工具层，无其他依赖
 */

export function iife<T>(fn: () => T) {
  return fn()
}
