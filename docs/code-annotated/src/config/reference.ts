/**
 * [config/reference] - 参考配置模块
 *
 * 功能概述：
 * - 定义代码库参考（Reference）的配置 Schema
 * - 支持 Git 仓库引用（仓库 URL + 分支）和本地路径引用
 *
 * 核心导出：
 * - Entry：参考条目 Schema（字符串、Git 引用或本地路径）
 * - Info：参考配置顶层 Schema（名称到条目的映射）
 *
 * 架构位置：下游被 config/config.ts 引用
 */
export * as ConfigReference from "./reference"

import { Schema } from "effect"

const Git = Schema.Struct({
  repository: Schema.String.annotate({
    description: "Git repository URL, host/path reference, or GitHub owner/repo shorthand",
  }),
  branch: Schema.optional(Schema.String).annotate({
    description: "Branch or ref Scout should clone and inspect",
  }),
})

const Local = Schema.Struct({
  path: Schema.String.annotate({
    description: "Absolute path, ~/ path, or workspace-relative path to a local reference directory",
  }),
})

export const Entry = Schema.Union([Schema.String, Git, Local]).annotate({ identifier: "ReferenceConfigEntry" })

export const Info = Schema.Record(Schema.String, Entry).annotate({ identifier: "ReferenceConfig" })
export type Info = Schema.Schema.Type<typeof Info>
