// ── Serve Command — Start HTTP server with session API ────────

import { Effect } from "effect"
import { SessionService, SessionStatusService } from "@/session/index"
import { ProviderService } from "@/provider/index"
import { PromptService } from "@/session/prompt"
import { AppRuntime, init } from "../bootstrap"
import { startServer } from "@/server/index"
import { ToolRuntimeService } from "@/tool/tool"

export async function serveCommand(opts: {
  port: number
  host?: string
  model?: string
}) {
  await init()

  const runEffect = async <A>(effect: Effect.Effect<A>): Promise<A> => {
    return AppRuntime.runPromise(effect) as Promise<A>
  }

  console.log(`Starting server on port ${opts.port}...`)

  const server = await startServer({
    port: opts.port,
    host: opts.host,
    runEffect,
  })

  // Graceful shutdown on SIGINT/SIGTERM
  const shutdown = async () => {
    console.log("\nShutting down...")
    server.stop()
    AppRuntime.dispose()
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

export * as ServeCommand from "./serve"
