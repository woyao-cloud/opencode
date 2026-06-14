/**
 * skill/discovery - 技能远程发现与下载模块
 *
 * 功能概述：
 * - 从远程 URL 拉取技能索引（index.json）和技能文件
 * - 将技能文件缓存到本地磁盘
 * - 支持并发下载（技能级别 4 并发，文件级别 8 并发）
 *
 * 核心导出：
 * - Interface：技能发现服务接口
 * - Service：技能发现服务的 Effect 上下文标签
 * - layer：技能发现服务的 Effect 层实现
 * - defaultLayer：默认依赖注入的完整 Layer
 *
 * 架构位置：Skill 模块的下层依赖，负责从远程源获取技能包，
 * 被 skill/index.ts 中的 Skill Service 调用
 */

import { NodePath } from "@effect/platform-node"
import { Effect, Layer, Path, Schema, Context } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { withTransientReadRetry } from "@/util/effect-http-client"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Global } from "@opencode-ai/core/global"
import * as Log from "@opencode-ai/core/util/log"

// 技能下载并发数：同时下载 4 个技能
const skillConcurrency = 4
// 文件下载并发数：同一技能内同时下载 8 个文件
const fileConcurrency = 8

/** 索引中的单个技能条目 Schema：名称 + 文件列表 */
class IndexSkill extends Schema.Class<IndexSkill>("IndexSkill")({
  name: Schema.String,
  files: Schema.Array(Schema.String),
}) {}

/** 技能仓库索引 Schema：包含多个技能条目 */
class Index extends Schema.Class<Index>("Index")({
  skills: Schema.Array(IndexSkill),
}) {}

/**
 * 技能发现服务接口。
 * 提供从远程 URL 拉取技能包的能力。
 */
export interface Interface {
  readonly pull: (url: string) => Effect.Effect<string[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SkillDiscovery") {}

export const layer: Layer.Layer<Service, never, AppFileSystem.Service | Path.Path | HttpClient.HttpClient> =
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const log = Log.create({ service: "skill-discovery" })
      const fs = yield* AppFileSystem.Service
      const path = yield* Path.Path
      const http = HttpClient.filterStatusOk(withTransientReadRetry(yield* HttpClient.HttpClient))
      const cache = path.join(Global.Path.cache, "skills")

      // 下载单个文件到缓存目录（若已存在则跳过）
      const download = Effect.fn("Discovery.download")(function* (url: string, dest: string) {
        if (yield* fs.exists(dest).pipe(Effect.orDie)) return true

        return yield* HttpClientRequest.get(url).pipe(
          http.execute,
          Effect.flatMap((res) => res.arrayBuffer),
          Effect.flatMap((body) => fs.writeWithDirs(dest, new Uint8Array(body))),
          Effect.as(true),
          Effect.catch((err) =>
            Effect.sync(() => {
              log.error("failed to download", { url, err })
              return false
            }),
          ),
        )
      })

      // 从远程 URL 拉取技能索引，并下载所有有效技能的文件到本地缓存
      const pull = Effect.fn("Discovery.pull")(function* (url: string) {
        const base = url.endsWith("/") ? url : `${url}/`
        const index = new URL("index.json", base).href
        const host = base.slice(0, -1)

        log.info("fetching index", { url: index })

        const data = yield* HttpClientRequest.get(index).pipe(
          HttpClientRequest.acceptJson,
          http.execute,
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Index)),
          Effect.catch((err) =>
            Effect.sync(() => {
              log.error("failed to fetch index", { url: index, err })
              return null
            }),
          ),
        )

        if (!data) return []

        const list = data.skills.filter((skill) => {
          if (!skill.files.includes("SKILL.md")) {
            log.warn("skill entry missing SKILL.md", { url: index, skill: skill.name })
            return false
          }
          return true
        })

        const dirs = yield* Effect.forEach(
          list,
          (skill) =>
            Effect.gen(function* () {
              const root = path.join(cache, skill.name)

              yield* Effect.forEach(
                skill.files,
                (file) => download(new URL(file, `${host}/${skill.name}/`).href, path.join(root, file)),
                {
                  concurrency: fileConcurrency,
                },
              )

              const md = path.join(root, "SKILL.md")
              return (yield* fs.exists(md).pipe(Effect.orDie)) ? root : null
            }),
          { concurrency: skillConcurrency },
        )

        return dirs.filter((dir): dir is string => dir !== null)
      })

      return Service.of({ pull })
    }),
  )

export const defaultLayer: Layer.Layer<Service> = layer.pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(NodePath.layer),
)

export * as Discovery from "./discovery"
