/**
 * cli/cmd/debug/ripgrep - "opencode debug rg" 命令
 *
 * 功能概述：
 * - 提供 ripgrep 搜索调试功能
 *
 * 核心导出：
 * - RipgrepCommand: yargs CommandModule，包含 ripgrep 相关子命令
 *
 * 架构位置：CLI debug 命令组，被 debug/index.ts 注册，依赖 ripgrep 模块
 */

import { EOL } from "os"
import { Effect, Stream } from "effect"
import { Ripgrep } from "../../../file/ripgrep"
import { effectCmd } from "../../effect-cmd"
import { cmd } from "../cmd"
import { InstanceRef } from "@/effect/instance-ref"

export const RipgrepCommand = cmd({
  command: "rg",
  describe: "ripgrep debugging utilities",
  builder: (yargs) => yargs.command(TreeCommand).command(FilesCommand).command(SearchCommand).demandCommand(),
  async handler() {},
})

const TreeCommand = effectCmd({
  command: "tree",
  describe: "show file tree using ripgrep",
  builder: (yargs) =>
    yargs.option("limit", {
      type: "number",
    }),
  handler: Effect.fn("Cli.debug.rg.tree")(function* (args) {
    const ctx = yield* InstanceRef
    if (!ctx) return
    const tree = yield* Effect.orDie(Ripgrep.Service.use((svc) => svc.tree({ cwd: ctx.directory, limit: args.limit })))
    process.stdout.write(tree + EOL)
  }),
})

const FilesCommand = effectCmd({
  command: "files",
  describe: "list files using ripgrep",
  builder: (yargs) =>
    yargs
      .option("query", {
        type: "string",
        description: "Filter files by query",
      })
      .option("glob", {
        type: "string",
        description: "Glob pattern to match files",
      })
      .option("limit", {
        type: "number",
        description: "Limit number of results",
      }),
  handler: Effect.fn("Cli.debug.rg.files")(function* (args) {
    const ctx = yield* InstanceRef
    if (!ctx) return
    const rg = yield* Ripgrep.Service
    const files = yield* rg
      .files({
        cwd: ctx.directory,
        glob: args.glob ? [args.glob] : undefined,
      })
      .pipe(
        Stream.take(args.limit ?? Infinity),
        Stream.runCollect,
        Effect.map((c) => [...c]),
        Effect.orDie,
      )
    process.stdout.write(files.join(EOL) + EOL)
  }),
})

const SearchCommand = effectCmd({
  command: "search <pattern>",
  describe: "search file contents using ripgrep",
  builder: (yargs) =>
    yargs
      .positional("pattern", {
        type: "string",
        demandOption: true,
        description: "Search pattern",
      })
      .option("glob", {
        type: "array",
        description: "File glob patterns",
      })
      .option("limit", {
        type: "number",
        description: "Limit number of results",
      }),
  handler: Effect.fn("Cli.debug.rg.search")(function* (args) {
    const ctx = yield* InstanceRef
    if (!ctx) return
    const results = yield* Effect.orDie(
      Ripgrep.Service.use((svc) =>
        svc.search({
          cwd: ctx.directory,
          pattern: args.pattern,
          glob: args.glob as string[] | undefined,
          limit: args.limit,
        }),
      ),
    )
    process.stdout.write(JSON.stringify(results.items, null, 2) + EOL)
  }),
})
