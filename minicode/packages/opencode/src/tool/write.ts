import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "./tool"
import { File } from "@/file"
const Parameters = Schema.Struct({ filePath: Schema.String.annotate({ description: "Absolute path to the file to write" }), content: Schema.String.annotate({ description: "Content to write" }) })
export const WriteTool = Tool.define("write", Effect.gen(function* () { return { description: "Write content to a file.", parameters: Parameters, execute: (args: any) => Effect.gen(function* () { yield* File.write(args.filePath, args.content); return { title: "Write " + path.basename(args.filePath), output: "Wrote " + args.content.length + " bytes to " + args.filePath, metadata: { path: args.filePath, bytes: args.content.length } } }) } }))
export * as Write from "./write"
