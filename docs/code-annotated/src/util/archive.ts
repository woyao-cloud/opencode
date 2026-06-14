/**
 * util/archive - 压缩包解压工具
 *
 * 功能概述：
 * - 提供跨平台 ZIP 文件解压功能（Windows 使用 PowerShell，其他平台使用 unzip）
 *
 * 核心导出：
 * - extractZip：解压 ZIP 文件到指定目录
 *
 * 架构位置：通用工具层，依赖 process 模块执行系统命令
 */

import path from "path"
import * as Process from "./process"

export async function extractZip(zipPath: string, destDir: string) {
  if (process.platform === "win32") {
    const winZipPath = path.resolve(zipPath)
    const winDestDir = path.resolve(destDir)
    // $global:ProgressPreference suppresses PowerShell's blue progress bar popup
    const cmd = `$global:ProgressPreference = 'SilentlyContinue'; Expand-Archive -Path '${winZipPath}' -DestinationPath '${winDestDir}' -Force`
    await Process.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd])
    return
  }

  await Process.run(["unzip", "-o", "-q", zipPath, "-d", destDir])
}

export * as Archive from "./archive"
