/**
 * subagent-permissions - 子 Agent 会话权限规则推导模块
 *
 * 功能概述：
 * - 当通过 task 工具生成子 Agent 时，构建其会话的权限规则集
 * - 合并父 Agent 的编辑拒绝规则、父会话的拒绝/external_directory 规则
 * - 确保子 Agent 不会绕过父级（如 Plan Mode）的编辑限制
 *
 * 核心导出：
 * - deriveSubagentSessionPermission：推导子 Agent 会话权限的核心函数
 *
 * 架构位置：Agent 模块的辅助工具，被 Session 模块在创建子 Agent 时调用
 */

import type { Permission } from "../permission"
import type { Agent } from "./agent"

/**
 * 推导子 Agent 的会话权限规则集。
 *
 * 当通过 task 工具生成子 Agent 时，构建其会话的权限规则集。合并三部分规则：
 * 1. 父 Agent 的编辑拒绝规则（Plan Mode 的编辑限制驻留在 Agent 规则集而非会话上）
 * 2. 父会话的拒绝规则和 external_directory 规则
 * 3. 默认拒绝 todowrite 和 task（除非子 Agent 自身已允许）
 *
 * @param input.parentSessionPermission - 父会话的权限规则集
 * @param input.parentAgent - 父 Agent 的信息（可能为空）
 * @param input.subagent - 子 Agent 的信息
 * @returns 合并后的权限规则集
 */
export function deriveSubagentSessionPermission(input: {
  parentSessionPermission: Permission.Ruleset
  parentAgent: Agent.Info | undefined
  subagent: Agent.Info
}): Permission.Ruleset {
  const canTask = input.subagent.permission.some((rule) => rule.permission === "task")
  const canTodo = input.subagent.permission.some((rule) => rule.permission === "todowrite")
  const parentAgentDenies =
    input.parentAgent?.permission.filter((rule) => rule.action === "deny" && rule.permission === "edit") ?? []
  return [
    ...parentAgentDenies,
    ...input.parentSessionPermission.filter(
      (rule) => rule.permission === "external_directory" || rule.action === "deny",
    ),
    ...(canTodo ? [] : [{ permission: "todowrite" as const, pattern: "*" as const, action: "deny" as const }]),
    ...(canTask ? [] : [{ permission: "task" as const, pattern: "*" as const, action: "deny" as const }]),
  ]
}
