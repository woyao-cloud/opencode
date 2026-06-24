/**
 * 案例 5: 权限系统 — Schema + Deferred 模式
 *
 * 本 demo 模拟 OpenCode 中 permission/index.ts 的核心模式：
 * 使用 Schema 定义权限请求/回复的数据结构，使用 Deferred 实现
 * 异步审批流程（请求→等待审批→继续/拒绝），使用 Layer 管理服务。
 *
 * 关键 API:
 * - Schema.Struct — 定义结构化 Schema
 * - Schema.Class — 定义带标识的 Schema 类
 * - Schema.TaggedErrorClass — 定义带标签的错误类
 * - Deferred.make / Deferred.await / Deferred.succeed / Deferred.fail
 * - Effect.ensuring — 确保清理逻辑执行
 */

import {
  Context,
  Deferred,
  Duration,
  Effect,
  Layer,
  Queue,
  Schema,
  Console,
} from "effect"

// ============================================================
// 1. 定义权限 Schema — 类似 OpenCode 的 Schema 定义
// ============================================================

// 权限动作 — 类似 OpenCode 的 Action
export const Action = Schema.Literals(["allow", "deny", "ask"])
export type Action = Schema.Schema.Type<typeof Action>

// 权限规则 — 类似 OpenCode 的 Rule
export const Rule = Schema.Struct({
  permission: Schema.String,
  pattern: Schema.String,
  action: Action,
})
export type Rule = Schema.Schema.Type<typeof Rule>

// 权限请求 — 类似 OpenCode 的 Request
export class PermissionRequest extends Schema.Class<PermissionRequest>(
  "PermissionRequest",
)({
  id: Schema.String,
  permission: Schema.String,
  patterns: Schema.Array(Schema.String),
  metadata: Schema.Record(Schema.String, Schema.Unknown),
}) {}

// 权限回复 — 类似 OpenCode 的 Reply
export const Reply = Schema.Literals(["once", "always", "reject"])
export type Reply = Schema.Schema.Type<typeof Reply>

// 权限错误 — 类似 OpenCode 的 RejectedError / DeniedError
export class RejectedError extends Schema.TaggedErrorClass<RejectedError>()(
  "PermissionRejectedError",
  {},
) {
  override get message() {
    return "用户拒绝了此权限请求"
  }
}

export class DeniedError extends Schema.TaggedErrorClass<DeniedError>()(
  "PermissionDeniedError",
  {
    ruleset: Schema.Array(Rule),
  },
) {
  override get message() {
    return `权限规则阻止了此操作: ${JSON.stringify(this.ruleset)}`
  }
}

// ============================================================
// 2. 定义服务接口
// ============================================================

export interface PermissionInterface {
  readonly ask: (
    permission: string,
    patterns: string[],
  ) => Effect.Effect<void, RejectedError | DeniedError>
  readonly reply: (requestId: string, reply: Reply) => Effect.Effect<void>
  readonly pending: () => Effect.Effect<PermissionRequest[]>
}

export class PermissionService extends Context.Service<
  PermissionService,
  PermissionInterface
>()("@demo/Permission") {}

// ============================================================
// 3. 实现权限评估 — 类似 OpenCode 的 evaluate()
// ============================================================

// 通配符匹配 — 类似 OpenCode 的 Wildcard.match
function wildcardMatch(pattern: string, value: string): boolean {
  const regex = new RegExp(
    "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
  )
  return regex.test(value)
}

// 评估权限 — 类似 OpenCode 的 evaluate()
function evaluate(
  permission: string,
  pattern: string,
  rules: Rule[],
): Rule {
  // 从后往前查找匹配的规则
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i]
    if (
      wildcardMatch(rule.permission, permission) &&
      wildcardMatch(rule.pattern, pattern)
    ) {
      return rule
    }
  }
  // 默认: 需要询问
  return { permission, pattern: "*", action: "ask" }
}

// ============================================================
// 4. 实现权限服务层 — 类似 OpenCode 的 Permission.layer
// ============================================================

export const PermissionLayer = Layer.effect(
  PermissionService,
  Effect.gen(function* () {
    // 已批准的规则 — 类似 OpenCode 的 approved
    const approved: Rule[] = [
      { permission: "read", pattern: "/project/*", action: "allow" },
      { permission: "shell", pattern: "/project/*", action: "ask" },
    ]

    // 待处理的请求 — 类似 OpenCode 的 pending Map
    const pendingMap = new Map<
      string,
      {
        request: PermissionRequest
        deferred: Deferred.Deferred<void, RejectedError>
      }
    >()

    return PermissionService.of({
      ask: (permission, patterns) =>
        Effect.gen(function* () {
          // 评估每个 pattern
          for (const pattern of patterns) {
            const rule = evaluate(permission, pattern, approved)
            yield* Console.log(
              `[权限] 评估 ${permission}:${pattern} → ${rule.action}`,
            )

            if (rule.action === "deny") {
              return yield* new DeniedError({ ruleset: [rule] })
            }

            if (rule.action === "allow") {
              continue
            }

            // action === "ask": 需要用户审批
            const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
            const request = new PermissionRequest({
              id,
              permission,
              patterns: [pattern],
              metadata: {},
            })

            const deferred = yield* Deferred.make<void, RejectedError>()
            pendingMap.set(id, { request, deferred })

            yield* Console.log(
              `[权限] 需要审批: ${permission} ${pattern} (请求ID: ${id})`,
            )

            // 等待用户回复 — 类似 OpenCode 的 Deferred.await(deferred)
            return yield* Effect.ensuring(
              Deferred.await(deferred),
              Effect.sync(() => pendingMap.delete(id)),
            )
          }
        }),

      reply: (requestId, reply) =>
        Effect.gen(function* () {
          const entry = pendingMap.get(requestId)
          if (!entry) {
            yield* Console.log(`[权限] 请求 ${requestId} 已过期`)
            return
          }

          if (reply === "reject") {
            yield* Console.log(`[权限] 拒绝: ${entry.request.permission}`)
            yield* Deferred.fail(entry.deferred, new RejectedError())
            return
          }

          // "once" 或 "always"
          if (reply === "always") {
            // 添加到已批准列表 — 类似 OpenCode 的 approved.push
            for (const pattern of entry.request.patterns) {
              approved.push({
                permission: entry.request.permission,
                pattern,
                action: "allow",
              })
            }
          }

          yield* Console.log(
            `[权限] 批准: ${entry.request.permission} (${reply})`,
          )
          yield* Deferred.succeed(entry.deferred, undefined)
        }),

      pending: () =>
        Effect.succeed(
          Array.from(pendingMap.values()).map((e) => e.request),
        ),
    })
  }),
)

// ============================================================
// 5. 使用权限系统 — 展示 Schema + Deferred 模式
// ============================================================

const main = Effect.gen(function* () {
  const permission = yield* PermissionService

  // 场景 1: 读取文件 (已批准，自动通过)
  yield* Console.log("--- 场景 1: 读取文件 (已批准) ---")
  yield* permission.ask("read", ["/project/src/main.ts"])
  yield* Console.log("读取操作已通过\n")

  // 场景 2: 执行 shell 命令 (需要审批)
  yield* Console.log("--- 场景 2: 执行 shell 命令 (需要审批) ---")

  // 启动一个 Fiber 模拟用户审批
  const askEffect = Effect.gen(function* () {
    yield* permission.ask("shell", ["/project/package.json"])
    yield* Console.log("Shell 操作已通过!")
  })

  // 模拟用户 500ms 后批准
  const replyEffect = Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(500))
    const pending = yield* permission.pending()
    if (pending.length > 0) {
      yield* permission.reply(pending[0].id, "once")
    }
  })

  // 同时执行请求和回复
  yield* Effect.all([askEffect, replyEffect], { concurrency: "inherit" })

  yield* Console.log("\n--- 场景 3: 被拒绝的操作 ---")
  // 启动请求
  const askEffect2 = Effect.gen(function* () {
    const result = yield* permission.ask("shell", ["/other/secret.txt"]).pipe(
      Effect.catch((err) =>
        Effect.succeed(`被拒绝: ${err.message}`),
      ),
    )
    yield* Console.log(result)
  })

  // 模拟用户拒绝
  const replyEffect2 = Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(200))
    const pending = yield* permission.pending()
    if (pending.length > 0) {
      yield* permission.reply(pending[0].id, "reject")
    }
  })

  yield* Effect.all([askEffect2, replyEffect2], { concurrency: "inherit" })
})

// 运行
await main.pipe(
  Effect.provide(PermissionLayer),
  Effect.runPromise,
)
