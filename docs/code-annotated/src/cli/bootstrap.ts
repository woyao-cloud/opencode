/**
 * cli/bootstrap - 项目实例引导工具
 *
 * 功能概述：
 * - 提供 bootstrap() 函数，在项目实例上下文中执行回调
 * - 自动加载 InstanceRuntime、提供 context，完成后释放实例
 *
 * 核心导出：
 * - bootstrap<T>(directory, cb): 在实例上下文中执行异步回调
 *
 * 架构位置：CLI 层引导工具，被各类命令 handler 调用，依赖 project/instance-runtime 和 project/instance-context
 */

import { InstanceRuntime } from "../project/instance-runtime"
import { context } from "../project/instance-context"

export async function bootstrap<T>(directory: string, cb: () => Promise<T>) {
  const ctx = await InstanceRuntime.load({ directory })
  try {
    return await context.provide(ctx, cb)
  } finally {
    await InstanceRuntime.disposeInstance(ctx)
  }
}
