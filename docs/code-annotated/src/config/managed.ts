/**
 * [config/managed] - 托管配置模块（macOS MDM / 移动设备管理）
 *
 * 功能概述：
 * - 从 macOS 托管属性列表（mobileconfig）中读取企业管理的配置
 * - 支持从文件系统和 shell 命令两种方式加载 plist
 *
 * 核心导出：
 * - find：查找并解析受管配置来源
 *
 * 架构位置：上游依赖 macOS 系统 plist；下游被 config/config.ts 引用
 */
export * as ConfigManaged from "./managed"

import { existsSync } from "fs"
import os from "os"
import path from "path"
import * as Log from "@opencode-ai/core/util/log"
import { Process } from "@/util/process"
import { warn } from "console"

const log = Log.create({ service: "config" })

const MANAGED_PLIST_DOMAIN = "ai.opencode.managed"

// Keys injected by macOS/MDM into the managed plist that are not OpenCode config
const PLIST_META = new Set([
  "PayloadDisplayName",
  "PayloadIdentifier",
  "PayloadType",
  "PayloadUUID",
  "PayloadVersion",
  "_manualProfile",
])

function systemManagedConfigDir(): string {
  switch (process.platform) {
    case "darwin":
      return "/Library/Application Support/opencode"
    case "win32":
      return path.join(process.env.ProgramData || "C:\\ProgramData", "opencode")
    default:
      return "/etc/opencode"
  }
}

export function managedConfigDir() {
  return process.env.OPENCODE_TEST_MANAGED_CONFIG_DIR || systemManagedConfigDir()
}

export function parseManagedPlist(json: string): string {
  const raw = JSON.parse(json)
  for (const key of Object.keys(raw)) {
    if (PLIST_META.has(key)) delete raw[key]
  }
  return JSON.stringify(raw)
}

export async function readManagedPreferences() {
  if (process.platform !== "darwin") return

  const user = os.userInfo().username
  const paths = [
    path.join("/Library/Managed Preferences", user, `${MANAGED_PLIST_DOMAIN}.plist`),
    path.join("/Library/Managed Preferences", `${MANAGED_PLIST_DOMAIN}.plist`),
  ]

  for (const plist of paths) {
    if (!existsSync(plist)) continue
    log.info("reading macOS managed preferences", { path: plist })
    const result = await Process.run(["plutil", "-convert", "json", "-o", "-", plist], { nothrow: true })
    if (result.code !== 0) {
      log.warn("failed to convert managed preferences plist", { path: plist })
      continue
    }
    return {
      source: `mobileconfig:${plist}`,
      text: parseManagedPlist(result.stdout.toString()),
    }
  }

  return
}
