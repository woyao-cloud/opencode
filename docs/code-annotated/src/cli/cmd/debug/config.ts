/**
 * cli/cmd/debug/config - "opencode debug config" 命令
 *
 * 功能概述：
 * - 显示当前生效的完整配置信息，用于调试配置问题
 *
 * 核心导出：
 * - ConfigCommand: 使用 effectCmd 封装的 yargs 命令定义
 *
 * 架构位置：CLI debug 命令组，被 debug/index.ts 注册，依赖 config 模块
 */

import { EOL } from "os"
import { Effect } from "effect"
import { Config } from "@/config/config"
import { effectCmd } from "../../effect-cmd"

export const ConfigCommand = effectCmd({
  command: "config",
  describe: "show resolved configuration",
  builder: (yargs) => yargs,
  handler: Effect.fn("Cli.debug.config")(function* () {
    const config = yield* Config.Service.use((cfg) => cfg.get())
    process.stdout.write(JSON.stringify(config, null, 2) + EOL)
  }),
})
