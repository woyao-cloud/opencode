/**
 * question/index.ts — 交互式提问服务
 *
 * 允许 AI 向用户提问以获取额外信息
 */

import { Effect, Layer, Context, Deferred } from "effect"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "question" })

// ===== 服务接口 =====

export interface QuestionService {
  readonly ask: (question: string, options?: string[]) => Effect.Effect<string>
}

// ===== Context Tag =====

export class QuestionServiceTag extends Context.Service<QuestionServiceTag, QuestionService>()("@miniopencode/Question") {}

// ===== Layer 实现 =====

export const QuestionLive = Layer.effect(
  QuestionServiceTag,
  Effect.gen(function* () {
    return {
      ask: (question: string, options?: string[]) =>
        Effect.gen(function* () {
          log.info("asking question", { question, options })

          // 在 CLI 模式下，直接输出到控制台并读取用户输入
          console.log(`\n[AI 提问] ${question}`)
          if (options && options.length > 0) {
            console.log(`选项: ${options.map((o, i) => `${i + 1}. ${o}`).join(" | ")}`)
          }
          process.stdout.write("你的回答: ")

          return yield* Effect.async<string>((resume) => {
            const stdin = process.stdin
            const original = stdin.isRaw
            try {
              stdin.resume()
              const onData = (data: Buffer) => {
                stdin.pause()
                stdin.removeListener("data", onData)
                const answer = data.toString().trim()
                resume(Effect.succeed(answer))
              }
              stdin.on("data", onData)
            } catch {
              resume(Effect.succeed(""))
            }
          })
        }),
    }
  }),
)
