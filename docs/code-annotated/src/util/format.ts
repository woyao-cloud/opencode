/**
 * util/format - 时间格式化工具
 *
 * 功能概述：
 * - 将秒数格式化为人类可读的时间段字符串
 * - 支持从秒到周的各级别格式化
 *
 * 核心导出：
 * - formatDuration：将秒数转换为 "1h 30m" 等格式
 *
 * 架构位置：通用工具层，无其他依赖
 */

export function formatDuration(secs: number) {
  if (secs <= 0) return ""
  if (secs < 60) return `${secs}s`
  if (secs < 3600) {
    const mins = Math.floor(secs / 60)
    const remaining = secs % 60
    return remaining > 0 ? `${mins}m ${remaining}s` : `${mins}m`
  }
  if (secs < 86400) {
    const hours = Math.floor(secs / 3600)
    const remaining = Math.floor((secs % 3600) / 60)
    return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
  }
  if (secs < 604800) {
    const days = Math.floor(secs / 86400)
    return days === 1 ? "~1 day" : `~${days} days`
  }
  const weeks = Math.floor(secs / 604800)
  return weeks === 1 ? "~1 week" : `~${weeks} weeks`
}
