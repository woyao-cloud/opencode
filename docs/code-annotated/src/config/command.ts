/**
 * [config/command] - 命令配置模块：从 Markdown 文件加载自定义命令
 *
 * 功能概述：
 * - 定义命令配置 Schema（模板、描述、关联 Agent、模型、子任务标记）
 * - 从 {command,commands}/**\/*.md 文件加载自定义命令
 * - 支持命令的模板化内容和前置元数据（frontmatter）
 *
 * 核心导出：
 * - Info：命令配置 Schema
 * - load：从目录加载所有命令配置
 *
 * 架构位置：位于 config 层，被 config.ts 的配置加载流程调用
 */
export * as ConfigCommand from "./command"

import * as Log from "@opencode-ai/core/util/log"
import { Cause, Exit, Schema } from "effect"
import { NamedError } from "@opencode-ai/core/util/error"
import { Glob } from "@opencode-ai/core/util/glob"
import { Bus } from "@/bus"
import { configEntryNameFromPath } from "./entry-name"
import { InvalidError } from "./error"
import * as ConfigMarkdown from "./markdown"
import { ConfigModelID } from "./model-id"

const log = Log.create({ service: "config" })

export const Info = Schema.Struct({
  template: Schema.String,
  description: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(ConfigModelID),
  subtask: Schema.optional(Schema.Boolean),
})

export type Info = Schema.Schema.Type<typeof Info>

const decodeInfo = Schema.decodeUnknownExit(Info)

export async function load(dir: string) {
  const result: Record<string, Info> = {}
  for (const item of await Glob.scan("{command,commands}/**/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(async (err) => {
      const message = ConfigMarkdown.FrontmatterError.isInstance(err)
        ? err.data.message
        : `Failed to parse command ${item}`
      const { Session } = await import("@/session/session")
      void Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
      log.error("failed to load command", { command: item, err })
      return undefined
    })
    if (!md) continue

    const patterns = ["/.opencode/command/", "/.opencode/commands/", "/command/", "/commands/"]
    const name = configEntryNameFromPath(item, patterns)

    const config = {
      name,
      ...md.data,
      template: md.content.trim(),
    }
    const parsed = decodeInfo(config, { errors: "all", propertyOrder: "original" })
    if (Exit.isSuccess(parsed)) {
      result[config.name] = parsed.value
      continue
    }
    throw new InvalidError({ path: item, message: Cause.pretty(parsed.cause) }, { cause: Cause.squash(parsed.cause) })
  }
  return result
}
