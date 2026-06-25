// ── Session Export CLI Command ───────────────────────────────
// Exports a session and its messages as JSON.

import { Effect } from "effect"
import { writeFile } from "node:fs/promises"
import { AppRuntime, init } from "../bootstrap"
import { SessionService } from "@/session/session"

interface ExportPayload {
  version: 1
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

export async function sessionExportCommand(opts: { id: string; output?: string }) {
  await init()

  const session = await AppRuntime.runPromise(
    SessionService.use((svc) => svc.get(opts.id)),
  ) as any

  if (!session) {
    console.error(`Session not found: ${opts.id}`)
    process.exit(1)
  }

  const messages = await AppRuntime.runPromise(
    SessionService.use((svc) => svc.getMessages(opts.id)),
  ) as any

  const payload: ExportPayload = {
    version: 1,
    exported_at: new Date().toISOString(),
    session: {
      id: session.id,
      title: session.title,
      status: session.status,
      created_at: session.created_at,
      updated_at: session.updated_at,
      agent_id: session.agent_id,
      model_id: session.model_id,
      metadata_json: session.metadata_json,
      permission_rules_json: session.permission_rules_json,
    },
    messages: messages.map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      tool_name: m.tool_name,
      tool_args_json: m.tool_args_json,
    })),
  }

  const json = JSON.stringify(payload, null, 2)

  if (opts.output) {
    await writeFile(opts.output, json, "utf-8")
    console.log(`Exported session ${opts.id} to ${opts.output}`)
  } else {
    console.log(json)
  }
}

export * as ExportCommand from "./export"
