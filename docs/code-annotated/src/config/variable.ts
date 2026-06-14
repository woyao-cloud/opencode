/**
 * [config/variable] - 变量替换模块
 *
 * 功能概述：
 * - 在配置文本中执行变量替换（如 ${HOME}、${env:VAR} 等）
 * - 支持路径和虚拟文本两种解析源
 *
 * 核心导出：
 * - substitute()：在配置文本中替换变量引用
 *
 * 架构位置：上游依赖文件系统；下游被 config/config.ts 引用
 */
export * as ConfigVariable from "./variable"

import path from "path"
import os from "os"
import { Filesystem } from "@/util/filesystem"
import { InvalidError } from "./error"

type ParseSource =
  | {
      type: "path"
      path: string
    }
  | {
      type: "virtual"
      source: string
      dir: string
    }

type SubstituteInput = ParseSource & {
  text: string
  missing?: "error" | "empty"
}

function source(input: ParseSource) {
  return input.type === "path" ? input.path : input.source
}

function dir(input: ParseSource) {
  return input.type === "path" ? path.dirname(input.path) : input.dir
}

/** Apply {env:VAR} and {file:path} substitutions to config text. */
export async function substitute(input: SubstituteInput) {
  const missing = input.missing ?? "error"
  let text = input.text.replace(/\{env:([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || ""
  })

  const fileMatches = Array.from(text.matchAll(/\{file:[^}]+\}/g))
  if (!fileMatches.length) return text

  const configDir = dir(input)
  const configSource = source(input)
  let out = ""
  let cursor = 0

  for (const match of fileMatches) {
    const token = match[0]
    const index = match.index!
    out += text.slice(cursor, index)

    const lineStart = text.lastIndexOf("\n", index - 1) + 1
    const prefix = text.slice(lineStart, index).trimStart()
    if (prefix.startsWith("//")) {
      out += token
      cursor = index + token.length
      continue
    }

    let filePath = token.replace(/^\{file:/, "").replace(/\}$/, "")
    if (filePath.startsWith("~/")) {
      filePath = path.join(os.homedir(), filePath.slice(2))
    }

    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(configDir, filePath)
    const fileContent = (
      await Filesystem.readText(resolvedPath).catch((error: NodeJS.ErrnoException) => {
        if (missing === "empty") return ""

        const errMsg = `bad file reference: "${token}"`
        if (error.code === "ENOENT") {
          throw new InvalidError(
            {
              path: configSource,
              message: errMsg + ` ${resolvedPath} does not exist`,
            },
            { cause: error },
          )
        }
        throw new InvalidError({ path: configSource, message: errMsg }, { cause: error })
      })
    ).trim()

    out += JSON.stringify(fileContent).slice(1, -1)
    cursor = index + token.length
  }

  out += text.slice(cursor)
  return out
}
