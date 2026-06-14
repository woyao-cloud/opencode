/**
 * acp/runtime - ACP 运行时入口模块
 *
 * 功能概述：
 * - 提供 ACP 协议的 Effect 运行时入口（全局和目录级别）
 * - runGlobal：无需项目 InstanceRef 的全局 ACP Effect 运行入口
 * - runDirectory：需要加载项目实例的目录级 ACP Effect 运行入口
 * - defaultAgentInfo：获取默认 Agent 信息的便捷函数
 *
 * 核心导出：
 * - runGlobal：全局 ACP Effect 运行器
 * - runDirectory：目录级 ACP Effect 运行器
 * - defaultAgentInfo：默认 Agent 信息获取函数
 *
 * 架构位置：ACP 协议实现的运行时层，依赖 Agent、AppRuntime、InstanceRuntime 模块
 */

import { Agent } from "@/agent/agent"
import { AppRuntime, type AppServices } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceRuntime } from "@/project/instance-runtime"
import { Effect } from "effect"

// Global ACP Effect re-entry: no project InstanceRef is provided.
// 全局 ACP Effect 入口：无需项目 InstanceRef
export const runGlobal = AppRuntime.runPromise

// Directory-scoped ACP Effect re-entry: load the project instance and provide InstanceRef.
// 目录级 ACP Effect 入口：加载项目实例并提供 InstanceRef
export async function runDirectory<A, E>(input: { directory: string; effect: Effect.Effect<A, E, AppServices> }) {
  const ctx = await InstanceRuntime.load({ directory: input.directory })
  return AppRuntime.runPromise(input.effect.pipe(Effect.provideService(InstanceRef, ctx)))
}

export const defaultAgentInfo = (directory: string) =>
  runDirectory({
    directory,
    effect: Agent.Service.use((svc) => svc.defaultInfo()),
  })

export * as ACPRuntime from "./runtime"
