import { Effect, Context, Layer } from "effect"

export interface CommandShape {
  readonly execute: (command: string, args?: ReadonlyArray<string>) => Effect.Effect<string, Error>
}

export class CommandService extends Context.Service<CommandService, CommandShape>()("@miniopencode/Command") {}

export const CommandLive: Layer.Layer<CommandService> = Layer.succeed(CommandService, {
  execute: (command: string, args?: ReadonlyArray<string>) =>
    Effect.tryPromise({
      try: async () => {
        const { execSync } = await import("child_process")
        const cmd = args?.length ? `${command} ${args.join(" ")}` : command
        return execSync(cmd, { encoding: "utf-8" })
      },
      catch: (e) => e instanceof Error ? e : new Error(String(e)),
    }),
})
