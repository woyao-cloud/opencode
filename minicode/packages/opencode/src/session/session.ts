import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import { Global } from "@minicode/core/global"
import * as InstanceState from "@/effect/instance-state"
import { SessionID, ascendingSessionID } from "./id"
import { MessageID, PartID, ascendingMessageID, ascendingPartID } from "./schema"
import { SessionTable, MessageTable, PartTable } from "./session.sql"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { Database } from "bun:sqlite"
import { eq, desc } from "drizzle-orm"
import { Permission } from "@/permission"
const log = Log.create({ service: "session" })
export const Part = Schema.Struct({ id: PartID, type: Schema.Literals(["text", "tool-call", "tool-result"]), text: Schema.optional(Schema.String), toolName: Schema.optional(Schema.String), toolInput: Schema.optional(Schema.Unknown), toolResult: Schema.optional(Schema.Unknown) })
export type Part = Schema.Schema.Type<typeof Part>
export const Message = Schema.Struct({ id: MessageID, sessionID: SessionID, role: Schema.Literals(["user", "assistant", "tool"]), parts: Schema.Array(Part), time: Schema.Struct({ created: Schema.Number }) })
export type Message = Schema.Schema.Type<typeof Message>
export const Info = Schema.Struct({ id: SessionID, projectID: Schema.String, directory: Schema.String, title: Schema.String, agent: Schema.optional(Schema.String), model: Schema.optional(Schema.Struct({ providerID: Schema.String, modelID: Schema.String })), parentID: Schema.optional(SessionID), permission: Schema.optional(Permission.Ruleset), version: Schema.Number, tokens: Schema.Struct({ input: Schema.Number, output: Schema.Number }), cost: Schema.Number, time: Schema.Struct({ created: Schema.Number, updated: Schema.Number }) })
export type Info = Schema.Schema.Type<typeof Info>
export interface Interface {
  readonly create: (input: { projectID: string; directory: string; title?: string; agent?: string; parentID?: SessionID; permission?: Permission.Ruleset }) => Effect.Effect<Info, unknown, unknown>
  readonly get: (id: SessionID) => Effect.Effect<Info | undefined, unknown, unknown>
  readonly list: () => Effect.Effect<ReadonlyArray<Info>, unknown, unknown>
  readonly appendMessage: (input: { sessionID: SessionID; role: Message["role"]; parts: ReadonlyArray<Part> }) => Effect.Effect<Message, unknown, unknown>
  readonly messages: (sessionID: SessionID) => Effect.Effect<ReadonlyArray<Message>, unknown, unknown>
}
export class Service extends Context.Service<Service, Interface>()("@minicode/Session") {}
type State = { db: ReturnType<typeof drizzle> }
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* (InstanceState.make<State>(Effect.fn("Session.state")(function* (ctx: any) {
    log.info("opening db", { directory: ctx.directory })
    const sqlite = new Database(Global.Path.db)
    const db = drizzle(sqlite)
    sqlite.run("CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, directory TEXT NOT NULL, title TEXT NOT NULL, agent TEXT, model TEXT, parent_id TEXT, permission TEXT, version INTEGER NOT NULL DEFAULT 1, tokens_input INTEGER NOT NULL DEFAULT 0, tokens_output INTEGER NOT NULL DEFAULT 0, cost INTEGER NOT NULL DEFAULT 0, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL)")
    sqlite.run("CREATE TABLE IF NOT EXISTS message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT, time_created INTEGER NOT NULL)")
    sqlite.run("CREATE TABLE IF NOT EXISTS part (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, type TEXT NOT NULL, text TEXT, tool_name TEXT, tool_input TEXT, tool_result TEXT, time_created INTEGER NOT NULL)")
    return { db }
  }) as any) as any)
  const create = Effect.fn("Session.create")(function* (input: { projectID: string; directory: string; title?: string; agent?: string; parentID?: SessionID; permission?: Permission.Ruleset }) {
    const now = Date.now()
    const id = ascendingSessionID()
    const info: Info = { id, projectID: input.projectID, directory: input.directory, title: input.title ?? "New session - " + new Date().toISOString(), agent: input.agent, parentID: input.parentID, permission: input.permission, version: 1, tokens: { input: 0, output: 0 }, cost: 0, time: { created: now, updated: now } }
    const { db } = (yield* InstanceState.get(state)) as State
    yield* Effect.tryPromise({ try: async () => { await (db.insert(SessionTable) as any).values({ id: info.id as string, project_id: info.projectID, directory: info.directory, title: info.title, agent: info.agent ?? null, model: null, parent_id: info.parentID as string ?? null, permission: info.permission ? JSON.stringify(info.permission) : null, version: info.version, tokens_input: 0, tokens_output: 0, cost: 0, time_created: now, time_updated: now } as any) }, catch: (e) => { log.error("insert session failed", { e }) } })
    log.info("created", { id: info.id })
    return info
  })
  const get = Effect.fn("Session.get")(function* (id: SessionID) {
    const { db } = (yield* InstanceState.get(state)) as State
    return yield* Effect.tryPromise({ try: async () => { const rows = await db.select().from(SessionTable).where(eq(SessionTable.id, id as string)); if (rows.length === 0) return undefined; const r = rows[0]!; return { id: SessionID.make(r.id), projectID: r.project_id, directory: r.directory, title: r.title, agent: r.agent ?? undefined, model: undefined, parentID: r.parent_id ? SessionID.make(r.parent_id) : undefined, permission: r.permission ? JSON.parse(r.permission as string) : undefined, version: r.version, tokens: { input: r.tokens_input, output: r.tokens_output }, cost: r.cost, time: { created: r.time_created, updated: r.time_updated } } as Info }, catch: () => undefined })
  })
  const list = Effect.fn("Session.list")(function* () {
    const { db } = (yield* InstanceState.get(state)) as State
    return yield* Effect.tryPromise({ try: async () => { const rows = await db.select().from(SessionTable).orderBy(desc(SessionTable.time_created)); return rows.map((r: any) => ({ id: SessionID.make(r.id), projectID: r.project_id, directory: r.directory, title: r.title, agent: r.agent ?? undefined, model: undefined, parentID: r.parent_id ? SessionID.make(r.parent_id) : undefined, permission: r.permission ? JSON.parse(r.permission as string) : undefined, version: r.version, tokens: { input: r.tokens_input, output: r.tokens_output }, cost: r.cost, time: { created: r.time_created, updated: r.time_updated } } as Info)) }, catch: () => [] as Info[] })
  })
  const appendMessage = Effect.fn("Session.appendMessage")(function* (input: { sessionID: SessionID; role: Message["role"]; parts: ReadonlyArray<Part> }) {
    const { db } = (yield* InstanceState.get(state)) as State
    const now = Date.now()
    const msgID = ascendingMessageID()
    const msg: Message = { id: msgID, sessionID: input.sessionID, role: input.role, parts: [...input.parts], time: { created: now } }
    yield* Effect.tryPromise({ try: async () => { await (db.insert(MessageTable) as any).values({ id: msgID as string, session_id: input.sessionID as string, role: input.role, content: null, time_created: now }); for (const p of input.parts) { await (db.insert(PartTable) as any).values({ id: p.id as string, message_id: msgID as string, type: p.type, text: p.text ?? null, tool_name: p.toolName ?? null, tool_input: p.toolInput ? JSON.stringify(p.toolInput) : null, tool_result: p.toolResult ? JSON.stringify(p.toolResult) : null, time_created: now }) } }, catch: (e) => { log.error("appendMessage failed", { e }) } })
    log.info("appended", { sessionID: input.sessionID, role: input.role })
    return msg
  })
  const messages = Effect.fn("Session.messages")(function* (sessionID: SessionID) {
    const { db } = (yield* InstanceState.get(state)) as State
    return yield* Effect.tryPromise({
      try: async () => {
        const msgRows = await db.select().from(MessageTable).where(eq(MessageTable.session_id, sessionID as string))
        const result: Message[] = []
        for (const m of msgRows) {
          const partRows = await db.select().from(PartTable).where(eq(PartTable.message_id, m.id))
          result.push({
            id: MessageID.make(m.id),
            sessionID,
            role: m.role as Message["role"],
            parts: partRows.map((p: any) => ({
              id: PartID.make(p.id),
              type: p.type as Part["type"],
              text: p.text ?? undefined,
              toolName: p.tool_name ?? undefined,
              toolInput: p.tool_input ? JSON.parse(p.tool_input) : undefined,
              toolResult: p.tool_result ? JSON.parse(p.tool_result) : undefined,
            })),
            time: { created: m.time_created },
          })
        }
        return result
      },
      catch: () => [] as Message[],
    })
  })
  return Service.of({ create, get, list, appendMessage, messages } as any)
}))
export const defaultLayer = layer
export * as Session from "./session"
