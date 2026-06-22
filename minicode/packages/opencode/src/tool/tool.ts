import { Effect, Schema } from "effect"
import type { SessionID } from "@/session/id"
import type { MessageID } from "@/session/schema"
export interface ToolContext { sessionID: SessionID; messageID: MessageID; agent: string; callID?: string }
export interface ExecuteResult { title: string; output: string; metadata?: Record<string, unknown> }
export interface Def<P extends Schema.Decoder<unknown> = Schema.Decoder<unknown>> { id: string; description: string; parameters: P; execute(args: Schema.Schema.Type<P>, ctx: ToolContext): Effect.Effect<ExecuteResult, any, any> }
export type DefWithoutID<P extends Schema.Decoder<unknown> = Schema.Decoder<unknown>> = Omit<Def<P>, "id">
export interface Info<P extends Schema.Decoder<unknown> = Schema.Decoder<unknown>> { id: string; init: () => Effect.Effect<DefWithoutID<P>, any, any> }
export function define<P extends Schema.Decoder<unknown>>(id: string, init: Effect.Effect<DefWithoutID<P>, any, any>): Effect.Effect<Info<P>, any, any> {
  return Effect.gen(function* () { const resolved = yield* init as any; return { id, init: () => Effect.succeed(resolved) } }) as any
}
export function init<P extends Schema.Decoder<unknown>>(info: Info<P>): Effect.Effect<Def<P>, any, any> {
  return Effect.gen(function* () { const d = yield* info.init() as any; return { ...d, id: info.id } }) as any
}
export * as Tool from "./tool"
