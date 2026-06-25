// ── ID Generation System ──────────────────────────────────
// Monotonic, time-ordered IDs with type-safe prefixes.

const HEX = "0123456789abcdef"

function randomHex(len: number): string {
  let s = ""
  for (let i = 0; i < len; i++) s += HEX[Math.floor(Math.random() * 16)]
  return s
}

function makeId(prefix: string): string {
  const ts = Date.now().toString(36)
  const rand = randomHex(6)
  return `${prefix}_${ts}_${rand}`
}

function idTimestamp(id: string): number {
  const parts = id.split("_")
  if (parts.length < 2) return 0
  return parseInt(parts[1], 36) || 0
}

// ── Prefixed generators ───────────────────────────────────

export const sessionId = (): string => makeId("ses")
export const messageId = (): string => makeId("msg")
export const jobId = (): string => makeId("job")
export const eventId = (): string => makeId("evt")
export const permissionId = (): string => makeId("per")
export const questionId = (): string => makeId("que")
export const partId = (): string => makeId("prt")
export const ptyId = (): string => makeId("pty")
export const toolId = (): string => makeId("tool")
export const workspaceId = (): string => makeId("wrk")

export { makeId, idTimestamp }

export * as ID from "."
