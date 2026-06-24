// ── Ordered ID Generation ───────────────────────────────────

const HEX = "0123456789abcdef"

function randomHex(len: number): string {
  let s = ""
  for (let i = 0; i < len; i++) s += HEX[Math.floor(Math.random() * 16)]
  return s
}

/** Create a time-ordered ID: prefix + base36-timestamp + random suffix. */
export function makeId(prefix: string): string {
  const ts = Date.now().toString(36)       // base36 timestamp (sortable)
  const rand = randomHex(6)                // 6 hex chars ≈ 24 bits of entropy
  return `${prefix}_${ts}_${rand}`
}

/** Extract timestamp from an ID created by `makeId`. */
export function idTimestamp(id: string): number {
  const parts = id.split("_")
  if (parts.length < 2) return 0
  return parseInt(parts[1], 36) || 0
}

export function sessionId(): string {
  return makeId("ses")
}

export function messageId(): string {
  return makeId("msg")
}

export * as SessionId from "./id"
