/**
 * command/index - 命令（Command）模块
 *
 * 功能概述：
 * - 管理 slash 命令（如 /init、/review）的注册、查询和列表
 * - 支持三种命令来源：内置命令、MCP 提示、技能（Skill）
 * - 命令模板支持惰性求值（Promise<string>），适用于 MCP 提示等异步场景
 * - 提供命令提示参数解析（$1、$2、$ARGUMENTS 等）
 *
 * 核心导出：
 * - Info：命令元数据的 Schema 定义与类型
 * - Interface：命令服务接口
 * - Service：命令服务的 Effect 上下文标签
 * - layer：命令服务的 Effect 层实现
 * - defaultLayer：默认依赖注入的完整 Layer
 * - Event：命令执行事件定义
 * - Default：内置命令名称常量（INIT、REVIEW）
 * - hints：从模板中提取提示参数占位符的工具函数
 *
 * 架构位置：opencode 框架核心层，依赖 Config、MCP、Skill 模块，
 * 被 Session 模块在解析用户输入中的 slash 命令时调用
 */

import { BusEvent } from "@/bus/bus-event"
import { InstanceState } from "@/effect/instance-state"
import { EffectBridge } from "@/effect/bridge"
import type { InstanceContext } from "@/project/instance-context"
import { SessionID, MessageID } from "@/session/schema"
import { Effect, Layer, Context, Schema } from "effect"
import { Config } from "@/config/config"
import { MCP } from "../mcp"
import { Skill } from "../skill"
import PROMPT_INITIALIZE from "./template/initialize.txt"
import PROMPT_REVIEW from "./template/review.txt"

type State = {
  commands: Record<string, Info>
}

/**
 * 命令执行事件定义。
 * 当命令被触发执行时发布，包含命令名称、会话 ID、参数和消息 ID。
 */
export const Event = {
  Executed: BusEvent.define(
    "command.executed",
    Schema.Struct({
      name: Schema.String,
      sessionID: SessionID,
      arguments: Schema.String,
      messageID: MessageID,
    }),
  ),
}

/**
 * 命令元数据 Schema。
 * 包含名称、描述、关联 Agent/模型、来源（command/mcp/skill）、
 * 模板内容（可能为惰性 Promise）、子任务标记和提示参数列表。
 */
export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  source: Schema.optional(Schema.Literals(["command", "mcp", "skill"])),
  // Some command templates are lazy promises from MCP prompt resolution.
  // 部分命令模板是来自 MCP 提示解析的惰性 Promise
  template: Schema.Unknown,
  subtask: Schema.optional(Schema.Boolean),
  hints: Schema.Array(Schema.String),
}).annotate({ identifier: "Command" })

export type Info = Omit<Schema.Schema.Type<typeof Info>, "template"> & { template: Promise<string> | string }

/**
 * 从命令模板中提取提示参数占位符。
 * 支持 $1、$2 等编号参数和 $ARGUMENTS 变量参数。
 * @param template - 命令模板字符串
 * @returns 提取的参数占位符列表
 */
export function hints(template: string) {
  const result: string[] = []
  const numbered = template.match(/\$\d+/g)
  if (numbered) {
    for (const match of [...new Set(numbered)].sort()) result.push(match)
  }
  if (template.includes("$ARGUMENTS")) result.push("$ARGUMENTS")
  return result
}

export const Default = {
  INIT: "init",
  REVIEW: "review",
} as const

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly list: () => Effect.Effect<Info[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Command") {}

/**
 * 命令服务 Layer。
 * 构建命令注册表，包含三种来源的命令：
 * 1. 内置命令（init、review）
 * 2. 用户配置的命令
 * 3. MCP 提示作为命令
 * 4. 技能作为命令
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const mcp = yield* MCP.Service
    const skill = yield* Skill.Service

    const init = Effect.fn("Command.state")(function* (ctx: InstanceContext) {
      const cfg = yield* config.get()
      const bridge = yield* EffectBridge.make()
      const commands: Record<string, Info> = {}

      // 注册内置命令：/init 用于引导 AGENTS.md 设置
      commands[Default.INIT] = {
        name: Default.INIT,
        description: "guided AGENTS.md setup",
        source: "command",
        get template() {
          return PROMPT_INITIALIZE.replace("${path}", ctx.worktree)
        },
        hints: hints(PROMPT_INITIALIZE),
      }
      // 注册内置命令：/review 用于审查代码变更
      commands[Default.REVIEW] = {
        name: Default.REVIEW,
        description: "review changes [commit|branch|pr], defaults to uncommitted",
        source: "command",
        get template() {
          return PROMPT_REVIEW.replace("${path}", ctx.worktree)
        },
        subtask: true,
        hints: hints(PROMPT_REVIEW),
      }

      for (const [name, command] of Object.entries(cfg.command ?? {})) {
        // 注册用户配置中的自定义命令
        commands[name] = {
          name,
          agent: command.agent,
          model: command.model,
          description: command.description,
          source: "command",
          get template() {
            return command.template
          },
          subtask: command.subtask,
          hints: hints(command.template),
        }
      }

      // 将 MCP 提示作为命令注册（通过 EffectBridge 将异步 Promise 转为惰性 getter）
      for (const [name, prompt] of Object.entries(yield* mcp.prompts())) {
        commands[name] = {
          name,
          source: "mcp",
          description: prompt.description,
          get template() {
            return bridge.promise(
              mcp
                .getPrompt(
                  prompt.client,
                  prompt.name,
                  prompt.arguments
                    ? Object.fromEntries(prompt.arguments.map((argument, i) => [argument.name, `$${i + 1}`]))
                    : {},
                )
                .pipe(
                  Effect.map(
                    (template) =>
                      template?.messages
                        .map((message) => (message.content.type === "text" ? message.content.text : ""))
                        .join("\n") || "",
                  ),
                ),
            )
          },
          hints: prompt.arguments?.map((_, i) => `$${i + 1}`) ?? [],
        }
      }

      for (const item of yield* skill.all()) {
        if (commands[item.name]) continue
        commands[item.name] = {
          name: item.name,
          description: item.description,
          source: "skill",
          get template() {
            return item.content
          },
          hints: [],
        }
      }

      return {
        commands,
      }
    })

    const state = yield* InstanceState.make<State>((ctx) => init(ctx))

    const get = Effect.fn("Command.get")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      return s.commands[name]
    })

    const list = Effect.fn("Command.list")(function* () {
      const s = yield* InstanceState.get(state)
      return Object.values(s.commands)
    })

    return Service.of({ get, list })
  }),
)

/**
 * 默认命令 Layer，注入 Config、MCP、Skill 依赖子 Layer
 */
export const defaultLayer = layer.pipe(
  Layer.provide(Config.defaultLayer),
  Layer.provide(MCP.defaultLayer),
  Layer.provide(Skill.defaultLayer),
)

export * as Command from "."
