/**
 * cli/cmd/debug/scrap - "opencode debug scrap" 命令
 *
 * 功能概述：
 * - 列出所有已知的项目信息，用于调试项目扫描功能
 *
 * 核心导出：
 * - ScrapCommand: yargs CommandModule
 *
 * 架构位置：CLI debug 命令组，被 debug/index.ts 注册，依赖 project 模块
 */

import { EOL } from "os"
import { Project } from "@/project/project"
import * as Log from "@opencode-ai/core/util/log"
import { cmd } from "../cmd"

export const ScrapCommand = cmd({
  command: "scrap",
  describe: "list all known projects",
  builder: (yargs) => yargs,
  async handler() {
    const timer = Log.Default.time("scrap")
    const list = await Project.list()
    process.stdout.write(JSON.stringify(list, null, 2) + EOL)
    timer.stop()
  },
})
