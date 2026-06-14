/**
 * util/bom - BOM（字节顺序标记）处理工具
 *
 * 功能概述：
 * - 检测和移除/添加 UTF-8 BOM 字符
 * - 提供带 BOM 感知的文件读写功能
 *
 * 核心导出：
 * - split：分离 BOM 与文本内容
 * - join：按需添加 BOM
 * - readFile：读取文件并检测 BOM
 * - syncFile：同步文件 BOM 状态
 *
 * 架构位置：通用工具层，依赖 effect 框架和 AppFileSystem
 */

import { Effect } from "effect"
import { AppFileSystem } from "@opencode-ai/core/filesystem"

const BOM_CODE = 0xfeff
const BOM = String.fromCharCode(BOM_CODE)

export function split(text: string) {
  if (text.charCodeAt(0) !== BOM_CODE) return { bom: false, text }
  return { bom: true, text: text.slice(1) }
}

export function join(text: string, bom: boolean) {
  const stripped = split(text).text
  if (!bom) return stripped
  return BOM + stripped
}

export const readFile = Effect.fn("Bom.readFile")(function* (fs: AppFileSystem.Interface, filePath: string) {
  return split(new TextDecoder("utf-8", { ignoreBOM: true }).decode(yield* fs.readFile(filePath)))
})

export const syncFile = Effect.fn("Bom.syncFile")(function* (
  fs: AppFileSystem.Interface,
  filePath: string,
  bom: boolean,
) {
  const current = yield* readFile(fs, filePath)
  if (current.bom === bom) return current.text
  yield* fs.writeWithDirs(filePath, join(current.text, bom))
  return current.text
})
