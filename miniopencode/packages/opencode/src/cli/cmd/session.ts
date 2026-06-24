// ── Session CLI Commands ────────────────────────────────────

import { Effect } from "effect"
import { AppRuntime, init } from "../bootstrap"
import { SessionService } from "@/session/session"

export async function sessionListCommand(opts: { limit?: number }) {
  await init()
  const sessions = await AppRuntime.runPromise(
    SessionService.use((svc) => svc.list(opts.limit)),
  ) as any

  if (sessions.length === 0) {
    console.log("No sessions found.")
    return
  }

  for (const s of sessions) {
    const date = new Date(s.created_at).toISOString().slice(0, 19).replace("T", " ")
    const title = s.title || "(untitled)"
    console.log(`${s.id.padEnd(30)} ${date}  [${s.status}]  ${title}`)
  }
}

export async function sessionGetCommand(opts: { id: string }) {
  await init()
  const session = await AppRuntime.runPromise(
    SessionService.use((svc) => svc.get(opts.id)),
  ) as any

  if (!session) {
    console.error(`Session not found: ${opts.id}`)
    process.exit(1)
  }

  console.log(`ID:       ${session.id}`)
  console.log(`Status:   ${session.status}`)
  console.log(`Created:  ${new Date(session.created_at).toISOString()}`)
  console.log(`Updated:  ${new Date(session.updated_at).toISOString()}`)
  console.log(`Agent:    ${session.agent_id}`)
  console.log(`Model:    ${session.model_id ?? "(not set)"}`)
  console.log(`Title:    ${session.title || "(untitled)"}`)
  console.log("")

  const messages = await AppRuntime.runPromise(
    SessionService.use((svc) => svc.getMessages(opts.id)),
  ) as any

  if (messages.length === 0) {
    console.log("No messages.")
    return
  }

  for (const m of messages) {
    const role = m.role.padEnd(9)
    const preview = m.content.length > 200 ? m.content.slice(0, 200) + "..." : m.content
    console.log(`[${role}] ${preview}`)
  }
  console.log(`\n${messages.length} message(s)`)
}

export async function sessionDeleteCommand(opts: { id: string }) {
  await init()
  await AppRuntime.runPromise(
    SessionService.use((svc) => svc.delete(opts.id)),
  )
  console.log(`Deleted session: ${opts.id}`)
}

export * as SessionCommand from "./session"
