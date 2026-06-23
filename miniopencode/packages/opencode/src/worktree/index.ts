import { Effect, Context, Layer } from "effect"

export interface WorktreeShape {
  readonly list: () => Effect.Effect<ReadonlyArray<string>, Error>
  readonly add: (path: string, ref: string) => Effect.Effect<string, Error>
  readonly remove: (path: string) => Effect.Effect<void, Error>
}

export class WorktreeService extends Context.Service<WorktreeService, WorktreeShape>()("@miniopencode/Worktree") {}

const notImplemented = (name: string) => Effect.fail(new Error(`Worktree.${name} not implemented`))

export const WorktreeLive: Layer.Layer<WorktreeService> = Layer.succeed(WorktreeService, {
  list: () => notImplemented("list"),
  add: (_path: string, _ref: string) => notImplemented("add"),
  remove: (_path: string) => notImplemented("remove"),
})
