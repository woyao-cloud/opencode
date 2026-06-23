import { Effect, Context, Layer } from "effect"

export interface SkillShape {
  readonly load: (name: string) => Effect.Effect<void, Error>
  readonly list: () => Effect.Effect<ReadonlyArray<string>, Error>
}

export class SkillService extends Context.Service<SkillService, SkillShape>()("@miniopencode/Skill") {}

export const SkillLive = Layer.succeed(SkillService, {
  load: (_name: string) => Effect.void,
  list: () => Effect.succeed([] as ReadonlyArray<string>),
})
