import os

base = r"D:\claude-code-project\opencode.ai\opencode\minicode\packages\opencode\src"

files = {}

files["bus/bus-event.ts"] = '''import { Schema } from "effect"
export type Definition<Type extends string = string, Properties extends Schema.Top = Schema.Top> = { readonly type: Type; readonly properties: Properties }
export function define<Type extends string, Properties extends Schema.Top>(type: Type, properties: Properties): Definition<Type, Properties> { return { type, properties } }
export * as BusEvent from "./bus-event"
'''

files["bus/index.ts"] = '''import { Effect, Exit, Layer, PubSub, Scope, Context, Stream, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import { EffectBridge } from "@/effect/bridge"
import { InstanceState } from "@/effect/instance-state"
import { makeRuntime } from "@/effect/run-service"
import { BusEvent } from "./bus-event"
const log = Log.create({ service: "bus" })
type BusProperties<D extends BusEvent.Definition<string, Schema.Top>> = Schema.Schema.Type<D["properties"]>
export const InstanceDisposed = BusEvent.define("server.instance.disposed", Schema.Struct({ directory: Schema.String }))
type Payload<D extends BusEvent.Definition = BusEvent.Definition> = { id: string; type: D["type"]; properties: BusProperties<D> }
type State = { wildcard: PubSub.PubSub<Payload>; typed: Map<string, PubSub.PubSub<Payload>> }
export interface Interface {
  readonly publish: <D extends BusEvent.Definition>(def: D, properties: BusProperties<D>, options?: { id?: string }) => Effect.Effect<void, unknown, unknown>
  readonly subscribe: <D extends BusEvent.Definition>(def: D) => Stream.Stream<Payload<D>, unknown, unknown>
  readonly subscribeAll: () => Stream.Stream<Payload, unknown, unknown>
  readonly subscribeCallback: <D extends BusEvent.Definition>(def: D, callback: (event: Payload<D>) => unknown) => Effect.Effect<() => void, unknown, unknown>
  readonly subscribeAllCallback: (callback: (event: any) => unknown) => Effect.Effect<() => void, unknown, unknown>
}
export class Service extends Context.Service<Service, Interface>()("@minicode/Bus") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* InstanceState.make<State>(Effect.fn("Bus.state")(function* (ctx) {
    const wildcard = yield* PubSub.unbounded<Payload>()
    const typed = new Map<string, PubSub.PubSub<Payload>>()
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      yield* PubSub.publish(wildcard, { type: InstanceDisposed.type, id: createID(), properties: { directory: ctx.directory } })
      yield* PubSub.shutdown(wildcard)
      for (const ps of typed.values()) yield* PubSub.shutdown(ps)
    }))
    return { wildcard, typed }
  }))
  function getOrCreate<D extends BusEvent.Definition>(s: State, def: D) {
    return Effect.gen(function* () {
      let ps = s.typed.get(def.type)
      if (!ps) { ps = yield* PubSub.unbounded<Payload>(); s.typed.set(def.type, ps) }
      return ps as unknown as PubSub.PubSub<Payload<D>>
    })
  }
  function publish<D extends BusEvent.Definition>(def: D, properties: BusProperties<D>, options?: { id?: string }) {
    return Effect.gen(function* () {
      const s = yield* InstanceState.get(state)
      const payload: Payload = { id: options?.id ?? createID(), type: def.type, properties }
      log.info("publishing", { type: def.type })
      const ps = s.typed.get(def.type)
      if (ps) yield* PubSub.publish(ps, payload)
      yield* PubSub.publish(s.wildcard, payload)
    })
  }
  function subscribe<D extends BusEvent.Definition>(def: D): Stream.Stream<Payload<D>> {
    log.info("subscribing", { type: def.type })
    return Stream.unwrap(Effect.gen(function* () { const s = yield* InstanceState.get(state); const ps = yield* getOrCreate(s, def); return Stream.fromPubSub(ps) })).pipe(Stream.ensuring(Effect.sync(() => log.info("unsubscribing", { type: def.type })))) as any
  }
  function subscribeAll(): Stream.Stream<Payload> {
    return Stream.unwrap(Effect.gen(function* () { const s = yield* InstanceState.get(state); return Stream.fromPubSub(s.wildcard) })) as any
  }
  function on<T>(pubsub: PubSub.PubSub<T>, type: string, callback: (event: T) => unknown) {
    return Effect.gen(function* () {
      const bridge = yield* EffectBridge.make()
      const scope = yield* Scope.make()
      const subscription = yield* Scope.provide(scope)(PubSub.subscribe(pubsub))
      yield* Scope.provide(scope)(Stream.fromSubscription(subscription).pipe(Stream.runForEach((msg) => Effect.tryPromise({ try: () => Promise.resolve().then(() => callback(msg)), catch: (cause) => { log.error("subscriber failed", { type, cause }) } }).pipe(Effect.ignore)), Effect.forkScoped))
      return () => { log.info("unsubscribing", { type }); bridge.fork(Scope.close(scope, Exit.void)) }
    })
  }
  const subscribeCallback = Effect.fn("Bus.subscribeCallback")(function* <D extends BusEvent.Definition>(def: D, callback: (event: Payload<D>) => unknown) { const s = yield* InstanceState.get(state); const ps = yield* getOrCreate(s, def); return yield* on(ps, def.type, callback) })
  const subscribeAllCallback = Effect.fn("Bus.subscribeAllCallback")(function* (callback: (event: any) => unknown) { const s = yield* InstanceState.get(state); return yield* on(s.wildcard, "*", callback) })
  return Service.of({ publish, subscribe, subscribeAll, subscribeCallback, subscribeAllCallback } as any)
}))
export const defaultLayer = layer
const { runPromise, runSync } = makeRuntime(Service, layer)
export function createID() { return "evt_" + Math.random().toString(36).slice(2, 10) }
export async function publish<D extends BusEvent.Definition>(def: D, properties: BusProperties<D>, options?: { id?: string }) { return runPromise((svc) => svc.publish(def, properties, options)) }
export function subscribe<D extends BusEvent.Definition>(def: D, callback: (event: Payload<D>) => unknown) { return runSync((svc: any) => svc.subscribeCallback(def, callback)) }
export function subscribeAll(callback: (event: any) => unknown) { return runSync((svc: any) => svc.subscribeAllCallback(callback)) }
export * as Bus from "."
'''

files["config/config.ts"] = '''import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import { InstanceState } from "@/effect/instance-state"
import path from "path"
const log = Log.create({ service: "config" })
export const ConfigAgent = Schema.Struct({ name: Schema.String, description: Schema.optional(Schema.String), model: Schema.optional(Schema.Struct({ providerID: Schema.String, modelID: Schema.String })), prompt: Schema.optional(Schema.String) })
export type ConfigAgent = Schema.Schema.Type<typeof ConfigAgent>
export const ConfigProvider = Schema.Struct({ id: Schema.String, name: Schema.optional(Schema.String), apiKey: Schema.optional(Schema.String), baseURL: Schema.optional(Schema.String) })
export type ConfigProvider = Schema.Schema.Type<typeof ConfigProvider>
export const Info = Schema.Struct({ agents: Schema.Array(ConfigAgent), providers: Schema.Array(ConfigProvider), permission: Schema.Record(Schema.String, Schema.Literals(["allow", "ask", "deny"])), instructions: Schema.optional(Schema.Array(Schema.String)) })
export type Info = Schema.Schema.Type<typeof Info>
export interface Interface { readonly get: () => Effect.Effect<Info, unknown, unknown>; readonly reload: () => Effect.Effect<Info, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Config") {}
function defaultConfig(): Info { return { agents: [{ name: "build", description: "Default build agent", prompt: "You are a helpful coding assistant." }], providers: [], permission: { "*": "allow" } } }
async function loadConfig(dir: string): Promise<Info> { const file = Bun.file(path.join(dir, "minicode.json")); if (!await file.exists()) return defaultConfig(); const raw = await file.json().catch(() => defaultConfig()); return { ...defaultConfig(), ...raw } }
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* InstanceState.make<Info>(Effect.fn("Config.state")(function* (ctx) { log.info("loading config", { dir: ctx.directory }); return yield* Effect.tryPromise({ try: () => loadConfig(ctx.directory), catch: () => defaultConfig() }) }))
  const get = Effect.fn("Config.get")(function* () { return yield* InstanceState.get(state) })
  const reload = Effect.fn("Config.reload")(function* () { yield* InstanceState.invalidate(state); return yield* InstanceState.get(state) })
  return Service.of({ get, reload } as any)
}))
export const defaultLayer = layer
export * as Config from "./config"
'''

files["permission/schema.ts"] = '''import { Schema } from "effect"
export const PermissionID = Schema.String.pipe(Schema.brand("PermissionID"))
export type PermissionID = Schema.Schema.Type<typeof PermissionID>
'''

files["permission/index.ts"] = '''import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
const log = Log.create({ service: "permission" })
export const Action = Schema.Literals(["allow", "deny", "ask"])
export type Action = Schema.Schema.Type<typeof Action>
export const Rule = Schema.Struct({ permission: Schema.String, pattern: Schema.String, action: Action })
export type Rule = Schema.Schema.Type<typeof Rule>
export const Ruleset = Schema.mutable(Schema.Array(Rule))
export type Ruleset = Schema.Schema.Type<typeof Ruleset>
export class RejectedError extends Schema.TaggedErrorClass<RejectedError>()("PermissionRejectedError", {}) { override get message() { return "Permission rejected" } }
export interface Request { readonly id: string; readonly permission: string; readonly patterns: ReadonlyArray<string> }
export interface Interface { readonly resolve: (permission: string, pattern: string) => Effect.Effect<Action, unknown, unknown>; readonly request: (input: Omit<Request, "id">) => Effect.Effect<Action, RejectedError, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Permission") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const resolve = Effect.fn("Permission.resolve")(function* (permission: string, pattern: string) { log.info("resolve", { permission, pattern }); return "allow" as Action })
  const request = Effect.fn("Permission.request")(function* (input: Omit<Request, "id">) { const action = yield* resolve(input.permission, input.patterns[0] ?? "*"); if (action === "deny") return yield* new RejectedError(); return action })
  return Service.of({ resolve, request } as any)
}))
export const defaultLayer = layer
export function fromConfig(map: Record<string, string>): Ruleset { return Object.entries(map).map(([pattern, action]) => ({ permission: pattern.split(":")[0] ?? "*", pattern: pattern.split(":")[1] ?? pattern, action: action as Action })) }
export * as Permission from "."
'''

files["plugin/index.ts"] = '''import { Context, Effect, Layer } from "effect"
import * as Log from "@minicode/core/util/log"
const log = Log.create({ service: "plugin" })
export interface PluginMeta { readonly id: string; readonly version: string }
export interface Interface { readonly list: () => Effect.Effect<ReadonlyArray<PluginMeta>, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Plugin") {}
export const layer = Layer.effect(Service, Effect.gen(function* () { log.info("plugin layer initialized (no-op)"); const list = Effect.fn("Plugin.list")(function* () { return [] as ReadonlyArray<PluginMeta> }); return Service.of({ list } as any) }))
export const defaultLayer = layer
export * as Plugin from "."
'''

files["skill/index.ts"] = '''import { Context, Effect, Layer } from "effect"
import * as Log from "@minicode/core/util/log"
const log = Log.create({ service: "skill" })
export interface Interface { readonly dirs: () => Effect.Effect<ReadonlyArray<string>, unknown, unknown>; readonly list: () => Effect.Effect<ReadonlyArray<{ id: string; name: string }>, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Skill") {}
export const layer = Layer.effect(Service, Effect.gen(function* () { log.info("skill layer initialized (no-op)"); const dirs = Effect.fn("Skill.dirs")(function* () { return [] as ReadonlyArray<string> }); const list = Effect.fn("Skill.list")(function* () { return [] as ReadonlyArray<{ id: string; name: string }> }); return Service.of({ dirs, list } as any) }))
export const defaultLayer = layer
export * as Skill from "."
'''

files["file/index.ts"] = '''import { Effect } from "effect"
import * as Log from "@minicode/core/util/log"
import { glob } from "glob"
const log = Log.create({ service: "file" })
export function read(filePath: string): Effect.Effect<string, Error> {
  return Effect.gen(function* () { log.debug("read", { path: filePath }); return yield* Effect.tryPromise({ try: async () => Bun.file(filePath).text(), catch: (e) => e instanceof Error ? e : new Error(String(e)) }) })
}
export function write(filePath: string, content: string): Effect.Effect<void, Error> {
  return Effect.gen(function* () { log.debug("write", { path: filePath }); yield* Effect.tryPromise({ try: async () => { await Bun.write(filePath, content) }, catch: (e) => e instanceof Error ? e : new Error(String(e)) }) })
}
export function exists(filePath: string): Effect.Effect<boolean, never> {
  return Effect.gen(function* () { return yield* Effect.tryPromise({ try: async () => Bun.file(filePath).exists(), catch: () => false }).pipe(Effect.catch(() => Effect.succeed(false))) })
}
export function scan(pattern: string, options?: { cwd?: string }): Effect.Effect<ReadonlyArray<string>, Error> {
  return Effect.gen(function* () { log.debug("scan", { pattern }); return yield* Effect.tryPromise({ try: async () => glob(pattern, { cwd: options?.cwd ?? process.cwd(), absolute: true }), catch: (e) => e instanceof Error ? e : new Error(String(e)) }) })
}
export * as File from "./index"
'''

files["git/index.ts"] = '''import { Effect } from "effect"
import * as Log from "@minicode/core/util/log"
const log = Log.create({ service: "git" })
function git(args: string[], cwd?: string): Effect.Effect<string, Error> {
  return Effect.gen(function* () { log.debug("git", { args }); return yield* Effect.tryPromise({ try: async () => { const proc = Bun.spawn(["git", ...args], { cwd: cwd ?? process.cwd(), stdout: "pipe", stderr: "pipe" }); const exitCode = await proc.exited; const stdout = await new Response(proc.stdout).text(); const stderr = await new Response(proc.stderr).text(); if (exitCode !== 0) throw new Error("git " + args.join(" ") + " failed: " + stderr); return stdout.trim() }, catch: (e) => e instanceof Error ? e : new Error(String(e)) }) })
}
export function branch(cwd?: string) { return git(["branch", "--show-current"], cwd) }
export function status(cwd?: string) { return git(["status", "--short"], cwd) }
export function diff(cwd?: string) { return git(["diff"], cwd) }
export function root(cwd?: string) { return git(["rev-parse", "--show-toplevel"], cwd) }
export * as Git from "./index"
'''

files["worktree/index.ts"] = '''import { Effect } from "effect"
import * as Log from "@minicode/core/util/log"
const log = Log.create({ service: "worktree" })
function git(args: string[], cwd?: string): Effect.Effect<string, Error> {
  return Effect.tryPromise({ try: async () => { const proc = Bun.spawn(["git", ...args], { cwd: cwd ?? process.cwd(), stdout: "pipe", stderr: "pipe" }); const exitCode = await proc.exited; const stdout = await new Response(proc.stdout).text(); const stderr = await new Response(proc.stderr).text(); if (exitCode !== 0) throw new Error("git " + args.join(" ") + " failed: " + stderr); return stdout.trim() }, catch: (e) => e instanceof Error ? e : new Error(String(e)) })
}
export function create(branch: string, path: string, cwd?: string): Effect.Effect<string, Error> { log.info("create", { branch, path }); return git(["worktree", "add", path, branch], cwd) }
export function list(cwd?: string): Effect.Effect<ReadonlyArray<{ path: string; branch: string }>, Error> { log.info("list"); return Effect.gen(function* () { const out = yield* git(["worktree", "list", "--porcelain"], cwd); return out.split("\\n").filter((l) => l.startsWith("worktree ")).map((l) => ({ path: l.slice(9), branch: "" })) }) }
export function remove(path: string, cwd?: string): Effect.Effect<void, Error> { log.info("remove", { path }); return Effect.gen(function* () { yield* git(["worktree", "remove", path], cwd) }) }
export * as Worktree from "./index"
'''

files["command/index.ts"] = '''import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import { InstanceState } from "@/effect/instance-state"
const log = Log.create({ service: "command" })
export const Definition = Schema.Struct({ name: Schema.String, description: Schema.optional(Schema.String), template: Schema.String })
export type Definition = Schema.Schema.Type<typeof Definition>
export interface Interface { readonly list: () => Effect.Effect<ReadonlyArray<Definition>, unknown, unknown>; readonly get: (name: string) => Effect.Effect<Definition | undefined, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Command") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* InstanceState.make<ReadonlyArray<Definition>>(Effect.fn("Command.state")(function* () { log.info("command layer initialized (empty)"); return [] as ReadonlyArray<Definition> }))
  const list = Effect.fn("Command.list")(function* () { return yield* InstanceState.get(state) })
  const get = Effect.fn("Command.get")(function* (name: string) { const cmds = yield* InstanceState.get(state); return cmds.find((c) => c.name === name) })
  return Service.of({ list, get } as any)
}))
export const defaultLayer = layer
export * as Command from "."
'''

files["agent/prompt/build.txt"] = "You are a helpful coding assistant. You answer questions clearly and concisely. When given a coding task, you write clean, minimal code that solves the problem."

files["agent/agent.ts"] = '''import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import { ProviderID, ModelID } from "@minicode/llm/schema/ids"
import PROMPT_BUILD from "./prompt/build.txt"
const log = Log.create({ service: "agent" })
export const Info = Schema.Struct({ name: Schema.String, description: Schema.optional(Schema.String), mode: Schema.Literals(["subagent", "primary", "all"]), permission: Permission.Ruleset, model: Schema.optional(Schema.Struct({ modelID: ModelID, providerID: ProviderID })), prompt: Schema.optional(Schema.String) })
export type Info = Schema.Schema.Type<typeof Info>
export interface Interface { readonly get: (agent: string) => Effect.Effect<Info, unknown, unknown>; readonly list: () => Effect.Effect<ReadonlyArray<Info>, unknown, unknown>; readonly defaultAgent: () => Effect.Effect<string, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Agent") {}
function defaultInfo(): Info { return { name: "build", description: "Default build agent", mode: "primary", permission: [{ permission: "*", pattern: "*", action: "allow" }], prompt: PROMPT_BUILD } }
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service
  const state = yield* InstanceState.make<ReadonlyArray<Info>>(Effect.fn("Agent.state")(function* (ctx) {
    const cfg = yield* config.get()
    const fromConfig = cfg.agents.map((a: any): Info => ({ name: a.name, description: a.description, mode: "primary", permission: [{ permission: "*", pattern: "*", action: "allow" }], prompt: a.prompt, model: a.model ? { modelID: ModelID.make(a.model.modelID), providerID: ProviderID.make(a.model.providerID) } : undefined }))
    const agents = fromConfig.length > 0 ? fromConfig : [defaultInfo()]
    log.info("loaded agents", { count: agents.length })
    return agents
  }))
  const get = Effect.fn("Agent.get")(function* (name: string) { const agents = yield* InstanceState.get(state); return agents.find((a) => a.name === name) ?? defaultInfo() })
  const list = Effect.fn("Agent.list")(function* () { return yield* InstanceState.get(state) })
  const defaultAgent = Effect.fn("Agent.defaultAgent")(function* () { return "build" })
  return Service.of({ get, list, defaultAgent } as any)
}))
export const defaultLayer = layer
export * as Agent from "./agent"
'''

files["session/id.ts"] = '''import { Schema } from "effect"
export const SessionID = Schema.String.pipe(Schema.brand("SessionID"))
export type SessionID = Schema.Schema.Type<typeof SessionID>
export function ascendingSessionID(id?: string) { return SessionID.make("ses_" + (id ?? Math.random().toString(36).slice(2, 12))) }
'''

files["session/schema.ts"] = '''import { Schema } from "effect"
import { SessionID } from "./id"
export const MessageID = Schema.String.pipe(Schema.brand("MessageID"))
export type MessageID = Schema.Schema.Type<typeof MessageID>
export const PartID = Schema.String.pipe(Schema.brand("PartID"))
export type PartID = Schema.Schema.Type<typeof PartID>
export function ascendingMessageID(id?: string) { return MessageID.make("msg_" + (id ?? Math.random().toString(36).slice(2, 12))) }
export function ascendingPartID(id?: string) { return PartID.make("prt_" + (id ?? Math.random().toString(36).slice(2, 12))) }
'''

files["session/session.sql.ts"] = '''import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
export const SessionTable = sqliteTable("session", {
  id: text("id").primaryKey(), project_id: text("project_id").notNull(), directory: text("directory").notNull(), title: text("title").notNull(), agent: text("agent"), model: text("model", { mode: "json" }), parent_id: text("parent_id"), version: integer("version").notNull().default(1), tokens_input: integer("tokens_input").notNull().default(0), tokens_output: integer("tokens_output").notNull().default(0), cost: integer("cost").notNull().default(0), time_created: integer("time_created").notNull(), time_updated: integer("time_updated").notNull(),
})
export const MessageTable = sqliteTable("message", { id: text("id").primaryKey(), session_id: text("session_id").notNull(), role: text("role").notNull(), content: text("content", { mode: "json" }), time_created: integer("time_created").notNull() })
export const PartTable = sqliteTable("part", { id: text("id").primaryKey(), message_id: text("message_id").notNull(), type: text("type").notNull(), text: text("text"), tool_name: text("tool_name"), tool_input: text("tool_input", { mode: "json" }), tool_result: text("tool_result", { mode: "json" }), time_created: integer("time_created").notNull() })
'''

files["session/session.ts"] = '''import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import { Global } from "@minicode/core/global"
import { InstanceState } from "@/effect/instance-state"
import { SessionID, ascendingSessionID } from "./id"
import { MessageID, PartID, ascendingMessageID, ascendingPartID } from "./schema"
import { SessionTable, MessageTable, PartTable } from "./session.sql"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { Database } from "bun:sqlite"
import { eq, desc } from "drizzle-orm"
const log = Log.create({ service: "session" })
export const Part = Schema.Struct({ id: PartID, type: Schema.Literals(["text", "tool-call", "tool-result"]), text: Schema.optional(Schema.String), toolName: Schema.optional(Schema.String), toolInput: Schema.optional(Schema.Unknown), toolResult: Schema.optional(Schema.Unknown) })
export type Part = Schema.Schema.Type<typeof Part>
export const Message = Schema.Struct({ id: MessageID, sessionID: SessionID, role: Schema.Literals(["user", "assistant", "tool"]), parts: Schema.Array(Part), time: Schema.Struct({ created: Schema.Number }) })
export type Message = Schema.Schema.Type<typeof Message>
export const Info = Schema.Struct({ id: SessionID, projectID: Schema.String, directory: Schema.String, title: Schema.String, agent: Schema.optional(Schema.String), model: Schema.optional(Schema.Struct({ providerID: Schema.String, modelID: Schema.String })), parentID: Schema.optional(SessionID), version: Schema.Number, tokens: Schema.Struct({ input: Schema.Number, output: Schema.Number }), cost: Schema.Number, time: Schema.Struct({ created: Schema.Number, updated: Schema.Number }) })
export type Info = Schema.Schema.Type<typeof Info>
export interface Interface {
  readonly create: (input: { projectID: string; directory: string; title?: string; agent?: string }) => Effect.Effect<Info, unknown, unknown>
  readonly get: (id: SessionID) => Effect.Effect<Info | undefined, unknown, unknown>
  readonly list: () => Effect.Effect<ReadonlyArray<Info>, unknown, unknown>
  readonly appendMessage: (input: { sessionID: SessionID; role: Message["role"]; parts: ReadonlyArray<Part> }) => Effect.Effect<Message, unknown, unknown>
  readonly messages: (sessionID: SessionID) => Effect.Effect<ReadonlyArray<Message>, unknown, unknown>
}
export class Service extends Context.Service<Service, Interface>()("@minicode/Session") {}
type State = { db: ReturnType<typeof drizzle> }
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* InstanceState.make<State>(Effect.fn("Session.state")(function* (ctx) {
    log.info("opening db", { directory: ctx.directory })
    const sqlite = new Database(Global.Path.db)
    const db = drizzle(sqlite)
    sqlite.run("CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, directory TEXT NOT NULL, title TEXT NOT NULL, agent TEXT, model TEXT, parent_id TEXT, version INTEGER NOT NULL DEFAULT 1, tokens_input INTEGER NOT NULL DEFAULT 0, tokens_output INTEGER NOT NULL DEFAULT 0, cost INTEGER NOT NULL DEFAULT 0, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL)")
    sqlite.run("CREATE TABLE IF NOT EXISTS message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT, time_created INTEGER NOT NULL)")
    sqlite.run("CREATE TABLE IF NOT EXISTS part (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, type TEXT NOT NULL, text TEXT, tool_name TEXT, tool_input TEXT, tool_result TEXT, time_created INTEGER NOT NULL)")
    return { db }
  }))
  const create = Effect.fn("Session.create")(function* (input: { projectID: string; directory: string; title?: string; agent?: string }) {
    const now = Date.now()
    const id = ascendingSessionID()
    const info: Info = { id, projectID: input.projectID, directory: input.directory, title: input.title ?? "New session - " + new Date().toISOString(), agent: input.agent, parentID: undefined, version: 1, tokens: { input: 0, output: 0 }, cost: 0, time: { created: now, updated: now } }
    const { db } = yield* InstanceState.get(state)
    yield* Effect.tryPromise({ try: async () => { await db.insert(SessionTable).values({ id: info.id as string, project_id: info.projectID, directory: info.directory, title: info.title, agent: info.agent ?? null, model: null, parent_id: null, version: info.version, tokens_input: 0, tokens_output: 0, cost: 0, time_created: now, time_updated: now }) }, catch: (e) => { log.error("insert session failed", { e }) } })
    log.info("created", { id: info.id })
    return info
  })
  const get = Effect.fn("Session.get")(function* (id: SessionID) {
    const { db } = yield* InstanceState.get(state)
    return yield* Effect.tryPromise({ try: async () => { const rows = await db.select().from(SessionTable).where(eq(SessionTable.id, id as string)); if (rows.length === 0) return undefined; const r = rows[0]; return { id: SessionID.make(r.id), projectID: r.project_id, directory: r.directory, title: r.title, agent: r.agent ?? undefined, model: undefined, parentID: r.parent_id ? SessionID.make(r.parent_id) : undefined, version: r.version, tokens: { input: r.tokens_input, output: r.tokens_output }, cost: r.cost, time: { created: r.time_created, updated: r.time_updated } } as Info }, catch: () => undefined })
  })
  const list = Effect.fn("Session.list")(function* () {
    const { db } = yield* InstanceState.get(state)
    return yield* Effect.tryPromise({ try: async () => { const rows = await db.select().from(SessionTable).orderBy(desc(SessionTable.time_created)); return rows.map((r) => ({ id: SessionID.make(r.id), projectID: r.project_id, directory: r.directory, title: r.title, agent: r.agent ?? undefined, model: undefined, parentID: undefined, version: r.version, tokens: { input: r.tokens_input, output: r.tokens_output }, cost: r.cost, time: { created: r.time_created, updated: r.time_updated } } as Info)) }, catch: () => [] as Info[] })
  })
  const appendMessage = Effect.fn("Session.appendMessage")(function* (input: { sessionID: SessionID; role: Message["role"]; parts: ReadonlyArray<Part> }) {
    const { db } = yield* InstanceState.get(state)
    const now = Date.now()
    const msgID = ascendingMessageID()
    const msg: Message = { id: msgID, sessionID: input.sessionID, role: input.role, parts: [...input.parts], time: { created: now } }
    yield* Effect.tryPromise({ try: async () => { await db.insert(MessageTable).values({ id: msgID as string, session_id: input.sessionID as string, role: input.role, content: null, time_created: now }); for (const p of input.parts) { await db.insert(PartTable).values({ id: p.id as string, message_id: msgID as string, type: p.type, text: p.text ?? null, tool_name: p.toolName ?? null, tool_input: p.toolInput ? JSON.stringify(p.toolInput) : null, tool_result: p.toolResult ? JSON.stringify(p.toolResult) : null, time_created: now }) } }, catch: (e) => { log.error("appendMessage failed", { e }) } })
    log.info("appended", { sessionID: input.sessionID, role: input.role })
    return msg
  })
  const messages = Effect.fn("Session.messages")(function* (sessionID: SessionID) {
    const { db } = yield* InstanceState.get(state)
    return yield* Effect.tryPromise({ try: async () => { const msgRows = await db.select().from(MessageTable).where(eq(MessageTable.session_id, sessionID as string)); const result: Message[] = []; for (const m of msgRows) { const partRows = await db.select().from(PartTable).where(eq(PartTable.message_id, m.id)); result.push({ id: MessageID.make(m.id), sessionID, role: m.role as Message["role"], parts: partRows.map((p) => ({ id: PartID.make(p.id), type: p.type as Part["type"], text: p.text ?? undefined, toolName: p.tool_name ?? undefined, toolInput: p.tool_input ? JSON.parse(p.tool_input) : undefined, toolResult: p.tool_result ? JSON.parse(p.tool_result) : undefined })), time: { created: m.time_created } }) } return result }, catch: () => [] as Message[] })
  })
  return Service.of({ create, get, list, appendMessage, messages } as any)
}))
export const defaultLayer = layer
export * as Session from "."
'''

files["session/message.ts"] = '''import { SessionID } from "./id"
import { ascendingPartID } from "./schema"
import { Session } from "./session"
export function appendText(input: { sessionID: SessionID; role: "user" | "assistant" | "tool"; text: string }) {
  return Session.appendMessage({ sessionID: input.sessionID, role: input.role, parts: [{ id: ascendingPartID(), type: "text", text: input.text }] })
}
export * as Message from "."
'''

files["tool/tool.ts"] = '''import { Effect, Schema } from "effect"
import type { SessionID } from "@/session/id"
import type { MessageID } from "@/session/schema"
export interface ToolContext { sessionID: SessionID; messageID: MessageID; agent: string; callID?: string }
export interface ExecuteResult { title: string; output: string; metadata?: Record<string, unknown> }
export interface Def<P extends Schema.Decoder<unknown> = Schema.Decoder<unknown>> { id: string; description: string; parameters: P; execute(args: Schema.Schema.Type<P>, ctx: ToolContext): Effect.Effect<ExecuteResult> }
export type DefWithoutID<P extends Schema.Decoder<unknown>> = Omit<Def<P>, "id">
export interface Info<P extends Schema.Decoder<unknown> = Schema.Decoder<unknown>> { id: string; init: () => Effect.Effect<DefWithoutID<P>> }
export function define<P extends Schema.Decoder<unknown>>(id: string, init: Effect.Effect<DefWithoutID<P>>): Effect.Effect<Info<P>, never, never> { return Effect.gen(function* () { const resolved = yield* init; return { id, init: () => Effect.succeed(resolved) } }) }
export function init<P extends Schema.Decoder<unknown>>(info: Info<P>): Effect.Effect<Def<P>> { return Effect.gen(function* () { const d = yield* info.init(); return { ...d, id: info.id } }) }
export * as Tool from "./tool"
'''

files["tool/read.ts"] = '''import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "./tool"
import { File } from "@/file"
const Parameters = Schema.Struct({ filePath: Schema.String.annotate({ description: "Absolute path to the file to read" }), offset: Schema.optional(Schema.Number), limit: Schema.optional(Schema.Number) })
export const ReadTool = Tool.define("read", Effect.gen(function* () { return { description: "Read the contents of a file.", parameters: Parameters, execute: (args) => Effect.gen(function* () { const content = yield* File.read(args.filePath); const lines = content.split("\\n"); const offset = args.offset ?? 1; const limit = args.limit ?? 2000; const slice = lines.slice(offset - 1, offset - 1 + limit); return { title: "Read " + path.basename(args.filePath), output: slice.join("\\n"), metadata: { path: args.filePath, lines: slice.length } } }) } }))
export * as Read from "./read"
'''

files["tool/write.ts"] = '''import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "./tool"
import { File } from "@/file"
const Parameters = Schema.Struct({ filePath: Schema.String.annotate({ description: "Absolute path to the file to write" }), content: Schema.String.annotate({ description: "Content to write" }) })
export const WriteTool = Tool.define("write", Effect.gen(function* () { return { description: "Write content to a file.", parameters: Parameters, execute: (args) => Effect.gen(function* () { yield* File.write(args.filePath, args.content); return { title: "Write " + path.basename(args.filePath), output: "Wrote " + args.content.length + " bytes to " + args.filePath, metadata: { path: args.filePath, bytes: args.content.length } } }) } }))
export * as Write from "./write"
'''

files["tool/bash.ts"] = '''import { Effect, Schema } from "effect"
import * as Tool from "./tool"
const Parameters = Schema.Struct({ command: Schema.String.annotate({ description: "Shell command to execute" }), cwd: Schema.optional(Schema.String).annotate({ description: "Working directory" }) })
export const BashTool = Tool.define("bash", Effect.gen(function* () { return { description: "Execute a shell command and return stdout/stderr.", parameters: Parameters, execute: (args) => Effect.gen(function* () { const proc = Bun.spawn(["sh", "-c", args.command], { cwd: args.cwd ?? process.cwd(), stdout: "pipe", stderr: "pipe" }); const exitCode = yield* Effect.tryPromise({ try: async () => proc.exited, catch: (e) => e instanceof Error ? e : new Error(String(e)) }); const stdout = await new Response(proc.stdout).text(); const stderr = await new Response(proc.stderr).text(); const output = exitCode === 0 ? stdout : "exit=" + exitCode + "\\nstdout=" + stdout + "\\nstderr=" + stderr; return { title: args.command.slice(0, 60), output, metadata: { exitCode, command: args.command } } }) } }))
export * as Bash from "./bash"
'''

files["tool/registry.ts"] = '''import { Context, Effect, Layer } from "effect"
import * as Log from "@minicode/core/util/log"
import * as Tool from "./tool"
import { ReadTool } from "./read"
import { WriteTool } from "./write"
import { BashTool } from "./bash"
const log = Log.create({ service: "tool.registry" })
export interface Interface { readonly ids: () => Effect.Effect<ReadonlyArray<string>, unknown, unknown>; readonly all: () => Effect.Effect<ReadonlyArray<Tool.Def>, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/ToolRegistry") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const tools: Tool.Def[] = []
  for (const info of [ReadTool, WriteTool, BashTool]) { const def = yield* Tool.init(info as any); tools.push(def); log.info("registered tool", { id: def.id }) }
  const ids = Effect.fn("ToolRegistry.ids")(function* () { return tools.map((t) => t.id) })
  const all = Effect.fn("ToolRegistry.all")(function* () { return tools })
  return Service.of({ ids, all } as any)
}))
export const defaultLayer = layer
export * as ToolRegistry from "."
'''

files["project/project.ts"] = '''import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import { InstanceState } from "@/effect/instance-state"
import { InstanceRef, type InstanceContext } from "@/effect/instance-ref"
import { Git } from "@/git"
const log = Log.create({ service: "project" })
export const ProjectID = Schema.String.pipe(Schema.brand("ProjectID"))
export type ProjectID = Schema.Schema.Type<typeof ProjectID>
export const Info = Schema.Struct({ id: ProjectID, name: Schema.String, directory: Schema.String, worktree: Schema.String })
export type Info = Schema.Schema.Type<typeof Info>
export interface Interface { readonly current: () => Effect.Effect<Info, unknown, unknown>; readonly list: () => Effect.Effect<ReadonlyArray<Info>, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Project") {}
function makeProjectID(dir: string): ProjectID { return ProjectID.make(dir.replace(/[^a-zA-Z0-9]/g, "_").slice(-64)) }
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* InstanceState.make<Info>(Effect.fn("Project.state")(function* (ctx: InstanceContext) {
    log.info("project init", { directory: ctx.directory })
    const worktree = yield* Git.root(ctx.directory).pipe(Effect.catch(() => Effect.succeed("/")))
    return { id: makeProjectID(ctx.directory), name: ctx.directory.split("/").pop() ?? ctx.directory, directory: ctx.directory, worktree } as Info
  }))
  const current = Effect.fn("Project.current")(function* () { return yield* InstanceState.get(state) })
  const list = Effect.fn("Project.list")(function* () { const info = yield* InstanceState.get(state); return [info] })
  return Service.of({ current, list } as any)
}))
export const defaultLayer = layer
export * as Project from "."
'''

files["project/bootstrap.ts"] = '''import { Layer } from "effect"
import { InstanceRef } from "@/effect/instance-ref"
import { Config } from "@/config/config"
import { Bus } from "@/bus"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { Skill } from "@/skill"
import { Agent } from "@/agent/agent"
import { Session } from "@/session/session"
import { ToolRegistry } from "@/tool/registry"
import { Project } from "@/project/project"
import { Command } from "@/command"
export const InstanceLayer = Layer.mergeAll(Config.defaultLayer, Bus.defaultLayer, Permission.defaultLayer, Plugin.defaultLayer, Skill.defaultLayer, Agent.defaultLayer, Session.defaultLayer, ToolRegistry.defaultLayer, Project.defaultLayer, Command.defaultLayer)
export const DefaultInstanceRef = Layer.succeed(InstanceRef, { directory: process.cwd(), worktree: "/" })
export * as Bootstrap from "./bootstrap"
'''

files["project/index.ts"] = '''export * as Project from "./project"
export * as Bootstrap from "./bootstrap"
export { InstanceRef, type InstanceContext } from "@/effect/instance-ref"
'''

files["server/server.ts"] = '''import { Effect, Layer, Context } from "effect"
import * as Log from "@minicode/core/util/log"
import { createServer } from "node:http"
const log = Log.create({ service: "server" })
export interface Listener { hostname: string; port: number; url: URL }
export interface Interface { readonly listen: (opts: { port: number; hostname: string }) => Effect.Effect<Listener, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Server") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const listen = Effect.fn("Server.listen")(function* (opts: { port: number; hostname: string }) {
    log.info("starting server", { port: opts.port })
    return yield* Effect.async<Listener>((resume) => {
      const server = createServer(async (req, res) => {
        res.setHeader("Content-Type", "application/json")
        try {
          if (req.method === "POST" && req.url === "/session") { const body = await readBody(req); res.end(JSON.stringify({ status: "ok", received: JSON.parse(body || "{}") })); return }
          if (req.method === "GET" && req.url === "/session") { res.end(JSON.stringify([])); return }
          res.statusCode = 404; res.end(JSON.stringify({ error: "not found" }))
        } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) })) }
      })
      server.listen(opts.port, opts.hostname, () => { resume(Effect.succeed({ hostname: opts.hostname, port: opts.port, url: new URL("http://" + opts.hostname + ":" + opts.port) })) })
    })
  })
  return Service.of({ listen } as any)
}))
export const defaultLayer = layer
async function readBody(req: any): Promise<string> { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks).toString() }
export * as Server from "."
'''

files["cli/ui.ts"] = '''export const Logo = "  minicode\\n"
export function logo() { return Logo }
'''

files["cli/bootstrap.ts"] = '''import { Layer, ManagedRuntime } from "effect"
import * as Log from "@minicode/core/util/log"
import { Global } from "@minicode/core/global"
import { Env } from "@/env"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceLayer, DefaultInstanceRef } from "@/project/bootstrap"
const log = Log.create({ service: "bootstrap" })
export const AppLayer = Layer.provideMerge(InstanceLayer as any, DefaultInstanceRef as any) as Layer.Layer<any>
const rt = ManagedRuntime.make(AppLayer as any)
export const AppRuntime = {
  runSync: (effect: any) => rt.runSync(effect),
  runPromise: (effect: any, options?: any) => rt.runPromise(effect, options),
  runPromiseExit: (effect: any, options?: any) => rt.runPromiseExit(effect, options),
  runFork: (effect: any) => rt.runFork(effect),
  runCallback: (effect: any) => rt.runCallback(effect),
  dispose: () => rt.dispose(),
}
export async function init() { await Log.init({ print: Env.MINICODE_LOG_PRINT, level: Env.MINICODE_LOG_LEVEL }); log.info("minicode initialized", { home: Global.Path.home }) }
export * as Bootstrap from "./bootstrap"
'''

files["cli/cmd/run.ts"] = '''import { Effect } from "effect"
import * as Log from "@minicode/core/util/log"
import { AppRuntime, init } from "../bootstrap"
import { Session } from "@/session/session"
import { Agent } from "@/agent/agent"
import * as Project from "@/project/project"
import { LLM } from "@minicode/llm"
import { OpenAI } from "@minicode/llm/providers"
const log = Log.create({ service: "cli.run" })
export async function runCommand(opts: { prompt?: string; interactive?: boolean; model?: string; baseURL?: string; apiKey?: string }) {
  await init()
  if (opts.interactive) { await interactive(opts); return }
  if (!opts.prompt) { console.error("Error: provide --prompt or --interactive"); process.exit(1) }
  await singleShot(opts.prompt, opts)
}
async function singleShot(prompt: string, opts: { model?: string; baseURL?: string; apiKey?: string }) {
  const model = resolveModel(opts)
  await AppRuntime.runPromise(Effect.gen(function* () {
    const project = yield* Project.Service as any
    const session = yield* Session.Service as any
    const agent = yield* Agent.Service as any
    const info = yield* project.current()
    const sess = yield* session.create({ projectID: info.id, directory: info.directory, agent: "build" })
    yield* session.appendMessage({ sessionID: sess.id, role: "user", parts: [{ id: "prt_0" as any, type: "text", text: prompt }] })
    const agentInfo = yield* agent.get("build")
    const system = agentInfo.prompt ?? "You are a helpful assistant."
    const messages = yield* session.messages(sess.id)
    const aiMessages: Array<{ role: string; content: string }> = messages.map((m: any) => ({ role: m.role, content: m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\\n") }))
    log.info("calling LLM", { messages: aiMessages.length })
    const result = yield* LLM.generate({ model, system, messages: aiMessages as any })
    console.log(result.text)
    yield* session.appendMessage({ sessionID: sess.id, role: "assistant", parts: [{ id: "prt_resp" as any, type: "text", text: result.text }] })
  }))
}
async function interactive(opts: { model?: string; baseURL?: string; apiKey?: string }) {
  const model = resolveModel(opts)
  const history: Array<{ role: string; content: string }> = []
  console.log("minicode interactive mode. Type 'exit' to quit.\\n")
  const readline = await import("readline")
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = () => rl.question("> ", async (input) => {
    if (!input || input === "exit") { rl.close(); return }
    history.push({ role: "user", content: input })
    try { const result = await AppRuntime.runPromise(LLM.generate({ model, system: "You are a helpful coding assistant.", messages: history as any })); console.log(result.text); history.push({ role: "assistant", content: result.text }) } catch (e) { console.error("Error:", e instanceof Error ? e.message : String(e)) }
    ask()
  })
  ask()
}
function resolveModel(opts: { model?: string; baseURL?: string; apiKey?: string }) {
  const modelID = opts.model ?? process.env.MINICODE_MODEL ?? "gpt-4o-mini"
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
  if (opts.baseURL) { return { providerID: "openai-compatible" as any, modelID: modelID as any, apiKey, baseURL: opts.baseURL } }
  return OpenAI.model(modelID, { apiKey })
}
'''

files["cli/cmd/serve.ts"] = '''import { Effect } from "effect"
import * as Log from "@minicode/core/util/log"
import { AppRuntime, init } from "../bootstrap"
import { Server } from "@/server/server"
const log = Log.create({ service: "cli.serve" })
export async function serveCommand(opts: { port?: number; hostname?: string }) {
  await init()
  const port = opts.port ?? 4096
  const hostname = opts.hostname ?? "localhost"
  await AppRuntime.runPromise(Effect.gen(function* () {
    const server = yield* Server.Service as any
    const listener = yield* server.listen({ port, hostname })
    log.info("server listening", { url: listener.url.toString() })
    console.log("minicode server listening on " + listener.url)
    yield* Effect.never
  }))
}
'''

files["index.ts"] = '''import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import * as Log from "@minicode/core/util/log"
import { InstallationVersion } from "@minicode/core/installation/version"
import { UI } from "./cli/ui"
import { runCommand } from "./cli/cmd/run"
import { serveCommand } from "./cli/cmd/serve"
process.on("unhandledRejection", (e) => { Log.Default.error("rejection", { e: e instanceof Error ? e.message : String(e) }) })
process.on("uncaughtException", (e) => { Log.Default.error("exception", { e: e instanceof Error ? e.message : String(e) }) })
const args = hideBin(process.argv)
yargs(args)
  .scriptName("minicode")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
  .alias("version", "v")
  .command("run", "Run minicode with a prompt", (y) => y.option("prompt", { type: "string", alias: "p", describe: "prompt to send" }).option("interactive", { type: "boolean", alias: "i", describe: "interactive mode" }).option("model", { type: "string", describe: "model id" }).option("base-url", { type: "string", describe: "base URL for OpenAI-compatible" }).option("api-key", { type: "string", describe: "API key" }), (argv) => { process.stderr.write(UI.logo()); void runCommand({ prompt: argv.prompt as string | undefined, interactive: argv.interactive as boolean | undefined, model: argv.model as string | undefined, baseURL: argv["base-url"] as string | undefined, apiKey: argv["api-key"] as string | undefined }) })
  .command("serve", "Start the minicode HTTP server", (y) => y.option("port", { type: "number", default: 4096, describe: "port" }).option("hostname", { type: "string", default: "localhost", describe: "hostname" }), (argv) => { void serveCommand({ port: argv.port as number, hostname: argv.hostname as string }) })
  .demandCommand(1)
  .strict()
  .parse()
'''

files["server/routes/.gitkeep"] = ""

for name, content in files.items():
    path = os.path.join(base, name.replace("/", os.sep))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Wrote: {name}")