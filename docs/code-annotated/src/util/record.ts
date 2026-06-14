/**
 * util/record - 类型守卫工具
 *
 * 功能概述：
 * - 提供运行时类型判断，检测值是否为普通对象（Record）
 *
 * 核心导出：
 * - isRecord：判断值是否为非数组的对象类型
 *
 * 架构位置：通用工具层，无其他依赖
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
