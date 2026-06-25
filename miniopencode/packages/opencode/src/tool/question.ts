/**
 * tool/question.ts — 提问工具
 *
 * 允许 AI 向用户提问以获取额外信息
 */

import { Effect } from "effect"
import type { Def } from "./tool"
import { QuestionServiceTag } from "@/question/index"

export const QuestionTool: Def<any> = {
  name: "question",
  description: "向用户提问以获取额外信息。当你需要用户提供更多上下文、确认操作或做出选择时使用",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", description: "向用户提出的问题" },
      options: {
        type: "array",
        items: { type: "string" },
        description: "可选的选项列表（用户可以从中选择）",
      },
    },
    required: ["question"],
  },
  execute: (args: { question: string; options?: string[] }) =>
    Effect.gen(function* () {
      const q = yield* QuestionServiceTag
      return yield* q.ask(args.question, args.options)
    }),
}
