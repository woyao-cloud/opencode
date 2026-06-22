import { Effect, Stream, Schema, Deferred } from "effect"
import * as Log from "@minicode/core/util/log"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import {
  type AgentID,
  type CorrelationID,
  type MessageEnvelope,
  type PlanRequestContent,
  type PlanResultContent,
  type BuildRequestContent,
  type BuildResultContent,
  type ReviewRequestContent,
  type ReviewResultContent,
  MessageTypes,
} from "./message"

const log = Log.create({ service: "acp.bus" })

// ── BusEvent definitions for each ACP message type ─────
const PlanRequestEvent = BusEvent.define(MessageTypes.PlanRequest, Schema.Unknown)
const PlanResultEvent = BusEvent.define(MessageTypes.PlanResult, Schema.Unknown)
const BuildRequestEvent = BusEvent.define(MessageTypes.BuildRequest, Schema.Unknown)
const BuildResultEvent = BusEvent.define(MessageTypes.BuildResult, Schema.Unknown)
const ReviewRequestEvent = BusEvent.define(MessageTypes.ReviewRequest, Schema.Unknown)
const ReviewResultEvent = BusEvent.define(MessageTypes.ReviewResult, Schema.Unknown)

function createID(): string {
  return "acp_" + Math.random().toString(36).slice(2, 12)
}

// ── Send helpers ────────────────────────────────────────
export function sendPlanRequest(bus: Bus.Interface, source: AgentID, target: AgentID, correlationID: CorrelationID, content: PlanRequestContent) {
  return send(bus, source, target, correlationID, MessageTypes.PlanRequest, content)
}

export function sendPlanResult(bus: Bus.Interface, source: AgentID, target: AgentID, correlationID: CorrelationID, content: PlanResultContent) {
  return send(bus, source, target, correlationID, MessageTypes.PlanResult, content)
}

export function sendBuildRequest(bus: Bus.Interface, source: AgentID, target: AgentID, correlationID: CorrelationID, content: BuildRequestContent) {
  return send(bus, source, target, correlationID, MessageTypes.BuildRequest, content)
}

export function sendBuildResult(bus: Bus.Interface, source: AgentID, target: AgentID, correlationID: CorrelationID, content: BuildResultContent) {
  return send(bus, source, target, correlationID, MessageTypes.BuildResult, content)
}

export function sendReviewRequest(bus: Bus.Interface, source: AgentID, target: AgentID, correlationID: CorrelationID, content: ReviewRequestContent) {
  return send(bus, source, target, correlationID, MessageTypes.ReviewRequest, content)
}

export function sendReviewResult(bus: Bus.Interface, source: AgentID, target: AgentID, correlationID: CorrelationID, content: ReviewResultContent) {
  return send(bus, source, target, correlationID, MessageTypes.ReviewResult, content)
}

function send(bus: Bus.Interface, source: AgentID, target: AgentID, correlationID: CorrelationID, type: string, content: unknown) {
  return Effect.gen(function* () {
    const envelope: MessageEnvelope<unknown> = {
      id: createID(),
      correlationID,
      source,
      target,
      type,
      content,
      timestamp: Date.now(),
    }
    log.info("send", { type, source, target, correlationID })
    const event = BusEvent.define(type, Schema.Unknown)
    yield* bus.publish(event, envelope as any)
  })
}

// ── Subscribe helpers ───────────────────────────────────
export function onPlanRequest(bus: Bus.Interface, callback: (envelope: MessageEnvelope<PlanRequestContent>) => void) {
  return bus.subscribeCallback(PlanRequestEvent as any, callback as any)
}

export function onPlanResult(bus: Bus.Interface, callback: (envelope: MessageEnvelope<PlanResultContent>) => void) {
  return bus.subscribeCallback(PlanResultEvent as any, callback as any)
}

export function onBuildRequest(bus: Bus.Interface, callback: (envelope: MessageEnvelope<BuildRequestContent>) => void) {
  return bus.subscribeCallback(BuildRequestEvent as any, callback as any)
}

export function onBuildResult(bus: Bus.Interface, callback: (envelope: MessageEnvelope<BuildResultContent>) => void) {
  return bus.subscribeCallback(BuildResultEvent as any, callback as any)
}

export function onReviewRequest(bus: Bus.Interface, callback: (envelope: MessageEnvelope<ReviewRequestContent>) => void) {
  return bus.subscribeCallback(ReviewRequestEvent as any, callback as any)
}

export function onReviewResult(bus: Bus.Interface, callback: (envelope: MessageEnvelope<ReviewResultContent>) => void) {
  return bus.subscribeCallback(ReviewResultEvent as any, callback as any)
}

// ── Stream-based subscribe ──────────────────────────────
export function streamPlanRequests(bus: Bus.Interface) {
  return bus.subscribe(PlanRequestEvent as any) as any
}

export function streamPlanResults(bus: Bus.Interface) {
  return bus.subscribe(PlanResultEvent as any) as any
}

export function streamBuildRequests(bus: Bus.Interface) {
  return bus.subscribe(BuildRequestEvent as any) as any
}

export function streamBuildResults(bus: Bus.Interface) {
  return bus.subscribe(BuildResultEvent as any) as any
}

export function streamReviewRequests(bus: Bus.Interface) {
  return bus.subscribe(ReviewRequestEvent as any) as any
}

export function streamReviewResults(bus: Bus.Interface) {
  return bus.subscribe(ReviewResultEvent as any) as any
}

// ── Request/Response helper ────────────────────────────
// Sends a request and waits for a response with matching correlationID.
export function request<T>(bus: Bus.Interface, sendAction: Effect.Effect<void, any, any>, responseType: string, correlationID: CorrelationID, timeoutMs: number = 30000) {
  return Effect.gen(function* () {
    const deferred = yield* Deferred.make<MessageEnvelope<T>, Error>()

    // Subscribe to the response type
    const responseEvent = BusEvent.define(responseType, Schema.Unknown)
    const unsubscribe = yield* bus.subscribeCallback(responseEvent as any, (envelope: any) => {
      if (envelope.correlationID === correlationID) {
        Effect.runFork(Deferred.succeed(deferred, envelope as MessageEnvelope<T>))
      }
    })

    // Send the request
    yield* sendAction

    // Wait for response with timeout
    const result = yield* Deferred.await(deferred).pipe(
      Effect.timeout(timeoutMs),
      Effect.catchEager((e) => {
        unsubscribe()
        return Effect.fail(new Error(`ACP request timed out or failed: ${e}`))
      }),
    )

    unsubscribe()
    return result
  })
}

export * as ACPBus from "./bus"
