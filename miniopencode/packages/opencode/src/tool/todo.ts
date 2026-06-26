/**
 * tool/todo.ts — Todo 管理工具
 *
 * AI 可创建、列表、更新 Todo 项
 */

import { Effect } from "effect"
import type { Def } from "./tool"

let todos: Array<{ id: number; title: string; status: "pending" | "in_progress" | "completed" }> = []
let nextId = 1

export const TodoTool: Def<any> = {
  name: "todo",
  description: "创建和管理 Todo 列表。支持添加、列表、更新状态操作",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "add", "update"],
        description: "操作类型：list=列表, add=添加, update=更新",
      },
      title: { type: "string", description: "Todo 标题（add 时需要）" },
      id: { type: "number", description: "Todo ID（update 时需要）" },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed"],
        description: "新状态（update 时需要）",
      },
    },
    required: ["action"],
  },
  execute: (args: { action: string; title?: string; id?: number; status?: string }) =>
    Effect.sync(() => {
      switch (args.action) {
        case "list":
          if (todos.length === 0) return "Todo 列表为空"
          return todos
            .map((t) => `[${t.id}] [${statusLabel(t.status)}] ${t.title}`)
            .join("\n")

        case "add":
          if (!args.title) return "错误: add 操作需要 title 参数"
          const todo = { id: nextId++, title: args.title, status: "pending" as const }
          todos.push(todo)
          return `已添加 Todo #${todo.id}: ${todo.title}`

        case "update":
          if (!args.id) return "错误: update 操作需要 id 参数"
          if (!args.status) return "错误: update 操作需要 status 参数"
          const target = todos.find((t) => t.id === args.id)
          if (!target) return `错误: 找不到 Todo #${args.id}`
          target.status = args.status as any
          return `已更新 Todo #${args.id} 状态为 ${statusLabel(target.status)}`

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
