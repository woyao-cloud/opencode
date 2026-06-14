/**
 * cli/cmd/prompt-display - 提示文本显示计算工具
 *
 * 功能概述：
 * - 提供提示文本的宽度计算和偏移量索引计算函数
 * - 使用 Intl.Segmenter 处理 Unicode 字素簇宽度
 *
 * 核心导出：
 * - promptOffsetWidth(value): 计算提示文本显示宽度
 * - displayOffsetIndex(value, offset): 计算显示偏移对应的字符索引
 *
 * 架构位置：CLI 层工具模块，被 prompt 相关组件用于提示文本渲染定位
 */

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function promptOffsetWidth(value: string) {
  let width = 0
  for (const part of graphemes.segment(value)) {
    // Textarea offsets count newlines as one position; Bun.stringWidth counts them as zero.
    width += part.segment === "\n" ? 1 : Bun.stringWidth(part.segment)
  }
  return width
}

function displayOffsetIndex(value: string, offset: number) {
  if (offset <= 0) return 0

  let width = 0
  for (const part of graphemes.segment(value)) {
    const next = width + promptOffsetWidth(part.segment)
    if (next > offset) return part.index
    width = next
  }

  return value.length
}

export function displaySlice(value: string, start = 0, end = promptOffsetWidth(value)) {
  return value.slice(displayOffsetIndex(value, start), displayOffsetIndex(value, end))
}

export function displayCharAt(value: string, offset: number) {
  let width = 0
  for (const part of graphemes.segment(value)) {
    const next = width + promptOffsetWidth(part.segment)
    if (offset === width || offset < next) return part.segment
    width = next
  }
}

export function mentionTriggerIndex(value: string, offset = promptOffsetWidth(value)) {
  const text = displaySlice(value, 0, offset)
  const index = text.lastIndexOf("@")
  if (index === -1) return

  const before = index === 0 ? undefined : text[index - 1]
  const query = text.slice(index)
  if ((before === undefined || /\s/.test(before)) && !/\s/.test(query)) {
    return promptOffsetWidth(text.slice(0, index))
  }
}
