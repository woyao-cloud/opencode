/**
 * session/overflow - Token 溢出检测：判断是否需要触发上下文压缩
 *
 * 功能概述：
 * - usable：计算模型可用的 Token 上限（总上下文减去保留缓冲）
 * - isOverflow：判断当前 Token 用量是否超过可用上限
 * - 支持通过配置禁用自动压缩（compaction.auto = false）
 * - 保留缓冲可通过配置调整
 *
 * 核心导出：
 * - usable：可用 Token 计算函数
 * - isOverflow：溢出检测函数
 *
 * 架构位置：会话系统的上下文监控层。
 * 上游依赖：Config、Provider、ProviderTransform
 * 下游消费：session/compaction.ts（压缩触发判断）、session/processor.ts
 */

import type { Config } from "@/config/config"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import type { MessageV2 } from "./message-v2"

const COMPACTION_BUFFER = 20_000

/**
 * 计算模型可用的 Token 上限
 *
 * @param input.cfg - 配置信息（含 compaction.reserved 自定义保留缓冲）
 * @param input.model - Provider 模型信息（含 context limit）
 * @param input.outputTokenMax - 可选的最大输出 Token 限制
 * @returns 可用的 Token 数量
 */
export function usable(input: { cfg: Config.Info; model: Provider.Model; outputTokenMax?: number }) {
  const context = input.model.limit.context
  if (context === 0) return 0

  const reserved =
    input.cfg.compaction?.reserved ??
    Math.min(COMPACTION_BUFFER, ProviderTransform.maxOutputTokens(input.model, input.outputTokenMax))
  return input.model.limit.input
    ? Math.max(0, input.model.limit.input - reserved)
    : Math.max(0, context - ProviderTransform.maxOutputTokens(input.model, input.outputTokenMax))
}

/**
 * 判断 Token 用量是否超过模型可用上限
 *
 * @param input.cfg - 配置信息
 * @param input.tokens - 当前 Token 用量统计
 * @param input.model - Provider 模型信息
 * @param input.outputTokenMax - 可选的最大输出 Token 限制
 * @returns 是否超过可用上限
 */
export function isOverflow(input: {
  cfg: Config.Info
  tokens: MessageV2.Assistant["tokens"]
  model: Provider.Model
  outputTokenMax?: number
}) {
  if (input.cfg.compaction?.auto === false) return false
  if (input.model.limit.context === 0) return false

  const count =
    input.tokens.total || input.tokens.input + input.tokens.output + input.tokens.cache.read + input.tokens.cache.write
  return count >= usable(input)
}
