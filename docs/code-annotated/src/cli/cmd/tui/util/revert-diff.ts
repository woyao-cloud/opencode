/**
 * cli/cmd/tui/util/revert-diff.ts - Diff 解析工具
 * 功能概述：解析补丁文本，提取文件名和增删行统计
 * 核心导出：getRevertDiffFiles
 * 架构位置：TUI 组件
 */
import { parsePatch } from "diff"

export function getRevertDiffFiles(diffText: string) {
  if (!diffText) return []

  try {
    return parsePatch(diffText).map((patch) => {
      const filename = [patch.newFileName, patch.oldFileName].find((item) => item && item !== "/dev/null") ?? "unknown"
      return {
        filename: filename.replace(/^[ab]\//, ""),
        additions: patch.hunks.reduce((sum, hunk) => sum + hunk.lines.filter((line) => line.startsWith("+")).length, 0),
        deletions: patch.hunks.reduce((sum, hunk) => sum + hunk.lines.filter((line) => line.startsWith("-")).length, 0),
      }
    })
  } catch {
    return []
  }
}
