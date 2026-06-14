/**
 * [bus/bus-event] - 总线事件定义模块
 *
 * 功能概述：
 * - 提供事件定义（Definition）的类型和注册机制
 * - 管理事件 Schema 的全局注册表
 * - 生成事件类型和属性的 Effect Schema
 *
 * 核心导出：
 * - Definition：事件定义类型（type + properties）
 * - define()：定义新事件类型
 * - effectPayloads()：生成事件 Schema 注册表
 *
 * 架构位置：上游依赖 Effect Schema 和 EventV2；下游被 bus/index.ts、sync/index.ts 引用
 */
import { Schema } from "effect"
import { EventV2 } from "@opencode-ai/core/event"

export type Definition<Type extends string = string, Properties extends Schema.Top = Schema.Top> = {
  type: Type
  properties: Properties
}

const registry = new Map<string, Definition>()

export function define<Type extends string, Properties extends Schema.Top>(
  type: Type,
  properties: Properties,
): Definition<Type, Properties> {
  const result = { type, properties }
  registry.set(type, result)
  return result
}

export function effectPayloads() {
  return [
    ...registry
      .entries()
      .map(([type, def]) =>
        Schema.Struct({
          id: Schema.String,
          type: Schema.Literal(type),
          properties: def.properties,
        }).annotate({ identifier: `Event.${type}` }),
      )
      .toArray(),
    ...EventV2.registry
      .values()
      .map((definition) =>
        Schema.Struct({
          id: Schema.String,
          type: Schema.Literal(definition.type),
          properties: definition.data,
        }).annotate({ identifier: `Event.${definition.type}` }),
      )
      .toArray(),
  ]
}

export * as BusEvent from "./bus-event"
