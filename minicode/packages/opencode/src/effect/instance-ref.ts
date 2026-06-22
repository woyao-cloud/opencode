import { Context } from "effect"
export interface InstanceContext { readonly directory: string; readonly worktree: string }
export class InstanceRef extends Context.Service<InstanceRef, InstanceContext>()("@minicode/InstanceRef") {}
export class WorkspaceRef extends Context.Service<WorkspaceRef, string | undefined>()("@minicode/WorkspaceRef") {}
