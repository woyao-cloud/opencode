/**
 * Trace - 开发用 JSONL 事件追踪
 *
 * 功能概述：
 * - 由 OPENCODE_DIRECT_TRACE=1 环境变量启用
 * - 将每个事件写入 ~/.local/share/opencode/log/direct/<timestamp>-<pid>.jsonl
 * - 同时写入 latest.json 指针便于快速定位最新追踪文件
 * - 捕获完整闭环：出站 prompt、入站 SDK 事件、reducer 输出、footer 提交和 turn 生命周期标记
 * - 惰性初始化：首次调用 trace() 时根据环境变量决定是否启用
 *
 * 核心导出：
 * - trace(): 获取 Trace 实例，未启用时返回 undefined
 * - Trace 类型：包含 write 方法
 *
 * 架构位置：run 命令的调试工具层，用于排查流排序、权限行为和 footer/transcript 不匹配问题
 */
import fs from "fs"
import path from "path"
import { Global } from "@opencode-ai/core/global"

export type Trace = {
  write(type: string, data?: unknown): void
}

let state: Trace | false | undefined

function stamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")
}

function file() {
  return path.join(Global.Path.log, "direct", `${stamp()}-${process.pid}.jsonl`)
}

function latest() {
  return path.join(Global.Path.log, "direct", "latest.json")
}

function text(data: unknown) {
  return JSON.stringify(
    data,
    (_key, value) => {
      if (typeof value === "bigint") {
        return String(value)
      }

      return value
    },
    0,
  )
}

/**
 * 获取 Trace 实例。首次调用时根据 OPENCODE_DIRECT_TRACE 环境变量决定是否启用追踪。
 * 启用后创建 JSONL 文件和 latest.json 指针。后续调用返回缓存的 Trace 或 undefined。
 */
export function trace(): Trace | undefined {
  if (state !== undefined) {
    return state || undefined
  }

  if (!process.env.OPENCODE_DIRECT_TRACE) {
    state = false
    return undefined
  }

  const target = file()
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(
    latest(),
    text({
      time: new Date().toISOString(),
      pid: process.pid,
      cwd: process.cwd(),
      argv: process.argv.slice(2),
      path: target,
    }) + "\n",
  )
  state = {
    write(type: string, data?: unknown) {
      fs.appendFileSync(
        target,
        text({
          time: new Date().toISOString(),
          pid: process.pid,
          type,
          data,
        }) + "\n",
      )
    },
  }
  state.write("trace.start", {
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    path: target,
  })
  return state
}
