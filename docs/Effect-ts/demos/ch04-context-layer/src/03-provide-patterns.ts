/**
 * 03-provide-patterns.ts
 * 演示 Effect.provide 的多种注入模式:
 *   - Effect.provide — 通过 Layer 注入
 *   - Effect.provideService — 直接提供实例
 *   - Effect.provideServiceEffect — 异步提供
 *   - Layer.provideMerge — 合并 Layer
 *   - 注入范围: 局部 provide vs 全局 Layer
 *
 * 运行: bun run src/03-provide-patterns.ts
 */

import { Context, Effect, Layer } from "effect"

// ============================================================
// 服务接口声明
// ============================================================

interface Logger {
  readonly log: (message: string) => void
}
const Logger = Context.GenericTag<Logger>("Logger")

interface Database {
  readonly query: (sql: string) => string
}
const Database = Context.GenericTag<Database>("Database")

interface Cache {
  readonly get: (key: string) => string | null
  readonly set: (key: string, value: string) => void
}
const Cache = Context.GenericTag<Cache>("Cache")

// ============================================================
// 1. Effect.provide — 基础注入（通过 Layer）
// ============================================================
// Effect.provide(effect, layer) 是最标准的注入方式。
// 它将一个 Layer 注入到 Effect 的上下文中。

const loggerLayer = Layer.succeed(Logger, {
  log: (msg) => console.log(`  [LOG] ${msg}`)
})

const program1 = Effect.gen(function* () {
  const logger = yield* Logger
  logger.log("通过 Layer 注入的 Logger")
  return "done"
})

console.log("=".repeat(60))
console.log("1. Effect.provide — 基础 Layer 注入")
console.log("=".repeat(60))
const result1 = Effect.runSync(Effect.provide(program1, loggerLayer))
console.log("✅ 结果:", result1)

// ============================================================
// 2. Effect.provideService — 直接提供实例（跳过 Layer）
// ============================================================
// 当你只需要注入一个简单的服务实例时，可以直接使用 provideService。
// 不需要构建完整的 Layer。

const program2 = Effect.gen(function* () {
  const db = yield* Database
  return db.query("SELECT * FROM users WHERE active = true")
})

console.log("\n" + "=".repeat(60))
console.log("2. Effect.provideService — 直接提供实例")
console.log("=".repeat(60))

const result2 = Effect.runSync(
  Effect.provideService(program2, Database, {
    query: (sql) => `[模拟数据库] 执行: ${sql} → 返回 3 条记录`
  })
)
console.log("✅ 结果:", result2)
console.log("   💡 provideService 适合快速测试或简单场景，无需构建 Layer")

// ============================================================
// 3. Effect.provideServiceEffect — 异步提供实例
// ============================================================
// 当提供实例本身需要副作用（如读取配置文件、建立连接）时，
// 使用 provideServiceEffect 通过 Effect 来构建实例。

const program3 = Effect.gen(function* () {
  const cache = yield* Cache
  const db = yield* Database

  const cached = cache.get("user:42")
  if (cached) {
    return `[缓存命中] ${cached}`
  }

  const result = db.query("SELECT * FROM users WHERE id = 42")
  cache.set("user:42", result)
  return `[数据库查询] ${result}`
})

console.log("\n" + "=".repeat(60))
console.log("3. Effect.provideServiceEffect — 通过 Effect 异步提供")
console.log("=".repeat(60))

const result3 = Effect.runSync(
  Effect.provideServiceEffect(program3, Database, Effect.gen(function* () {
    // 模拟异步初始化（如读取配置文件）
    console.log("  [初始化] 正在连接数据库...")
    return {
      query: (sql: string) => `执行 "${sql}" → 结果: User{id:42, name:"Alice"}`
    }
  })).pipe(
    Effect.provideService(Cache, {
      store: new Map<string, string>(),
      get(key: string) { return this.store.get(key) ?? null },
      set(key: string, value: string) { this.store.set(key, value) }
    })
  )
)
console.log("✅ 第一次调用:", result3)

// 第二次调用 — 缓存命中
const result3b = Effect.runSync(
  Effect.provideServiceEffect(program3, Database, Effect.succeed({
    query: (sql: string) => `执行 "${sql}" → 结果: User{id:42, name:"Alice"}`
  })).pipe(
    Effect.provideService(Cache, {
      store: new Map<string, string>([["user:42", "cached-data"]]),
      get(key: string) { return this.store.get(key) ?? null },
      set(key: string, value: string) { this.store.set(key, value) }
    })
  )
)
console.log("✅ 第二次调用（缓存命中）:", result3b)

// ============================================================
// 4. Layer.provideMerge — 将一个 Layer 合并到另一个
// ============================================================
// Layer.provideMerge(self, that) 将 that 的上下文合并到 self 中。
// 与 Layer.provide 不同，provideMerge 不会消除 that 中服务的可见性。

const dbLayer = Layer.succeed(Database, {
  query: (sql: string) => `[DB] ${sql}`
})

const cacheLayer = Layer.succeed(Cache, {
  store: new Map<string, string>(),
  get(key: string) { return this.store.get(key) ?? null },
  set(key: string, value: string) { this.store.set(key, value) }
})

// provideMerge: 合并两个 Layer 的服务到一个 Layer 中
const mergedLayer = Layer.provideMerge(dbLayer, cacheLayer)

console.log("\n" + "=".repeat(60))
console.log("4. Layer.provideMerge — 合并 Layer 上下文")
console.log("=".repeat(60))

const program4 = Effect.gen(function* () {
  const db = yield* Database
  const cache = yield* Cache

  cache.set("key", "value")
  const cached = cache.get("key")
  const data = db.query("SELECT 1")

  return { cached, data }
})

const result4 = Effect.runSync(Effect.provide(program4, mergedLayer))
console.log("✅ 结果:", result4)
console.log("   💡 provideMerge 将两个 Layer 的服务合并到一起")

// ============================================================
// 5. Layer.mergeAll — 合并多个 Layer
// ============================================================
// Layer.mergeAll(layer1, layer2, layer3, ...) 一次性合并多个 Layer。

const allLayers = Layer.mergeAll(loggerLayer, dbLayer, cacheLayer)

console.log("\n" + "=".repeat(60))
console.log("5. Layer.mergeAll — 一次性合并多个 Layer")
console.log("=".repeat(60))

const program5 = Effect.gen(function* () {
  const logger = yield* Logger
  const db = yield* Database
  const cache = yield* Cache

  logger.log("使用 mergeAll 合并的三个服务")
  return db.query("SELECT version()")
})

const result5 = Effect.runSync(Effect.provide(program5, allLayers))
console.log("✅ 结果:", result5)

// ============================================================
// 6. 注入范围: 局部 provide vs 全局 Layer
// ============================================================
// Effect.provide 是局部的 — 只影响被 provide 的 Effect 及其子 Effect。
// 这让你可以在不同层级使用不同的服务实现。

const mockLogger = Layer.succeed(Logger, {
  log: (msg) => console.log(`  [MOCK] ${msg}`)
})

const realLogger = Layer.succeed(Logger, {
  log: (msg) => console.log(`  [REAL] ${msg}`)
})

// 内层使用 mock，外层使用 real
const innerEffect = Effect.gen(function* () {
  const logger = yield* Logger
  logger.log("内层日志")
  return "inner"
})

const outerEffect = Effect.gen(function* () {
  const logger = yield* Logger
  logger.log("外层日志")

  // 内层 Effect 使用 mock Logger（局部覆盖）
  const innerResult = yield* Effect.provide(innerEffect, mockLogger)

  logger.log("外层继续")
  return innerResult
})

console.log("\n" + "=".repeat(60))
console.log("6. 注入范围 — 局部 provide 覆盖")
console.log("=".repeat(60))

const result6 = Effect.runSync(Effect.provide(outerEffect, realLogger))
console.log("✅ 结果:", result6)
console.log("   💡 外层使用 [REAL] Logger，内层使用 [MOCK] Logger")
console.log("   💡 局部 provide 不影响外层 Effect 的上下文")
