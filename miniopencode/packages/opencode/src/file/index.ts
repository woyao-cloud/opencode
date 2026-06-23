import { Effect, Context, Layer } from "effect"

export interface FileShape {
  readonly read: (filePath: string) => Effect.Effect<string, Error>
  readonly write: (filePath: string, content: string) => Effect.Effect<void, Error>
  readonly exists: (filePath: string) => Effect.Effect<boolean, Error>
}

export class FileService extends Context.Service<FileService, FileShape>()("@miniopencode/File") {}

export const FileLive: Layer.Layer<FileService> = Layer.succeed(FileService, {
  read: (filePath: string) =>
    Effect.tryPromise({
      try: async () => await Bun.file(filePath).text(),
      catch: (e) => e instanceof Error ? e : new Error(String(e)),
    }),
  write: (filePath: string, content: string) =>
    Effect.tryPromise({
      try: async () => { await Bun.write(filePath, content) },
      catch: (e) => e instanceof Error ? e : new Error(String(e)),
    }),
  exists: (filePath: string) =>
    Effect.sync(() => require("fs").existsSync(filePath)),
})
