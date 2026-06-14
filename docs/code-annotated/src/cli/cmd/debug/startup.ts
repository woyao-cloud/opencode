/**
 * cli/cmd/debug/startup - "opencode debug startup" 命令
 *
 * 功能概述：
 * - 输出进程启动时间戳，用于调试启动性能
 *
 * 核心导出：
 * - StartupCommand: yargs CommandModule
 *
 * 架构位置：CLI debug 命令组，被 debug/index.ts 注册
 */

import { EOL } from "os"
import { cmd } from "../cmd"

export const StartupCommand = cmd({
  command: "startup",
  describe: "print startup timing",
  builder: (yargs) => yargs,
  handler() {
    process.stdout.write(performance.now().toString() + EOL)
  },
})
