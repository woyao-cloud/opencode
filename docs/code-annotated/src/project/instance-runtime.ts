/**
 * project/instance-runtime - 实例运行时桥接：在非 Effect 上下文中执行实例操作
 *
 * 功能概述：
 * - 提供 load、disposeInstance、disposeAllInstances、reloadInstance 等桥接函数
 * - 使用 AppRuntime 运行 Effect 代码
 *
 * 核心导出：
 * - load：加载项目实例
 * - disposeInstance：销毁指定实例
 * - disposeAllInstances：销毁所有实例
 * - reloadInstance：重新加载实例
 *
 * 架构位置：Project 模块桥接层，用于从 Promise/ALS 代码调用 Effect 服务。
 * 上游依赖：effect/app-runtime（运行时）、project/instance-store（存储服务）
 */
import { AppRuntime } from "@/effect/app-runtime"
import { type InstanceContext } from "./instance-context"
import { InstanceStore, type LoadInput } from "./instance-store"

// Bridge for Promise/ALS callers that cannot yet yield InstanceStore.Service.
// Delete this module once those callers are migrated to Effect boundaries that
// provide InstanceStore directly.

export const load = (input: LoadInput) => AppRuntime.runPromise(InstanceStore.Service.use((store) => store.load(input)))
export const disposeInstance = (ctx: InstanceContext) =>
  AppRuntime.runPromise(InstanceStore.Service.use((store) => store.dispose(ctx)))
export const disposeAllInstances = () => AppRuntime.runPromise(InstanceStore.Service.use((store) => store.disposeAll()))
export const reloadInstance = (input: LoadInput) =>
  AppRuntime.runPromise(InstanceStore.Service.use((store) => store.reload(input)))

export * as InstanceRuntime from "./instance-runtime"
