/**
 * project/bootstrap-service - 实例引导服务接口：定义项目实例初始化入口
 *
 * 功能概述：
 * - 定义 InstanceBootstrap 服务接口
 * - 提供 run 方法执行引导流程
 *
 * 核心导出：
 * - Service：引导服务 Context 类
 *
 * 架构位置：Project 模块服务接口层，被 project/bootstrap.ts 实现。
 */
import { Context, Effect } from "effect"

export interface Interface {
  readonly run: Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/InstanceBootstrap") {}

export * as InstanceBootstrap from "./bootstrap-service"
