/**
 * [config/entry-name] - 配置文件入口名称提取工具
 *
 * 功能概述：
 * - 从文件路径中提取配置条目的名称（去除目录前缀和扩展名）
 *
 * 核心导出：
 * - configEntryNameFromPath：从文件路径提取配置条目名称
 *
 * 架构位置：位于 config 层的工具模块，被 agent.ts、command.ts 等调用
 */
import path from "path"

function sliceAfterMatch(filePath: string, searchRoots: string[]) {
  const normalizedPath = filePath.replaceAll("\\", "/")
  for (const searchRoot of searchRoots) {
    const index = normalizedPath.indexOf(searchRoot)
    if (index === -1) continue
    return normalizedPath.slice(index + searchRoot.length)
  }
}

export function configEntryNameFromPath(filePath: string, searchRoots: string[]) {
  const candidate = sliceAfterMatch(filePath, searchRoots) ?? path.basename(filePath)
  const ext = path.extname(candidate)
  return ext.length ? candidate.slice(0, -ext.length) : candidate
}
