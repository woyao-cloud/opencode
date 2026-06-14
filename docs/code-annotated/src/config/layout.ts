/**
 * [config/layout] - 布局配置模块
 *
 * 功能概述：
 * - 定义布局模式的配置 Schema（"auto" | "stretch"）
 *
 * 核心导出：
 * - Layout：布局模式字面量联合类型 Schema
 *
 * 架构位置：下游被 config/config.ts 引用
 */
import { Schema } from "effect"

export const Layout = Schema.Literals(["auto", "stretch"]).annotate({ identifier: "LayoutConfig" })
export type Layout = Schema.Schema.Type<typeof Layout>

export * as ConfigLayout from "./layout"
