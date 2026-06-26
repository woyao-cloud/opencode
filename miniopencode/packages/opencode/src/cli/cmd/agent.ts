/**
 * cli/cmd/agent.ts — Agent 管理命令
 */

import { Effect } from "effect"
import { AppRuntime, init } from "../bootstrap"
import { AgentService } from "@/agent/agent"

export async function agentListCommand() {
  await init()
  await AppRuntime.runPromise(
    Effect.gen(function* () {
      const agent = yield* AgentService
      const defaultAgent = yield* agent.defaultAgent()
      console.log("Agent:")
      console.log(`  ID: ${defaultAgent.id}`)
      console.log(`  Model: ${defaultAgent.model ?? "default"}`)
      console.log(`  Has system prompt: ${!!defaultAgent.system}`)
      if (defaultAgent.system) {
        console.log(`  System prompt (${defaultAgent.system.length} chars):`)
        console.log(`    ${defaultAgent.system.slice(0, 200)}...`)
      }
    }),
  )
}
