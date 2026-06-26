/**
 * tool/plan.ts — 计划生成工具
 *
 * AI 可创建、查看、更新执行计划
 */

import { Effect } from "effect"
import type { Def } from "./tool"

interface Plan {
  id: string
  title: string
  steps: Array<{ id: number; description: string; status: "pending" | "in_progress" | "completed" }>
}

let plans: Plan[] = []
let planId = 0

export const PlanTool: Def<any> = {
  name: "plan",
  description: "创建和管理执行计划。用于分解复杂任务为有序步骤",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "show", "update_step"],
        description: "create=创建计划, show=查看计划, update_step=更新步骤",
      },
      title: { type: "string", description: "计划标题（create 时需要）" },
      steps: {
        type: "array",
        items: { type: "string" },
        description: "步骤列表（create 时需要）",
      },
      plan_id: { type: "string", description: "计划 ID（show/update_step 时需要）" },
      step_id: { type: "number", description: "步骤 ID（update_step 时需要）" },
      step_status: {
        type: "string",
        enum: ["pending", "in_progress", "completed"],
        description: "步骤状态（update_step 时需要）",
      },
    },
    required: ["action"],
  },
  execute: (args: { action: string; title?: string; steps?: string[]; plan_id?: string; step_id?: number; step_status?: string }) =>
    Effect.sync(() => {
      switch (args.action) {
        case "create": {
          if (!args.title) return "错误: create 需要 title"
          if (!args.steps?.length) return "错误: create 需要 steps"
          const id = `plan-${++planId}`
          const plan: Plan = {
            id,
            title: args.title,
            steps: args.steps.map((desc, i) => ({ id: i + 1, description: desc, status: "pending" as const })),
          }
          plans.push(plan)
          return `已创建计划 [${id}]: ${args.title}\n${plan.steps.map((s) => `  ${s.id}. [待处理] ${s.description}`).join("\n")}`
        }

        case "show": {
          if (!args.plan_id) return "错误: show 需要 plan_id"
          const plan = plans.find((p) => p.id === args.plan_id)
          if (!plan) return `错误: 找不到计划 ${args.plan_id}`
          return `计划 [${plan.id}]: ${plan.title}\n${plan.steps.map((s) => `  ${s.id}. [${statusLabel(s.status)}] ${s.description}`).join("\n")}`
        }

        case "update_step": {
          if (!args.plan_id) return "错误: update_step 需要 plan_id"
          if (!args.step_id) return "错误: update_step 需要 step_id"
          if (!args.step_status) return "错误: update_step 需要 step_status"
          const plan = plans.find((p) => p.id === args.plan_id)
          if (!plan) return `错误: 找不到计划 ${args.plan_id}`
          const step = plan.steps.find((s) => s.id === args.step_id)
          if (!step) return `错误: 找不到步骤 ${args.step_id}`
          step.status = args.step_status as any
          return `已更新计划 ${plan.id} 步骤 ${step.id} 状态为 ${statusLabel(step.status)}`
        }

        default:
          return `错误: 未知操作 ${args.action}`
      }
    }),
}

function statusLabel(s: string): string {
  switch (s) {
    case "pending": return "待处理"
    case "in_progress": return "进行中"
    case "completed": return "已完成"
    default: return s
  }
}
