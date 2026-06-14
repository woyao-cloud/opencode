/**
 * tool/invalid - 无效工具处理器
 *
 * 功能概述：
 * - 处理 LLM 调用了未注册或无效工具的情况
 * - 返回错误信息提示用户重新调用
 *
 * 核心导出：
 * - InvalidTool：工具定义对象
 * - Parameters：工具名称参数字段
 *
 * 架构位置：工具系统实现层，被 tool/registry.ts 注册作为兜底处理
 */
import { Effect, Schema } from "effect"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  tool: Schema.String,
  error: Schema.String,
})

export const InvalidTool = Tool.define(
  "invalid",
  Effect.succeed({
    description: "Do not use",
    parameters: Parameters,
    execute: (params: { tool: string; error: string }) =>
      Effect.succeed({
        title: "Invalid Tool",
        output: `The arguments provided to the tool are invalid: ${params.error}`,
        metadata: {},
      }),
  }),
)
