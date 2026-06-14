/**
 * [config/skills] - 技能配置模块
 *
 * 功能概述：
 * - 定义技能的配置 Schema（额外的技能目录路径和 URL）
 *
 * 核心导出：
 * - Info：技能配置顶层 Schema
 *
 * 架构位置：下游被 config/config.ts 引用
 */
import { Schema } from "effect"

export const Info = Schema.Struct({
  paths: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Additional paths to skill folders",
  }),
  urls: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "URLs to fetch skills from (e.g., https://example.com/.well-known/skills/)",
  }),
})

export type Info = Schema.Schema.Type<typeof Info>

export * as ConfigSkills from "./skills"
