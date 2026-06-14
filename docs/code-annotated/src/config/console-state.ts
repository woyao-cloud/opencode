/**
 * [config/console-state] - 控制台状态 Schema 定义
 *
 * 功能概述：
 * - 定义控制台的运行时状态类型（控制台托管的提供商列表、活跃组织信息）
 * - 提供空状态常量
 *
 * 核心导出：
 * - ConsoleState：控制台状态 Schema
 * - emptyConsoleState：空状态默认值
 *
 * 架构位置：位于 config 层，被 config.ts 用于追踪控制台管理状态
 */
import { Schema } from "effect"
import { NonNegativeInt } from "@opencode-ai/core/schema"

export class ConsoleState extends Schema.Class<ConsoleState>("ConsoleState")({
  consoleManagedProviders: Schema.mutable(Schema.Array(Schema.String)),
  activeOrgName: Schema.optional(Schema.String),
  switchableOrgCount: NonNegativeInt,
}) {}

export const emptyConsoleState: ConsoleState = ConsoleState.make({
  consoleManagedProviders: [],
  activeOrgName: undefined,
  switchableOrgCount: 0,
})
