// ── Question API Group ───────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const QuestionGroup = HttpApiGroup.make("question")
  .add(
    HttpApiEndpoint.post("questionAsk", "/question", {
      payload: Schema.Struct({
        question: Schema.String,
        options: Schema.optional(Schema.Array(Schema.String)),
      }),
      success: Schema.String,
    }),
  )
