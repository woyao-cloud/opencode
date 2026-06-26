/**
 * installation/index.ts — 安装与升级服务
 *
 * 版本检测、更新检查、自动升级
 * 参考: packages/opencode/src/installation/index.ts
 */

import { Effect, Layer, Context } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { Global } from "@miniopencode/core/global"
import { InstallationVersion } from "@miniopencode/core/installation/version"
import fs from "fs"
import path from "path"

const log = Log.create({ service: "installation" })

// ===== 服务接口 =====

export interface InstallationService {
  readonly version: () => Effect.Effect<string>
  readonly checkUpdate: () => Effect.Effect<{ current: string; latest: string; needsUpdate: boolean }>
  readonly upgrade: (target?: string) => Effect.Effect<string>
  readonly uninstall: () => Effect.Effect<string>
}

// ===== Context Tag =====

export class InstallationServiceTag extends Context.Service<InstallationServiceTag, InstallationService>()(
  "@miniopencode/Installation",
) {}

// ===== 实现 =====

const currentVersion = InstallationVersion

const configFile = path.join(Global.Path.home, "miniopencode.json")

// ===== Layer =====

export const InstallationLive = Layer.effect(
  InstallationServiceTag,
  Effect.gen(function* () {
    return {
      version: () => Effect.succeed(currentVersion),

      checkUpdate: () =>
        Effect.gen(function* () {
          const result = yield* Effect.tryPromise({
            try: async () => {
              const res = await fetch("https://registry.npmjs.org/miniopencode/latest")
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              const data = await res.json()
              return data.version as string
            },
            catch: () => "unknown",
          })

          return {
            current: currentVersion,
            latest: result,
            needsUpdate: result !== "unknown" && result !== currentVersion,
          }
        }),

      upgrade: (target?: string) =>
        Effect.gen(function* () {
          const cmd = target
            ? `bun install -g miniopencode@${target}`
            : "bun install -g miniopencode@latest"
          log.info("upgrading", { target: target ?? "latest" })
          try {
            const proc = Bun.spawn(cmd.split(" "), { stdio: ["ignore", "pipe", "pipe"] })
            const exitCode = yield* Effect.promise(() => proc.exited)
            if (exitCode !== 0) {
              return `升级失败，退出码: ${exitCode}`
            }
            return `已升级到 ${target ?? "最新版本"}`
          } catch (err) {
            return `升级失败: ${String(err)}`
          }
        }),

      uninstall: () =>
        Effect.gen(function* () {
          const dirs = [Global.Path.home, Global.Path.data, Global.Path.state]
          const removed: string[] = []

          for (const dir of dirs) {
            if (fs.existsSync(dir)) {
              try {
                fs.rmSync(dir, { recursive: true, force: true })
                removed.push(dir)
              } catch {}
            }
          }

          // 移除全局二进制
          try {
            const binPath = path.join(process.env.APPDATA ?? "~/.local/bin", "miniopencode")
            if (fs.existsSync(binPath)) {
              fs.unlinkSync(binPath)
              removed.push(binPath)
            }
          } catch {}

          log.info("uninstalled", { dirs: removed.length })
          return `已卸载 miniopencode，清理了 ${removed.length} 个路径`
        }),
    }
  }),
)
