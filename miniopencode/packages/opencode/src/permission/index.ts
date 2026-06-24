import { Effect, Context, Layer, Deferred, Clock, Stream, Option } from "effect"
import { ConfigService } from "@/config/config"
import * as Log from "@miniopencode/core/util/log"
import { getDb } from "@/session/db"
import { evaluate, evaluateChain, parseAgentPermissionPatterns } from "./evaluate"
import type { Rule, Action } from "./schema"
import type { MiniOpenCodeConfig } from "@/config/config"
import { BusService, type BusShape } from "@/bus/index"
import { PermissionRequested, PermissionResponded } from "@/bus/bus-event"

const log = Log.create({ service: "permission" })

// ── Constants ─────────────────────────────────────────────────

/** Default permission rules used when no config or agent rules are provided.
 *  Follows a "deny-by-default, allow-when-safe" principle. */
export const DEFAULT_RULES: ReadonlyArray<Rule> = [
  { pattern: "allow:*", action: "allow" },
]

/** Permission request timeout — 5 minutes */
const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000

// ── Private request tracking ──────────────────────────────────

interface PendingRequest {
  deferred: Deferred.Deferred<Action, Error>
  pattern: string
  startedAt: number
}

// ── Service Interface ─────────────────────────────────────────

export interface PermissionShape {
  readonly evaluate: (pattern: string, agentRules?: ReadonlyArray<string>) => Action | undefined
  readonly request: (pattern: string, opts?: {
    sessionId?: string
    agentId?: string
    agentRules?: ReadonlyArray<string>
  }) => Effect.Effect<Action, Error>
  readonly handleResponse: (id: string, action: Action) => Effect.Effect<boolean>
  readonly setPersistedRules: (rules: ReadonlyArray<Rule>) => Effect.Effect<void>
  readonly getPersistedRules: () => ReadonlyArray<Rule>
}

export class PermissionService extends Context.Service<PermissionService, PermissionShape>()("@miniopencode/Permission") {}

// ── Rule parsing helper ───────────────────────────────────────

function parseRules(
  configRules: ReadonlyArray<{ pattern: string; allow?: boolean; deny?: boolean }>,
): ReadonlyArray<Rule> {
  return configRules.map((r) => ({
    pattern: r.pattern,
    action: r.deny ? "deny" as const : r.allow ? "allow" as const : "ask" as const,
  }))
}

// ── SQLite Persistence ─────────────────────────────────────────

interface PermissionRuleRow {
  id: string
  pattern: string
  action: string
  created_at: number
}

function loadPersistedRules(): ReadonlyArray<Rule> {
  try {
    const db = getDb()
    const rows = db.query("SELECT pattern, action FROM permission_rule ORDER BY created_at ASC").all() as Array<{ pattern: string; action: string }>
    return rows.map((r) => ({ pattern: r.pattern, action: r.action === "deny" ? "deny" as const : "allow" as const }))
  } catch (e) {
    log.warn("failed to load persisted rules", { error: String(e) })
    return []
  }
}

function savePersistedRule(pattern: string, action: Action): void {
  try {
    const db = getDb()
    const id = "pr_" + Math.random().toString(36).slice(2, 10)
    db.run("INSERT OR IGNORE INTO permission_rule (id, pattern, action, created_at) VALUES (?, ?, ?, ?)", [id, pattern, action, Date.now()] as any)
  } catch (e) {
    log.warn("failed to persist rule", { pattern, action, error: String(e) })
  }
}

// ── Factory ───────────────────────────────────────────────────

export function makePermission(
  permissionConfig: MiniOpenCodeConfig["permission"],
  bus: BusShape,
): PermissionShape {
  const configRules: ReadonlyArray<Rule> = parseRules(permissionConfig?.rules ?? [])
  let persistedRules: ReadonlyArray<Rule> = loadPersistedRules()
  const pendingRequests = new Map<string, PendingRequest>()

  // Subscribe to PermissionResponded events to resolve pending requests
  const responseSubscription = bus.subscribe(PermissionResponded).pipe(
    Stream.runForEach((event) => {
      const pending = pendingRequests.get(event.properties.id)
      if (!pending) return Effect.void

      const action = event.properties.action === "allow" ? "allow" as Action
        : event.properties.action === "deny" ? "deny" as Action
        : "ask" as Action

      // If "always", add to persisted rules (both in-memory and SQLite)
      if (event.properties.always && action !== "ask") {
        persistedRules = [...persistedRules, { pattern: event.properties.pattern, action }]
        savePersistedRule(event.properties.pattern, action)
        log.info("persisted permission rule", { pattern: event.properties.pattern, action })
      }

      pendingRequests.delete(event.properties.id)
      return Deferred.succeed(pending.deferred, action).pipe(Effect.ignore)
    }),
    Effect.forkDetach,
  )

  // Fire-and-forget the subscription fiber
  Effect.runFork(responseSubscription)

  return {
    evaluate: (pattern: string, agentRulePatterns?: ReadonlyArray<string>) => {
      const agentRules = agentRulePatterns ? parseAgentPermissionPatterns(agentRulePatterns) : []
      const result = evaluateChain(pattern, persistedRules, agentRules, configRules)
      log.debug("evaluate", { pattern, result, agentRules: agentRulePatterns?.length, configRules: configRules.length })
      return result
    },

    request: (pattern: string, opts) =>
      Effect.gen(function* () {
        // 1. Check existing rules first (full chain)
        const agentRulePatterns = opts?.agentRules
        const agentRules = agentRulePatterns ? parseAgentPermissionPatterns(agentRulePatterns) : []
        const existing = evaluateChain(pattern, persistedRules, agentRules, configRules)

        if (existing === "allow") return "allow" as Action
        if (existing === "deny") return "deny" as Action

        // 2. Publish PermissionRequested event and wait for response
        const id = "perm_" + Math.random().toString(36).slice(2, 10)
        const deferred = yield* Deferred.make<Action, Error>()
        const startedAt = yield* Clock.currentTimeMillis

        pendingRequests.set(id, { deferred, pattern, startedAt })

        yield* bus.publish(PermissionRequested, {
          id,
          pattern,
          sessionId: opts?.sessionId ?? undefined,
          agentId: opts?.agentId ?? undefined,
        })

        log.info("permission ask published", { id, pattern })

        // 3. Wait for response with timeout
        const result = yield* Deferred.await(deferred).pipe(
          Effect.timeoutOption(PERMISSION_TIMEOUT_MS),
        )

        if (Option.isNone(result)) {
          pendingRequests.delete(id)
          log.info("permission request timed out", { id, pattern })
          return "deny" as Action
        }

        return result.value
      }),

    handleResponse: (id: string, action: Action) =>
      Effect.gen(function* () {
        const pending = pendingRequests.get(id)
        if (!pending) return false

        pendingRequests.delete(id)
        yield* Deferred.succeed(pending.deferred, action)
        return true
      }),

    setPersistedRules: (rules: ReadonlyArray<Rule>) =>
      Effect.sync(() => {
        persistedRules = rules
      }),

    getPersistedRules: () => persistedRules,
  }
}

// ── Layer ─────────────────────────────────────────────────────

export const PermissionLive = Layer.effect(
  PermissionService,
  Effect.gen(function* () {
    const cfg = yield* ConfigService
    const bus = yield* BusService
    return makePermission(cfg.config.permission, bus)
  }),
)
