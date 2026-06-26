// ── Session Handlers — Effect-based request handlers ─────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { SessionService } from "@/session/session"
import { SessionStatusService } from "@/session/status"
import { PromptService } from "@/session/prompt"
import { ProviderService } from "@/provider/index"
import { InstanceHttpApi } from "../api"
import { notFound } from "../errors"

export const sessionHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "session", (handlers: any) =>
  Effect.gen(function* () {
    const session = yield* SessionService
    const statusService = yield* SessionStatusService
    const prompt = yield* PromptService
    const provider = yield* ProviderService

    // GET /session — list sessions
    handlers.handle("sessionList", (request: any) =>
      Effect.gen(function* () {
        const query = request.query
        return yield* session.list(query.limit)
      })
    )

    // POST /session — create session
    handlers.handle("sessionCreate", (request: any) =>
      Effect.gen(function* () {
        const body = request.payload
        return yield* session.create({
          title: body.title,
          agentId: body.agentId,
          modelId: body.modelId,
        })
      })
    )

    // GET /session/:sessionID — get session
    handlers.handle("sessionGet", (request: any) =>
      Effect.gen(function* () {
        const { sessionID } = request.path
        const found = yield* session.get(sessionID)
        if (!found) return yield* notFound(`Session ${sessionID} not found`)
        const messages = yield* session.getMessages(sessionID)
        const st = yield* statusService.get(sessionID)
        return { ...found, messages, runtimeStatus: st }
      })
    )

    // DELETE /session/:sessionID — delete session
    handlers.handle("sessionDelete", (request: any) =>
      Effect.gen(function* () {
        const { sessionID } = request.path
        const found = yield* session.get(sessionID)
        if (!found) return yield* notFound(`Session ${sessionID} not found`)
        yield* session.delete(sessionID)
      })
    )

    // PATCH /session/:sessionID — update session
    handlers.handle("sessionUpdate", (request: any) =>
      Effect.gen(function* () {
        const { sessionID } = request.path
        const found = yield* session.get(sessionID)
        if (!found) return yield* notFound(`Session ${sessionID} not found`)
        return yield* session.get(sessionID)
      })
    )

    // GET /session/:sessionID/message — get messages
    handlers.handle("sessionMessages", (request: any) =>
      Effect.gen(function* () {
        const { sessionID } = request.path
        const found = yield* session.get(sessionID)
        if (!found) return yield* notFound(`Session ${sessionID} not found`)
        return yield* session.getMessages(sessionID)
      })
    )

    // POST /session/:sessionID/message — run prompt
    handlers.handle("sessionPrompt", (request: any) =>
      Effect.gen(function* () {
        const { sessionID } = request.path
        const found = yield* session.get(sessionID)
        if (!found) return yield* notFound(`Session ${sessionID} not found`)
        const body = request.payload
        const model = yield* provider.defaultModel()
        const result = yield* prompt.prompt({
          sessionId: sessionID,
          userInput: body.prompt,
          model,
          tools: {},
        })
        return { text: result.text, usage: result.usage }
      })
    )

    // GET /session/status — all session statuses
    handlers.handle("sessionStatus", () =>
      Effect.gen(function* () {
        const map = yield* statusService.list()
        return Object.fromEntries(map)
      })
    )

    // GET /session/:sessionID/status — single session status
    handlers.handle("sessionStatusGet", (request: any) =>
      Effect.gen(function* () {
        const { sessionID } = request.path
        return yield* statusService.get(sessionID)
      })
    )

    return handlers
  })
)
