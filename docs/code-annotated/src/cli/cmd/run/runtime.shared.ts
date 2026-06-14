/**
 * cli/cmd/run/runtime.shared.ts - 运行时共享工具函数
 *
 * 功能概述：
 * - 提供 PendingTask 复用工具，避免重复创建异步任务
 * - 用于运行时中需要去重的异步操作场景
 *
 * 核心导出：
 * - reusePendingTask: 复用挂起异步任务
 * - PendingTask: 挂起任务类型
 *
 * 架构位置：CLI run 命令子模块的工具层，
 * 被运行时模块用于异步任务管理
 */
type PendingTask<T> = {
  current?: Promise<T>
}

export function reusePendingTask<T>(slot: PendingTask<T>, run: () => Promise<T>) {
  if (slot.current) {
    return slot.current
  }

  const task = run().finally(() => {
    if (slot.current === task) {
      slot.current = undefined
    }
  })
  slot.current = task
  return task
}
