/**
 * tool/external-directory.ts — 外部目录访问工具
 */

import { Effect } from "effect"
import type { Def } from "./tool"
import fs from "fs"
import path from "path"

export const ExternalDirectoryTool: Def<any> = {
  name: "external_directory",
  description: "列出或读取指定目录中的文件。用于探索项目外的文件系统",
  parameters: {
    type: "object",
    properties: {
      dir_path: { type: "string", description: "目录路径" },
      action: { type: "string", enum: ["list", "tree"], description: "list=扁平列表, tree=递归树形", default: "list" },
      max_depth: { type: "number", description: "最大深度（tree 模式）", default: 3 },
      max_entries: { type: "number", description: "最大条目数", default: 50 },
    },
    required: ["dir_path"],
  },
  execute: (args: { dir_path: string; action?: string; max_depth?: number; max_entries?: number }) =>
    Effect.sync(() => {
      const { dir_path, action = "list", max_depth = 3, max_entries = 50 } = args
      const resolved = path.resolve(dir_path)
      if (!fs.existsSync(resolved)) return `错误: 目录不存在: ${resolved}`
      if (!fs.statSync(resolved).isDirectory()) return `错误: 不是目录: ${resolved}`
      if (action === "tree") {
        return treeWalk(resolved, "", 0, max_depth, max_entries).join("\n") || "(空目录)"
      }
      const entries = fs.readdirSync(resolved).slice(0, max_entries)
      return entries.map((e) => {
        const full = path.join(resolved, e)
        const stat = fs.statSync(full)
        return `${stat.isDirectory() ? "📁" : "📄"} ${e} (${formatSize(stat.size)})`
      }).join("\n") || "(空目录)"
    }),
}

function treeWalk(dir: string, prefix: string, depth: number, maxDepth: number, maxEntries: number): string[] {
  if (depth >= maxDepth) return [`${prefix}...`]
  const entries = fs.readdirSync(dir).slice(0, maxEntries)
  return entries.flatMap((e, i) => {
    const full = path.join(dir, e)
    const isLast = i === entries.length - 1
    const marker = isLast ? "└── " : "├── "
    const childPrefix = isLast ? "    " : "│   "
    try {
      const stat = fs.statSync(full)
      if (stat.isDirectory()) {
        return [
          `${prefix}${marker}📁 ${e}`,
          ...treeWalk(full, prefix + childPrefix, depth + 1, maxDepth, maxEntries),
        ]
      }
      return [`${prefix}${marker}📄 ${e} (${formatSize(stat.size)})`]
    } catch {
      return [`${prefix}${marker}${e}`]
    }
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
