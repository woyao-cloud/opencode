/**
 * util/token - Token 估算工具
 *
 * 功能概述：
 * - 基于字符数粗略估算文本的 token 数量
 *
 * 核心导出：
 * - estimate：估算输入字符串的 token 数（每 4 字符 ≈ 1 token）
 *
 * 架构位置：通用工具层，无其他依赖
 */

const CHARS_PER_TOKEN = 4

export function estimate(input: string) {
  return Math.max(0, Math.round((input || "").length / CHARS_PER_TOKEN))
}

export * as Token from "./token"
