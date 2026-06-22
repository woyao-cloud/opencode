import { Effect } from "effect"
import * as Log from "@minicode/core/util/log"
import { LLM } from "@minicode/llm"
import type { ModelRef } from "@minicode/llm/schema/messages"
import type { Plan } from "./plan"

const log = Log.create({ service: "pipeline.reviewer" })

export interface ReviewResult {
  passed: boolean
  feedback?: string
  structural: {
    allFilesWritten: boolean
    allNonEmpty: boolean
    totalFiles: number
    writtenFiles: number
    failedFiles: number
  }
}

const REVIEWER_PROMPT = `You are a code reviewer. Given a build plan and its execution results, review whether the implementation is correct and complete.

Check for:
1. All required files were created
2. File contents are correct and complete
3. The implementation matches the original intent
4. No obvious bugs or missing pieces

Respond with a JSON object:
{
  "passed": true/false,
  "feedback": "explanation of issues found (or empty if passed)"
}`

// Structural check — no LLM call needed
function structuralReview(plan: Plan, result: { files: ReadonlyArray<{ path: string; bytes: number; status: string; error?: string }>; totalFiles: number; failedFiles: number }): ReviewResult["structural"] {
  const allFilesWritten = result.failedFiles === 0
  const allNonEmpty = result.files.every((f) => f.bytes > 0)
  return {
    allFilesWritten,
    allNonEmpty,
    totalFiles: result.totalFiles,
    writtenFiles: result.totalFiles - result.failedFiles,
    failedFiles: result.failedFiles,
  }
}

// LLM-based review — validates correctness
function llmReview(input: {
  plan: Plan
  result: { name: string; files: ReadonlyArray<{ path: string; bytes: number; status: string; error?: string }>; totalBytes: number; totalFiles: number; failedFiles: number }
  model: ModelRef
}): Effect.Effect<{ passed: boolean; feedback: string }, Error> {
  return Effect.gen(function* () {
    const planSummary = `Plan: ${input.plan.name}\nFiles:\n${input.plan.files.map((f) => `  - ${f.path} (${f.content.length} bytes)`).join("\n")}`
    const buildSummary = `Build result: ${input.result.totalFiles} files, ${input.result.totalBytes} bytes, ${input.result.failedFiles} failed\nFiles:\n${input.result.files.map((f) => `  - ${f.path} (${f.bytes} bytes, ${f.status})${f.error ? ` error: ${f.error}` : ""}`).join("\n")}`

    const result = yield* LLM.generate({
      model: input.model,
      system: REVIEWER_PROMPT,
      messages: [
        { role: "user" as const, content: `## Plan\n${planSummary}\n\n## Build Result\n${buildSummary}\n\nReview the implementation.` },
      ],
    })

    const text = result.text.trim()
    const jsonStr = extractJSON(text)
    if (!jsonStr) {
      return { passed: false, feedback: "Reviewer did not return valid JSON" }
    }

    const parsed = JSON.parse(jsonStr) as { passed?: boolean; feedback?: string }
    return {
      passed: parsed.passed ?? false,
      feedback: parsed.feedback ?? "No feedback provided",
    }
  })
}

function extractJSON(text: string): string | null {
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (blockMatch) return blockMatch[1]!.trim()
  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) return braceMatch[0]
  return null
}

export function review(input: {
  plan: Plan
  result: { name: string; files: ReadonlyArray<{ path: string; bytes: number; status: string; error?: string }>; totalBytes: number; totalFiles: number; failedFiles: number }
  model?: ModelRef
}): Effect.Effect<ReviewResult, Error> {
  return Effect.gen(function* () {
    log.info("reviewing", { name: input.plan.name, files: input.result.totalFiles })

    const structural = structuralReview(input.plan, input.result)

    // If structural check fails, skip LLM review
    if (!structural.allFilesWritten || !structural.allNonEmpty) {
      const feedback = []
      if (!structural.allFilesWritten) feedback.push(`${structural.failedFiles} file(s) failed to write`)
      if (!structural.allNonEmpty) feedback.push("some files are empty")
      return {
        passed: false,
        feedback: feedback.join("; "),
        structural,
      }
    }

    // If no model provided, structural check is sufficient
    if (!input.model) {
      return {
        passed: true,
        structural,
      }
    }

    // LLM-based review
    const llmResult = yield* llmReview({
      plan: input.plan,
      result: input.result,
      model: input.model,
    })

    log.info("review complete", { passed: llmResult.passed })
    return {
      passed: llmResult.passed,
      feedback: llmResult.feedback,
      structural,
    }
  })
}

export * as Reviewer from "./reviewer"
