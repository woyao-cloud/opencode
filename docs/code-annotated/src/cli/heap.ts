/**
 * cli/heap - 自动堆快照工具
 *
 * 功能概述：
 * - 定时监控进程 RSS 内存用量，超过 2GB 阈值时自动触发 V8 堆快照
 * - 防止重复触发（armed/lock 机制），快照写入日志目录
 *
 * 核心导出：
 * - start(): 启动自动堆快照监控定时器
 *
 * 架构位置：CLI 层诊断工具模块，被入口引导流程调用，依赖 node:v8 writeHeapSnapshot
 */

import path from "path"
import { writeHeapSnapshot } from "node:v8"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "heap" })
const MINUTE = 60_000
const LIMIT = 2 * 1024 * 1024 * 1024

let timer: Timer | undefined
let lock = false
let armed = true

export function start() {
  if (!Flag.OPENCODE_AUTO_HEAP_SNAPSHOT) return
  if (timer) return

  const run = async () => {
    if (lock) return

    const stat = process.memoryUsage()
    if (stat.rss <= LIMIT) {
      armed = true
      return
    }
    if (!armed) return

    lock = true
    armed = false
    const file = path.join(
      Global.Path.log,
      `heap-${process.pid}-${new Date().toISOString().replace(/[:.]/g, "")}.heapsnapshot`,
    )
    log.warn("heap usage exceeded limit", {
      rss: stat.rss,
      heap: stat.heapUsed,
      file,
    })

    await Promise.resolve()
      .then(() => writeHeapSnapshot(file))
      .catch((err) => {
        log.error("failed to write heap snapshot", {
          error: err instanceof Error ? err.message : String(err),
          file,
        })
      })

    lock = false
  }

  timer = setInterval(() => {
    void run()
  }, MINUTE)
  timer.unref?.()
}

export * as Heap from "./heap"
