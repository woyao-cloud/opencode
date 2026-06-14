/**
 * util/which - 可执行文件查找工具
 *
 * 功能概述：
 * - 在 PATH 中查找可执行文件路径，类似 Unix which 命令
 *
 * 核心导出：
 * - which：查找命令的可执行文件路径，未找到返回 null
 *
 * 架构位置：通用工具层，依赖 Global 模块和 which 库
 */

import whichPkg from "which"
import path from "path"
import { Global } from "@opencode-ai/core/global"

export function which(cmd: string, env?: NodeJS.ProcessEnv) {
  const base = env?.PATH ?? env?.Path ?? process.env.PATH ?? process.env.Path ?? ""
  const full = base ? base + path.delimiter + Global.Path.bin : Global.Path.bin
  const result = whichPkg.sync(cmd, {
    nothrow: true,
    path: full,
    pathExt: env?.PATHEXT ?? env?.PathExt ?? process.env.PATHEXT ?? process.env.PathExt,
  })
  return typeof result === "string" ? result : null
}
