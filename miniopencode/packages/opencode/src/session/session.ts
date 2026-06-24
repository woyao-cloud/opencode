// ── Session Service — CRUD for sessions and messages ────────
// Uses raw SQL (bun:sqlite) with positional `?` parameters.

import { Effect, Context, Layer } from "effect"
import type { Database } from "bun:sqlite"
import { getDb } from "./db"
import type { SessionRow, MessageRow, SessionStatus } from "./schema"
import { sessionId, messageId } from "./id"
import { BusService } from "@/bus/index"
import { SessionCreated, SessionUpdated, SessionDeleted, MessageAdded } from "@/bus/bus-event"

export type { SessionRow, MessageRow, SessionStatus }

// ── Service Shape ───────────────────────────────────────────

export interface SessionShape {
  readonly create: (opts?: { title?: string; agentId?: string; modelId?: string }) => Effect.Effect<SessionRow, Error>
  readonly get: (id: string) => Effect.Effect<SessionRow | undefined, Error>
  readonly list: (limit?: number) => Effect.Effect<ReadonlyArray<SessionRow>, Error>
  readonly updateStatus: (id: string, status: SessionStatus) => Effect.Effect<void, Error>
  readonly delete: (id: string) => Effect.Effect<void, Error>
  readonly appendMessage: (sessionId: string, msg: {
    role: string
    content: string
    toolName?: string
    toolArgs?: Record<string, unknown>
  }) => Effect.Effect<MessageRow, Error>
  readonly getMessages: (sessionId: string) => Effect.Effect<ReadonlyArray<MessageRow>, Error>
}

export class SessionService extends Context.Service<SessionService, SessionShape>()("@miniopencode/Session") {}

// ── Factory ─────────────────────────────────────────────────

export function makeSession(): Effect.Effect<SessionShape, never, BusService> {
  return Effect.gen(function* () {
    const db: Database = getDb()
    const bus = yield* BusService

    // All statements use positional ? parameters — bun:sqlite accepts
    // a plain array or an object with $‑prefixed keys for named params.
    const insertSession = db.prepare(`
      INSERT INTO session (id, status, title, created_at, updated_at, agent_id, model_id, metadata_json, permission_rules_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const updateSessionStatus = db.prepare(`
      UPDATE session SET status = ?, updated_at = ? WHERE id = ?
    `)

    const insertMessage = db.prepare(`
      INSERT INTO message (id, session_id, role, content, created_at, tool_name, tool_args_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const svc: SessionShape = {
      create: (opts) =>
        Effect.gen(function* () {
          const now = Date.now()
          const id = sessionId()
          const row: SessionRow = {
            id,
            status: "idle",
            title: opts?.title ?? "",
            created_at: now,
            updated_at: now,
            agent_id: opts?.agentId ?? "default",
            model_id: opts?.modelId ?? null,
            metadata_json: null,
            permission_rules_json: null,
          }
          insertSession.run(
            row.id, row.status, row.title,
            row.created_at, row.updated_at,
            row.agent_id, row.model_id, row.metadata_json,
            row.permission_rules_json,
          )
          yield* bus.publish(SessionCreated, { id })
          return row
        }),

      get: (id) =>
        Effect.sync(() => {
          const rows = db.query("SELECT * FROM session WHERE id = ?").all(id) as Array<Record<string, unknown>>
          if (rows.length === 0) return undefined
          return hydrateSessionRow(rows[0])
        }),

      list: (limit) =>
        Effect.sync(() => {
          const sql = limit
            ? db.query("SELECT * FROM session ORDER BY created_at DESC LIMIT ?")
            : db.query("SELECT * FROM session ORDER BY created_at DESC")
          const rows = limit ? sql.all(limit) : sql.all()
          return (rows as Array<Record<string, unknown>>).map(hydrateSessionRow)
        }),

      updateStatus: (id, status) =>
        Effect.gen(function* () {
          updateSessionStatus.run(status, Date.now(), id)
          yield* bus.publish(SessionUpdated, { id, status })
        }),

      delete: (id) =>
        Effect.gen(function* () {
          db.run("DELETE FROM message WHERE session_id = ?", [id] as any)
          db.run("DELETE FROM session WHERE id = ?", [id] as any)
          yield* bus.publish(SessionDeleted, { id })
        }),

      appendMessage: (sid, msg) =>
        Effect.gen(function* () {
          const now = Date.now()
          const id = messageId()
          const row: MessageRow = {
            id,
            session_id: sid,
            role: msg.role as any,
            content: msg.content,
            created_at: now,
            tool_name: msg.toolName ?? null,
            tool_args_json: msg.toolArgs ? JSON.stringify(msg.toolArgs) : null,
          }
          insertMessage.run(row.id, row.session_id, row.role, row.content, row.created_at, row.tool_name, row.tool_args_json)
          db.run("UPDATE session SET updated_at = ? WHERE id = ?", [now, sid] as any)
          yield* bus.publish(MessageAdded, { sessionId: sid, messageId: id })
          return row
        }),

      getMessages: (sid) =>
        Effect.sync(() => {
          const rows = db.query("SELECT * FROM message WHERE session_id = ? ORDER BY created_at ASC").all(sid) as Array<Record<string, unknown>>
          return rows.map(hydrateMessageRow)
        }),
    }

    return svc
  })
}

// ── Hydration helpers ───────────────────────────────────────

function hydrateSessionRow(row: Record<string, unknown>): SessionRow {
  return {
    id: row.id as string,
    status: row.status as SessionStatus,
    title: row.title as string,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    agent_id: row.agent_id as string,
    model_id: row.model_id as string | null,
    metadata_json: row.metadata_json as string | null,
    permission_rules_json: row.permission_rules_json as string | null,
  }
}

function hydrateMessageRow(row: Record<string, unknown>): MessageRow {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    role: row.role as any,
    content: row.content as string,
    created_at: row.created_at as number,
    tool_name: row.tool_name as string | null,
    tool_args_json: row.tool_args_json as string | null,
  }
}

// ── Layer ───────────────────────────────────────────────────

export const SessionLive = Layer.effect(SessionService, makeSession())

export * as Session from "./session"
