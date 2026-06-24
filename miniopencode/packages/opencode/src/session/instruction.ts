// ── Instruction System ─────────────────────────────────────────

export const DEFAULT_INSTRUCTIONS: ReadonlyArray<string> = [
  "Use glob and grep to search for files and patterns when exploring a codebase.",
  "Use read to view file contents before making changes.",
  "Use write to create or modify files.",
  "Use bash to run terminal commands. Prefer simple, focused commands.",
  "Think step by step before acting on complex requests.",
  "When you encounter an error, diagnose it before trying a different approach.",
]

export function buildInstructions(custom?: ReadonlyArray<string>): ReadonlyArray<string> {
  return custom && custom.length > 0 ? custom : DEFAULT_INSTRUCTIONS
}
