// ── Stats CLI Command ────────────────────────────────────────
// Shows usage statistics from the session store.

import { Effect } from "effect"
import { AppRuntime, init } from "../bootstrap"
import { SessionService } from "@/session/session"

export async function statsCommand() {
  await init()

  const sessions = await AppRuntime.runPromise(
    SessionService.use((svc) => svc.list()),
  ) as any

  if (sessions.length === 0) {
    console.log("No sessions yet.")
    return
  }

  // Gather stats
  let totalMessages = 0
  let totalChars = 0
  const statusCounts: Record<string, number> = {}
  let oldest = Infinity
  let newest = 0

  for (const s of sessions) {
    statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1
    if (s.created_at < oldest) oldest = s.created_at
    if (s.created_at > newest) newest = s.created_at

    const messages = await AppRuntime.runPromise(
      SessionService.use((svc) => svc.getMessages(s.id)),
    ) as any

    totalMessages += messages.length
    for (const m of messages) {
      totalChars += m.content.length
    }
  }

  console.log("=== Session Stats ===")
  console.log(`Total sessions:    ${sessions.length}`)
  console.log(`Total messages:    ${totalMessages}`)
  console.log(`Total characters:  ${totalChars.toLocaleString()}`)
  console.log(`Avg msg/session:   ${(totalMessages / sessions.length).toFixed(1)}`)

  if (totalMessages > 0) {
    console.log(`Avg chars/msg:     ${Math.round(totalChars / totalMessages)}`)
  }

  console.log("")
  console.log("Status breakdown:")
  for (const [status, count] of Object.entries(statusCounts).sort()) {
    console.log(`  ${status}: ${count}`)
  }

  console.log("")
  console.log(`Date range:        ${new Date(oldest).toISOString().slice(0, 10)} → ${new Date(newest).toISOString().slice(0, 10)}`)
  console.log(`Session lifespan:  ${Math.round((newest - oldest) / 86400000)} day(s)`)
}

export * as StatsCommand from "./stats"
