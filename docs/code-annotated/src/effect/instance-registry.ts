/**
 * [effect/instance-registry] - 实例清理注册表
 *
 * 功能概述：
 * - 提供实例销毁时的清理函数注册和触发机制
 *
 * 核心导出：
 * - registerDisposer()：注册实例清理函数
 * - disposeInstance()：触发指定目录的所有清理函数
 *
 * 架构位置：上游被 instance-state.ts 等模块注册清理逻辑
 */
const disposers = new Set<(directory: string) => Promise<void>>()

export function registerDisposer(disposer: (directory: string) => Promise<void>) {
  disposers.add(disposer)
  return () => {
    disposers.delete(disposer)
  }
}

export async function disposeInstance(directory: string) {
  await Promise.allSettled([...disposers].map((disposer) => disposer(directory)))
}
