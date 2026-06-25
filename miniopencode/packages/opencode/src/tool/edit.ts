/**
 * tool/edit.ts — 文件编辑工具
 *
 * 支持对文件进行精确的文本替换编辑
 */

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"
import type { Def } from "./tool"
import fs from "fs"

const log = Log.create({ service: "tool.edit" })

export const EditTool: Def<any> = {
  name: "edit",
  description: "编辑文件：查找并替换文本内容。支持精确匹配和替换",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "文件路径" },
      old_string: { type: "string", description: "要查找的旧文本（必须精确匹配）" },
      new_string: { type: "string", description: "替换后的新文本" },
    },
    required: ["file_path", "old_string", "new_string"],
  },
  execute: (args: { file_path: string; old_string: string; new_string: string }) =>
    Effect.gen(function* () {
      const { file_path, old_string, new_string } = args

      if (!fs.existsSync(file_path)) {
        return `错误: 文件不存在: ${file_path}`
      }

      const content = fs.readFileSync(file_path, "utf-8")
      const index = content.indexOf(old_string)

      if (index === -1) {
        return `错误: 在文件中未找到匹配的文本。请确保 old_string 与文件内容完全匹配（包括缩进和换行）`
      }

      const newContent = content.replace(old_string, new_string)
      fs.writeFileSync(file_path, newContent, "utf-8")

      log.info("file edited", { file: file_path })
      return `已编辑文件 ${file_path}：替换了 ${old_string.length} 个字符`
    }),
}
