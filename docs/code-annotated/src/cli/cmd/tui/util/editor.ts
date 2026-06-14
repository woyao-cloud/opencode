/**
 * cli/cmd/tui/util/editor.ts - 外部编辑器工具
 * 功能概述：在外部编辑器中打开文本，等待编辑完成后读取结果
 * 核心导出：open, Editor
 * 架构位置：TUI 组件
 */
import { defer } from "@/util/defer"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CliRenderer } from "@opentui/core"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"

export async function open(opts: { value: string; renderer: CliRenderer }): Promise<string | undefined> {
  const editor = process.env["VISUAL"] || process.env["EDITOR"]
  if (!editor) return

  const filepath = join(tmpdir(), `${Date.now()}.md`)
  await using _ = defer(async () => rm(filepath, { force: true }))

  await Filesystem.write(filepath, opts.value)
  opts.renderer.suspend()
  opts.renderer.currentRenderBuffer.clear()
  try {
    const parts = editor.split(" ")
    const proc = Process.spawn([...parts, filepath], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      shell: process.platform === "win32",
    })
    await proc.exited
    const content = await Filesystem.readText(filepath)
    return content || undefined
  } finally {
    opts.renderer.currentRenderBuffer.clear()
    opts.renderer.resume()
    opts.renderer.requestRender()
  }
}

export * as Editor from "./editor"
