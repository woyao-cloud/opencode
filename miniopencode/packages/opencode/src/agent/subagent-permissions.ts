// ── Subagent Permission Derivation ───────────────────────────
// Builds the permission ruleset for a subagent's session when spawned
// via the task tool. Inherits parent's deny rules and prevents
// task/todowrite recursion by default.

// No external types needed; operates on plain string arrays.

export interface SubagentPermissionsInput {
  readonly parentPermissions: ReadonlyArray<string>
  readonly subagentPermissions: ReadonlyArray<string>
}

/**
 * Derive the permission ruleset for a subagent session.
 * - Inherits parent's deny rules (e.g. edit:deny for Plan Mode)
 * - Denies `task` and `todowrite` for the subagent unless explicitly permitted
 */
export function deriveSubagentSessionPermission(input: SubagentPermissionsInput): ReadonlyArray<string> {
  const parentDenies = input.parentPermissions.filter((r) => r.startsWith("deny:") || r.startsWith("deny/*"))
  const canTask = input.subagentPermissions.some((r) => r.startsWith("task:") || r.startsWith("allow:task"))
  const canTodo = input.subagentPermissions.some((r) => r.startsWith("todowrite:") || r.startsWith("allow:todowrite"))

  return [
    ...parentDenies,
    ...(canTask ? [] : ["deny:task:*"] as const),
    ...(canTodo ? [] : ["deny:todowrite:*"] as const),
  ]
}

export * as SubagentPermissions from "./subagent-permissions"
