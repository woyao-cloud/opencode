import { Effect, Context, Layer } from "effect"

export interface PluginShape {
  readonly load: (name: string) => Effect.Effect<void, Error>
  readonly list: () => Effect.Effect<ReadonlyArray<string>, Error>
}

export class PluginService extends Context.Service<PluginService, PluginShape>()("@miniopencode/Plugin") {}

export const PluginLive = Layer.succeed(PluginService, {
  load: (_name: string) => Effect.void,
  list: () => Effect.succeed([] as ReadonlyArray<string>),
})
