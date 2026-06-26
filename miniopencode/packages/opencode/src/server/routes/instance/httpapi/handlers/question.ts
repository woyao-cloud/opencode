// ── Question Handlers ────────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { QuestionServiceTag } from "@/question"
import { InstanceHttpApi } from "../api"

export const questionHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "question", (handlers: any) =>
  Effect.gen(function* () {
    const question = yield* QuestionServiceTag

    handlers.handle("questionAsk", (request: any) =>
      question.ask(request.payload.question, request.payload.options)
    )

    return handlers
  })
)
