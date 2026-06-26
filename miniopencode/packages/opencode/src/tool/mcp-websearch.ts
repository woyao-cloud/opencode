/**
 * tool/mcp-websearch.ts — 基于 MCP 的 Web 搜索工具
 */

import { Effect } from "effect"
import type { Def } from "./tool"

export const McpWebSearchTool: Def<any> = {
  name: "mcp_websearch",
  description: "通过 MCP 服务器进行 Web 搜索。返回搜索结果摘要",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索查询" },
      max_results: { type: "number", description: "最大结果数", default: 5 },
    },
    required: ["query"],
  },
  execute: (args: { query: string; max_results?: number }) =>
    Effect.gen(function* () {
      const max = args.max_results ?? 5
      const encoded = encodeURIComponent(args.query)
      const url = `https://html.duckduckgo.com/html/?q=${encoded}`
      const res = yield* Effect.tryPromise({
        try: () => fetch(url, { headers: { "User-Agent": "miniopencode/1.0" } }),
        catch: (err) => new Error(`搜索请求失败: ${err}`),
      })
      if (!res.ok) return `搜索失败: HTTP ${res.status}`
      const html = yield* Effect.tryPromise({
        try: () => res.text(),
        catch: (err) => new Error(`读取响应失败: ${err}`),
      })
      const results = extractResults(html).slice(0, max)
      if (results.length === 0) return "未找到搜索结果"
      return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`).join("\n\n")
    }),
}

function extractResults(html: string): Array<{ title: string; snippet: string; url: string }> {
  const results: Array<{ title: string; snippet: string; url: string }> = []
  const classPattern = /class="result__body">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g
  let match
  while ((match = classPattern.exec(html)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/class="result__title"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)
    if (titleMatch) {
      results.push({
        title: stripHtml(titleMatch[2]).trim(),
        snippet: snippetMatch ? stripHtml(snippetMatch[1]).trim() : "",
        url: titleMatch[1],
      })
    }
  }
  return results
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
}
