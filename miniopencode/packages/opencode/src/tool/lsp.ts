/**
 * tool/lsp.ts — LSP 工具
 *
 * 将 LSP 能力暴露为 AI 可调用的工具
 */

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { LSPServiceTag } from "@/lsp/lsp"
import type { Def } from "./tool"

const log = Log.create({ service: "tool.lsp" })

/**
 * 创建 LSP 诊断工具
 */
export const LspDiagnosticsTool: Def<any> = {
  name: "lsp_diagnostics",
  description: "获取文件的 LSP 诊断信息（错误、警告、提示）",
  parameters: {
    type: "object",
    properties: {
      uri: { type: "string", description: "文件 URI (file:///path/to/file.ts)" },
    },
    required: ["uri"],
  },
  execute: (args: { uri: string }) =>
    Effect.gen(function* () {
      const lsp = yield* LSPServiceTag
      const diags = yield* lsp.diagnostics(args.uri)
      return diags.map((d) =>
        `[${severityLabel(d.severity)}] ${d.message} (${d.range.start.line}:${d.range.start.character})`
      ).join("\n") || "无诊断信息"
    }),
}

/**
 * 创建 LSP 引用查找工具
 */
export const LspReferencesTool: Def<any> = {
  name: "lsp_references",
  description: "查找符号的所有引用位置",
  parameters: {
    type: "object",
    properties: {
      uri: { type: "string", description: "文件 URI" },
      line: { type: "number", description: "行号（从 0 开始）" },
      character: { type: "number", description: "列号（从 0 开始）" },
    },
    required: ["uri", "line", "character"],
  },
  execute: (args: { uri: string; line: number; character: number }) =>
    Effect.gen(function* () {
      const lsp = yield* LSPServiceTag
      const refs = yield* lsp.references(args.uri, args.line, args.character)
      return refs.map((r) => `${r.uri}:${r.range.start.line}:${r.range.start.character}`).join("\n") || "未找到引用"
    }),
}

/**
 * 创建 LSP 跳转定义工具
 */
export const LspDefinitionTool: Def<any> = {
  name: "lsp_definition",
  description: "查找符号的定义位置",
  parameters: {
    type: "object",
    properties: {
      uri: { type: "string", description: "文件 URI" },
      line: { type: "number", description: "行号（从 0 开始）" },
      character: { type: "number", description: "列号（从 0 开始）" },
    },
    required: ["uri", "line", "character"],
  },
  execute: (args: { uri: string; line: number; character: number }) =>
    Effect.gen(function* () {
      const lsp = yield* LSPServiceTag
      const def = yield* lsp.definition(args.uri, args.line, args.character)
      if (!def) return "未找到定义"
      return `${def.uri}:${def.range.start.line}:${def.range.start.character}`
    }),
}

function severityLabel(s?: number): string {
  switch (s) {
    case 1: return "错误"
    case 2: return "警告"
    case 3: return "信息"
    case 4: return "提示"
    default: return "未知"
  }
}
