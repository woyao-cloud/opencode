/**
 * cli/cmd/db.ts — 数据库工具命令
 */

import { Effect } from "effect"
import { AppRuntime, init } from "../bootstrap"
import { SessionService } from "@/session/session"

export async function dbStatsCommand() {
  await init()
  await AppRuntime.runPromise(
    Effect.gen(function* () {
      const session = yield* SessionService
      const sessions = yield* session.list(100)
      let totalMessages = 0
      for (const s of sessions) {
        const msgs = yield* session.getMessages(s.id)
        totalMessages += msgs.length
      }
      console.log("数据库统计:")
      console.log(`  Session 数: ${sessions.length}`)
      console.log(`  消息总数: ${totalMessages}`)
      console.log(`  最新 Session: ${sessions[0]?.title ?? "(无)"}`)
    }),
  )
}
