import { Effect, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import { LLM } from "@minicode/llm"
import { PlanSchema, type Plan } from "./plan"
import type { ModelRef } from "@minicode/llm/schema/messages"

const log = Log.create({ service: "pipeline.planner" })

const PLANNER_PROMPT = `You are a software architect. Given a user request, you create a structured plan for implementing it.

Your plan must be a JSON object with:
- name: a short name for the project
- files: an array of file objects, each with:
  - path: relative file path (e.g. "src/game.py")
  - content: the full file content
  - deps: optional array of file paths this file depends on
- status: "planned"

Rules:
- Split the project into multiple files when it makes sense (separate concerns, reusable modules).
- For small projects (1-3 files), put everything in the plan directly.
- For larger projects, include all files needed.
- Each file's content must be complete and ready to write.
- Output ONLY the JSON plan, no other text or markdown formatting.`

export function plan(input: {
  prompt: string
  model: ModelRef
}): Effect.Effect<Plan, Error> {
  return Effect.gen(function* () {
    log.info("planning", { prompt: input.prompt.slice(0, 80) })

    const result = yield* LLM.generate({
      model: input.model,
      system: PLANNER_PROMPT,
      messages: [{ role: "user" as const, content: input.prompt }],
    })

    const text = result.text.trim()
    log.info("llm response", { length: text.length, preview: text.slice(0, 120) })

    // Try to extract JSON from the response — the LLM might wrap it in ```json ... ```
    const jsonStr = extractJSON(text)
    if (!jsonStr) {
      return yield* Effect.fail(new Error("Planner did not return valid JSON:\n" + text.slice(0, 500)))
    }

    const parsed = yield* Effect.try({
      try: () => JSON.parse(jsonStr) as unknown,
      catch: (e) => new Error(`Failed to parse plan JSON: ${e instanceof Error ? e.message : String(e)}`),
    })

    const plan = yield* Schema.decodeUnknownEffect(PlanSchema)(parsed).pipe(
      Effect.catchEager((e) =>
        Effect.fail(new Error(`Plan validation failed: ${e}`))
      ),
    )

    log.info("plan created", { name: plan.name, files: plan.files.length })
    return plan
  })
}

function extractJSON(text: string): string | null {
  // Try ```json ... ``` block first
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (blockMatch) return blockMatch[1]!.trim()

  // Try top-level { ... } object
  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) return braceMatch[0]

  return null
}

export * as Planner from "./planner"
