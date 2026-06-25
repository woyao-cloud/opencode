/**
 * pty/index.ts — PTY 服务层
 *
 * 管理伪终端会话的生命周期
 * 集成到 miniopencode 的 Layer 系统中
 */

import { Effect, Layer, Context, Schema } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { spawn, type Proc } from "./pty"
import type { PtyInfo, CreateInput } from "./schema"
import { PtyID } from "./schema"

const log = Log.create({ service: "pty" })

// ===== 活跃会话状态 =====

interface ActiveSession {
  info: PtyInfo
  process: Proc
  buffer: string
  cursor: number
}

// ===== 服务接口 =====

export interface PtyService {
  readonly list: () => Effect.Effect<PtyInfo[]>
  readonly create: (input: CreateInput) => Effect.Effect<PtyInfo>
  readonly write: (id: string, data: string) => Effect.Effect<void>
  readonly resize: (id: string, cols: number, rows: number) => Effect.Effect<void>
  readonly kill: (id: string) => Effect.Effect<void>
  readonly getBuffer: (id: string, from?: number) => Effect.Effect<string | undefined>
}

// ===== Context Tag =====

export class PtyServiceTag extends Context.Service<PtyServiceTag, PtyService>()("@miniopencode/Pty") {}

// ===== Layer 实现 =====

export const PtyLive = Layer.effect(
  PtyServiceTag,
  Effect.gen(function* () {
    const sessions = new Map<string, ActiveSession>()
    let idCounter = 0
    const nextId = () => `pty-${++idCounter}`

    return {
      list: () =>
        Effect.sync(() =>
          Array.from(sessions.values()).map((s) => s.info),
        ),

      create: (input: CreateInput) =>
        Effect.gen(function* () {
          const id = nextId()
          const command = input.command ?? "bash"
          const args = input.args ?? []
          const cwd = input.cwd ?? process.cwd()

          log.info("creating PTY session", { id, command, args, cwd })
          const proc = yield* spawn(command, args, { cwd, env: input.env })

          const info: PtyInfo = {
            id,
            title: input.title ?? `Terminal ${id}`,
            command,
            args,
            cwd,
            status: "running",
            pid: proc.pid,
          }

          const session: ActiveSession = { info, process: proc, buffer: "", cursor: 0 }

          proc.onData((chunk) => {
            session.buffer += chunk
            session.cursor += chunk.length
          })

          proc.onExit(({ exitCode }) => {
            log.info("PTY session exited", { id, exitCode })
            session.info = { ...session.info, status: "exited" }
          })

          sessions.set(id, session)
          return info
        }),

      write: (id: string, data: string) =>
        Effect.sync(() => {
          const session = sessions.get(id)
          if (session && session.info.status === "running") {
            session.process.write(data)
          }
        }),

      resize: (id: string, cols: number, rows: number) =>
        Effect.sync(() => {
          const session = sessions.get(id)
          if (session && session.info.status === "running") {
            session.process.resize(cols, rows)
          }
        }),

      kill: (id: string) =>
        Effect.sync(() => {
          const session = sessions.get(id)
          if (session) {
            session.process.kill()
            sessions.delete(id)
          }
        }),

      getBuffer: (id: string, from?: number) =>
        Effect.sync(() => {
          const session = sessions.get(id)
          if (!session) return undefined
          if (from !== undefined) {
            return session.buffer.slice(from)
          }
          return session.buffer
        }),
    }
  }),
)
