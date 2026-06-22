import { Schema } from "effect"
import { PlanSchema, type Plan } from "@/pipeline/plan"
import type { BuildResult } from "@/pipeline/builder"

// ── Agent IDs ──────────────────────────────────────────
export const AgentID = Schema.String.pipe(Schema.brand("AgentID"))
export type AgentID = Schema.Schema.Type<typeof AgentID>

export const PlannerAgent = AgentID.make("planner")
export const BuilderAgent = AgentID.make("builder")
export const ReviewerAgent = AgentID.make("reviewer")

// ── Message correlation ─────────────────────────────────
export const CorrelationID = Schema.String.pipe(Schema.brand("CorrelationID"))
export type CorrelationID = Schema.Schema.Type<typeof CorrelationID>

export function createCorrelationID(): CorrelationID {
  return CorrelationID.make("corr_" + Math.random().toString(36).slice(2, 12))
}

// ── Message envelope ───────────────────────────────────
export const MessageEnvelope = <T extends Schema.Top>(contentSchema: T) =>
  Schema.Struct({
    id: Schema.String,
    correlationID: CorrelationID,
    source: AgentID,
    target: AgentID,
    type: Schema.String,
    content: contentSchema,
    timestamp: Schema.Number,
  })

export type MessageEnvelope<T> = {
  readonly id: string
  readonly correlationID: CorrelationID
  readonly source: AgentID
  readonly target: AgentID
  readonly type: string
  readonly content: T
  readonly timestamp: number
}

// ── PlanRequest / PlanResult ────────────────────────────
export const PlanRequestContent = Schema.Struct({
  prompt: Schema.String,
  model: Schema.Struct({
    providerID: Schema.String,
    modelID: Schema.String,
    apiKey: Schema.optional(Schema.String),
    baseURL: Schema.optional(Schema.String),
  }),
})
export type PlanRequestContent = Schema.Schema.Type<typeof PlanRequestContent>

export const PlanResultContent = Schema.Struct({
  plan: PlanSchema,
})
export type PlanResultContent = Schema.Schema.Type<typeof PlanResultContent>

// ── BuildRequest / BuildResult ───────────────────────────
export const BuildRequestContent = Schema.Struct({
  plan: PlanSchema,
  baseDir: Schema.optional(Schema.String),
})
export type BuildRequestContent = Schema.Schema.Type<typeof BuildRequestContent>

export const BuildResultContent = Schema.Struct({
  name: Schema.String,
  files: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      bytes: Schema.Number,
      status: Schema.Literals(["written", "skipped", "failed"]),
      error: Schema.optional(Schema.String),
    })
  ),
  totalBytes: Schema.Number,
  totalFiles: Schema.Number,
  failedFiles: Schema.Number,
})
export type BuildResultContent = Schema.Schema.Type<typeof BuildResultContent>

// ── ReviewRequest / ReviewResult ────────────────────────
export const ReviewRequestContent = Schema.Struct({
  plan: PlanSchema,
  buildResult: BuildResultContent,
})
export type ReviewRequestContent = Schema.Schema.Type<typeof ReviewRequestContent>

export const ReviewResultContent = Schema.Struct({
  passed: Schema.Boolean,
  feedback: Schema.optional(Schema.String),
})
export type ReviewResultContent = Schema.Schema.Type<typeof ReviewResultContent>

// ── Message type constants ──────────────────────────────
export const MessageTypes = {
  PlanRequest: "acp.plan.request",
  PlanResult: "acp.plan.result",
  BuildRequest: "acp.build.request",
  BuildResult: "acp.build.result",
  ReviewRequest: "acp.review.request",
  ReviewResult: "acp.review.result",
} as const

export * as ACPMessage from "./message"
