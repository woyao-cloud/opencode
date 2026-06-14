/**
 * [temporary] - 临时 TUI 线程入口
 * 功能概述：临时的 TUI 线程 CLI 入口，组装 yargs 解析并运行 TuiThreadCommand
 * 核心导出：无（直接执行）
 * 架构位置：CLI entrypoint，直接依赖 TUI thread 模块
 */

import yargs from "yargs"
import { TuiThreadCommand } from "./cli/cmd/tui/thread"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { hideBin } from "yargs/helpers"
import { Log } from "./node"

Log.init({
  print: false,
})

const cli = yargs(hideBin(process.argv))
  .parserConfiguration({ "populate--": true })
  .scriptName("opencode")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .option("pure", {
    describe: "run without external plugins",
    type: "boolean",
  })
  .command(TuiThreadCommand)
  .parse()
