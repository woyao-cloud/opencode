/**
 * pty/pty.ts — PTY 进程管理
 *
 * 基于 Bun.spawn 的伪终端实现
 * 参考: packages/opencode/src/pty/pty.ts, pty.bun.ts
 */

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "pty" })

// ===== 类型定义 =====

export interface ExitEvent {
  exitCode: number
  signal?: number | string
}

export interface Proc {
  readonly pid: number
  readonly onData: (listener: (data: string) => void) => { dispose: () => void }
  readonly onExit: (listener: (event: ExitEvent) => void) => { dispose: () => void }
  readonly write: (data: string) => void
  readonly resize: (cols: number, rows: number) => void
  readonly kill: (signal?: string) => void
}

export interface SpawnOpts {
  name?: string
  cols?: number
  rows?: number
  cwd?: string
  env?: Record<string, string>
}

// ===== Bun 实现 =====

export const spawn = (
  command: string,
  args: string[],
  opts: SpawnOpts,
): Effect.Effect<Proc> =>
  Effect.sync(() => {
    const proc = Bun.spawn([command, ...args], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env, TERM: "xterm-256color" },
      stdio: ["pipe", "pipe", "pipe"],
    })

    const dataListeners: Array<(data: string) => void> = []
    const exitListeners: Array<(event: ExitEvent) => void> = []

    // 读取 stdout
    const reader = proc.stdout?.getReader()
    if (reader) {
      const readLoop = async () => {
        const decoder = new TextDecoder()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value, { stream: true })
            for (const listener of dataListeners) {
              listener(text)
            }
          }
        } catch (err) {
          log.debug("pty read loop ended", { error: String(err) })
        } finally {
          reader.releaseLock()
        }
      }
      readLoop()
    }

    // 读取 stderr（合并到 stdout 输出）
    const stderrReader = proc.stderr?.getReader()
    if (stderrReader) {
      const readLoop = async () => {
        const decoder = new TextDecoder()
        try {
          while (true) {
            const { done, value } = await stderrReader.read()
            if (done) break
            const text = decoder.decode(value, { stream: true })
            for (const listener of dataListeners) {
              listener(text)
            }
          }
        } catch {
          // ignore
        } finally {
          stderrReader.releaseLock()
        }
      }
      readLoop()
    }

    // 等待进程退出
    proc.exited.then((exitCode) => {
      for (const listener of exitListeners) {
        listener({ exitCode })
      }
    })

    return {
      pid: proc.pid,
      onData: (listener) => {
        dataListeners.push(listener)
        return { dispose: () => { const i = dataListeners.indexOf(listener); if (i >= 0) dataListeners.splice(i, 1) } }
      },
      onExit: (listener) => {
        exitListeners.push(listener)
        return { dispose: () => { const i = exitListeners.indexOf(listener); if (i >= 0) exitListeners.splice(i, 1) } }
      },
      write: (data: string) => {
        try { proc.stdin?.write(data) } catch {}
      },
      resize: (cols: number, rows: number) => {
        try { (proc as any).resize?.(cols, rows) } catch {}
      },
      kill: (signal?: string) => {
        try { proc.kill(signal) } catch {}
      },
    }
  })
