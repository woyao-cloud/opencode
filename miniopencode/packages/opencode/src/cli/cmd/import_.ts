// ── Session Import CLI Command ───────────────────────────────
// Imports a session from a JSON export.

import { Effect } from "effect"
import { readFile } from "node:fs/promises"
import { AppRuntime, init } from "../bootstrap"
import { SessionService } from "@/session/session"

interface ImportPayload {
  version: number
  exported_at: string
  session: {
    id: string
    title: string
    status: string
    created_at: number
    updated_at: number
    agent_id: string
    model_id: string | null
    metadata_json: string | null
    permission_rules_json: string | null
  }
  messages: Array<{
    id: string
    role: string
    content: string
    created_at: number
    tool_name: string | null
    tool_args_json: string | null
  }>
}

export async function sessionImportCommand(opts: { file: string }) {
  await init()

  const raw = await readFile(opts.file, "utf-8")
  const payload: ImportPayload = JSON.parse(raw)

  if (!payload.version || !payload.session) {
    console.error("Invalid export file: missing version or session data")
    process.exit(1)
  }

  await AppRuntime.runPromise(
    Effect.gen(function* () {
      const svc = yield* SessionService

      // Create the session
      const session = yield* svc.create({
        title: payload.session.title,
        agentId: payload.session.agent_id,
        modelId: payload.session.model_id ?? undefined,
      })

      console.log(`Imported session: ${session.id} (${session.title || "(untitled)"})`)

      // Append each message
      for (const msg of payload.messages) {
        yield* svc.appendMessage(session.id, {
          role: msg.role,
          content: msg.content,
          toolName: msg.tool_name ?? undefined,
          toolArgs: msg.tool_args_json ? JSON.parse(msg.tool_args_json) : undefined,
        })
      }

      console.log(`  ${payload.messages.length} message(s) restored`)
    }),
  )
}

export * as ImportCommand from "./import_"
