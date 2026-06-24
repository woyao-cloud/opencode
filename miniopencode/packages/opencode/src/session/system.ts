// ── System Prompt Builder ──────────────────────────────────────

export interface SystemPromptOptions {
  readonly agent?: {
    readonly system?: string
    readonly permissions?: ReadonlyArray<string>
  }
  readonly instructions?: ReadonlyArray<string>
  readonly toolDescriptions?: ReadonlyArray<string>
}

export function buildSystemPrompt(opts: SystemPromptOptions = {}): string {
  const parts: string[] = []

  // Core system prompt from agent config
  if (opts.agent?.system) {
    parts.push(opts.agent.system)
  } else {
    parts.push("You are a helpful assistant with access to various tools.")
  }

  // Tool descriptions
  if (opts.toolDescriptions?.length) {
    parts.push(`## Available Tools\n\nYou have access to the following tools:\n${opts.toolDescriptions.map((d) => `- ${d}`).join("\n")}`)
  }

  // Instructions
  if (opts.instructions?.length) {
    parts.push(`## Instructions\n\n${opts.instructions.join("\n")}`)
  }

  return parts.join("\n\n")
}
