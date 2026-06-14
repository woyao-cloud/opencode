/**
 * util/data-url - Data URL 解码工具
 *
 * 功能概述：
 * - 解析 data: URL 并解码其内容（支持 base64 和 URL 编码）
 *
 * 核心导出：
 * - decodeDataUrl：将 data URL 解码为原始字符串
 *
 * 架构位置：通用工具层，无其他依赖
 */

export function decodeDataUrl(url: string) {
  const idx = url.indexOf(",")
  if (idx === -1) return ""

  const head = url.slice(0, idx)
  const body = url.slice(idx + 1)
  if (head.includes(";base64")) return Buffer.from(body, "base64").toString("utf8")
  return decodeURIComponent(body)
}
