import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "./tool"
import { File } from "@/file"
const Parameters = Schema.Struct({ filePath: Schema.String.annotate({ description: "Absolute path to the file to read" }), offset: Schema.optional(Schema.Number), limit: Schema.optional(Schema.Number) })
export const ReadTool = Tool.define("read", Effect.gen(function* () { return { description: "Read the contents of a file.", parameters: Parameters, execute: (args: any) => Effect.gen(function* () { const content = yield* File.read(args.filePath); const lines = content.split("\n"); const offset = args.offset ?? 1; const limit = args.limit ?? 2000; const slice = lines.slice(offset - 1, offset - 1 + limit); return { title: "Read " + path.basename(args.filePath), output: slice.join("\n"), metadata: { path: args.filePath, lines: slice.length } } }) } }))
export * as Read from "./read"
