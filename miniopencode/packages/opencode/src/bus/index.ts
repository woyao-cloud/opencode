// ── Lightweight Event Bus ───────────────────────────────────

type Listener = (data: Record<string, unknown>) => void

const listeners = new Map<string, Set<Listener>>()

/** Subscribe to an event type. Returns unsubscribe function. */
export function on(event: string, fn: Listener): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event)!.add(fn)
  return () => { listeners.get(event)?.delete(fn) }
}

/** Emit an event to all subscribers. */
export function emit(event: string, data: Record<string, unknown>): void {
  const fns = listeners.get(event)
  if (fns) {
    for (const fn of fns) {
      try { fn(data) } catch { /* subscriber error */ }
    }
  }
}

/** Remove all listeners (for testing). */
export function clear(): void {
  listeners.clear()
}

export const EventBus = { on, emit, clear }

export * as Bus from "./index"
