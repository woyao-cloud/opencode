// ── Session API Group ────────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { ApiNotFoundError } from "../errors"

const root = "/session"

export const ListQuery = Schema.Struct({
  limit: Schema.optional(Schema.NumberFromString),
  search: Schema.optional(Schema.String),
})

export const CreatePayload = Schema.Struct({
  title: Schema.optional(Schema.String),
  agentId: Schema.optional(Schema.String),
  modelId: Schema.optional(Schema.String),
})

export const UpdatePayload = Schema.Struct({
  title: Schema.optional(Schema.String),
})

export const PromptPayload = Schema.Struct({
  prompt: Schema.String,
})

export const SessionGroup = HttpApiGroup.make("session")
  .add(
    HttpApiEndpoint.get("sessionList", root, {
      query: ListQuery,
      success: Schema.Array(Schema.Unknown),
    }),
    HttpApiEndpoint.post("sessionCreate", root, {
      payload: CreatePayload,
      success: Schema.Unknown,
    }),
    HttpApiEndpoint.get("sessionGet", `${root}/:sessionID`, {
      params: { sessionID: Schema.String },
      success: Schema.Unknown,
      error: ApiNotFoundError,
    }),
    HttpApiEndpoint.delete("sessionDelete", `${root}/:sessionID`, {
      params: { sessionID: Schema.String },
      success: Schema.Void,
      error: ApiNotFoundError,
    }),
    HttpApiEndpoint.patch("sessionUpdate", `${root}/:sessionID`, {
      params: { sessionID: Schema.String },
      payload: UpdatePayload,
      success: Schema.Unknown,
      error: ApiNotFoundError,
    }),
    HttpApiEndpoint.get("sessionMessages", `${root}/:sessionID/message`, {
      params: { sessionID: Schema.String },
      success: Schema.Array(Schema.Unknown),
      error: ApiNotFoundError,
    }),
    HttpApiEndpoint.post("sessionPrompt", `${root}/:sessionID/message`, {
      params: { sessionID: Schema.String },
      payload: PromptPayload,
      success: Schema.Unknown,
      error: ApiNotFoundError,
    }),
    HttpApiEndpoint.get("sessionStatus", `${root}/status`, {
      success: Schema.Record(Schema.String, Schema.Unknown),
    }),
    HttpApiEndpoint.get("sessionStatusGet", `${root}/:sessionID/status`, {
      params: { sessionID: Schema.String },
      success: Schema.Unknown,
    }),
  )
