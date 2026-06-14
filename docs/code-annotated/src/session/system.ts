/**
 * session/system - 系统提示词（System Prompt）组装服务
 *
 * 功能概述：
 * - 根据模型 ID 自动选择对应厂商的 Prompt 模板（Anthropic/GPT/Gemini/Kimi 等）
 * - 生成环境上下文信息（工作目录、VCS 状态、平台、日期等）
 * - 注入可用 Skills 列表供 LLM 调用
 *
 * 核心导出：
 * - provider：根据模型 ID 返回对应的 Prompt 文件路径数组
 * - Interface/Service/layer/defaultLayer：SystemPrompt 服务的 Effect 实现
 *
 * 架构位置：会话系统的 Prompt 组装层，为 LLM 调用提供系统级上下文。
 * 上游依赖：Provider、Agent、Permission、Skill、InstanceState
 * 下游消费：session/llm.ts（组装 system messages 时调用）
 */

import { Context, Effect, Layer } from "effect"
import PROMPT_DEFAULT from "./prompt/default.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_GPT from "./prompt/gpt.txt"
import PROMPT_KIMI from "./prompt/kimi.txt"

import PROMPT_CODEX from "./prompt/codex.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"

/**
 * 根据模型 ID 返回对应的系统 Prompt 文件内容
 *
 * 模型匹配规则（按优先级）：
 * - GPT-4/O1/O3 系列 → beast.txt（最详细）
 * - GPT 系列 → codex.txt 或 gpt.txt
 * - Gemini 系列 → gemini.txt
 * - Claude 系列 → anthropic.txt
 * - Trinity/Kimi 系列 → 对应的模板
 * - 其他 → default.txt
 *
 * @param model - Provider 模型信息
 * @returns Prompt 文本数组
 */
export function provider(model: Provider.Model) {
  if (model.api.id.includes("gpt-4") || model.api.id.includes("o1") || model.api.id.includes("o3"))
    return [PROMPT_BEAST]
  if (model.api.id.includes("gpt")) {
    if (model.api.id.includes("codex")) {
      return [PROMPT_CODEX]
    }
    return [PROMPT_GPT]
  }
  if (model.api.id.includes("gemini-")) return [PROMPT_GEMINI]
  if (model.api.id.includes("claude")) return [PROMPT_ANTHROPIC]
  if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_TRINITY]
  if (model.api.id.toLowerCase().includes("kimi")) return [PROMPT_KIMI]
  return [PROMPT_DEFAULT]
}

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SystemPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service

    return Service.of({
      environment: Effect.fn("SystemPrompt.environment")(function* (model: Provider.Model) {
        const ctx = yield* InstanceState.context
        return [
          [
            `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
            `Here is some useful information about the environment you are running in:`,
            `<env>`,
            `  Working directory: ${ctx.directory}`,
            `  Workspace root folder: ${ctx.worktree}`,
            `  Is directory a git repo: ${ctx.project.vcs === "git" ? "yes" : "no"}`,
            `  Platform: ${process.platform}`,
            `  Today's date: ${new Date().toDateString()}`,
            `</env>`,
          ].join("\n"),
        ]
      }),

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        const list = yield* skill.available(agent)

        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          // the agents seem to ingest the information about skills a bit better if we present a more verbose
          // version of them here and a less verbose version in tool description, rather than vice versa.
          Skill.fmt(list, { verbose: true }),
        ].join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Skill.defaultLayer))

export * as SystemPrompt from "./system"
