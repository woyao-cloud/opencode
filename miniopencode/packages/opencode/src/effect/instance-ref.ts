import { Context } from "effect"

export interface InstanceContext { readonly directory: string; readonly worktree: string }

export const InstanceRef = Context.Reference<InstanceContext | undefined>("@miniopencode/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<string | undefined>("@miniopencode/WorkspaceRef", {
  defaultValue: () => undefined,
})
