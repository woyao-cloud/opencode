/**
 * cli/cmd/debug/lsp - "opencode debug lsp" 命令
 *
 * 功能概述：
 * - 提供 LSP（Language Server Protocol）调试工具
 *
 * 核心导出：
 * - LSPCommand: yargs CommandModule，包含 LSP 相关子命令
 *
 * 架构位置：CLI debug 命令组，被 debug/index.ts 注册，依赖 lsp 模块
 */

import { LSP } from "@/lsp/lsp"
import { Effect } from "effect"
import { effectCmd } from "../../effect-cmd"
import { cmd } from "../cmd"
import * as Log from "@opencode-ai/core/util/log"
import { EOL } from "os"

export const LSPCommand = cmd({
  command: "lsp",
  describe: "LSP debugging utilities",
  builder: (yargs) =>
    yargs.command(DiagnosticsCommand).command(SymbolsCommand).command(DocumentSymbolsCommand).demandCommand(),
  async handler() {},
})

const DiagnosticsCommand = effectCmd({
  command: "diagnostics <file>",
  describe: "get diagnostics for a file",
  builder: (yargs) => yargs.positional("file", { type: "string", demandOption: true }),
  handler: Effect.fn("Cli.debug.lsp.diagnostics")(function* (args) {
    const out = yield* LSP.Service.use((lsp) =>
      Effect.gen(function* () {
        yield* lsp.touchFile(args.file, "full")
        return yield* lsp.diagnostics()
      }),
    )
    process.stdout.write(JSON.stringify(out, null, 2) + EOL)
  }),
})

export const SymbolsCommand = effectCmd({
  command: "symbols <query>",
  describe: "search workspace symbols",
  builder: (yargs) => yargs.positional("query", { type: "string", demandOption: true }),
  handler: Effect.fn("Cli.debug.lsp.symbols")(function* (args) {
    using _ = Log.Default.time("symbols")
    const results = yield* LSP.Service.use((lsp) => lsp.workspaceSymbol(args.query))
    process.stdout.write(JSON.stringify(results, null, 2) + EOL)
  }),
})

export const DocumentSymbolsCommand = effectCmd({
  command: "document-symbols <uri>",
  describe: "get symbols from a document",
  builder: (yargs) => yargs.positional("uri", { type: "string", demandOption: true }),
  handler: Effect.fn("Cli.debug.lsp.documentSymbols")(function* (args) {
    using _ = Log.Default.time("document-symbols")
    const results = yield* LSP.Service.use((lsp) => lsp.documentSymbol(args.uri))
    process.stdout.write(JSON.stringify(results, null, 2) + EOL)
  }),
})
