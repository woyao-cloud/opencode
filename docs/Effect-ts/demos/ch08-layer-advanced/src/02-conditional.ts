/**
 * 02-conditional.ts
 * 演示条件注入与 Layer 错误处理:
 *   - Layer.orDie — 构建失败时终止 Fiber
 *   - Layer.catchTag — 捕获特定错误并提供回退 Layer
 *   - Layer.provideMerge — 合并多个 Layer 的上下文
 *   - 条件 Layer 选择
 *
 * 运行: bun run src/02-conditional.ts
 */

import { Context, Data, Effect, Layer } from "effect"

// ============================================================
// 服务声明 — 使用 Context.Service 类模式
// ============================================================

class Config extends Context.Service<Config, {
  readonly apiUrl: string
  readonly timeout: number
}>()("Config") {}

class Database extends Context.Service<Database, {
  readonly query: (sql: string) => string
}>()("Database") {}

class Logger extends Context.Service<Logger, {
  readonly log: (message: string) => void
}>()("Logger") {}

// ============================================================
// 自定义错误类型
// ============================================================

class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly message: string
}> {}

class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly message: string
}> {}

// ============================================================
// 1. Layer.orDie — 构建失败时终止 Fiber
// ============================================================
// Layer.orDie(layer) 将 Layer 构建过程中的所有错误转换为
// Fiber 终止（Defect）。这适用于"没有回退方案"的场景——
// 如果这个服务构建失败，整个应用应该崩溃而不是静默降级。

const configLayer = Layer.effect(Config)(
  Effect.gen(function* () {
    // 模拟配置加载可能失败
    const env = process.env.NODE_ENV ?? "development"
    if (env === "production" && !process.env.API_URL) {
      return yield* new ConfigError({ message: "生产环境缺少 API_URL 配置" })
    }
    return {
      apiUrl: process.env.API_URL ?? "http://localhost:3000",
      timeout: 5000
    }
  })
)

// 使用 orDie：如果 Config 构建失败，整个 Fiber 终止
const configLayerOrDie = configLayer.pipe(Layer.orDie)

console.log("=".repeat(60))
console.log("1. Layer.orDie — 构建失败时终止 Fiber")
console.log("=".repeat(60))
console.log("✅ configLayerOrDie 已创建（类型: Layer<Config, never, never>）")
console.log("   错误类型从 Layer 签名中移除，失败将导致 Fiber 终止")

// ============================================================
// 2. Layer.catchTag — 捕获特定错误并提供回退
// ============================================================
// Layer.catchTag(layer, tag, handler) 捕获 Layer 构建过程中
// 特定类型的错误，并提供回退 Layer。适用于"有备选方案"的场景。

const databaseLayer = Layer.effect(Database)(
  Effect.gen(function* () {
    const config = yield* Config
    // 模拟数据库连接可能失败
    if (config.apiUrl.includes("localhost")) {
      console.log("  [Database] 连接本地数据库...")
      return {
        query: (sql: string) => `[本地DB] ${sql}`
      }
    }
    return yield* new DatabaseError({
      message: `无法连接到远程数据库: ${config.apiUrl}`
    })
  })
)

// 内存数据库回退
const inMemoryDatabaseLayer = Layer.effect(Database)(
  Effect.sync(() => ({
    query: (sql: string) => `[内存DB] ${sql} → 模拟结果`
  }))
)

// 使用 catchTag：捕获 DatabaseError 时回退到内存数据库
const databaseWithFallback = databaseLayer.pipe(
  Layer.catchTag("DatabaseError", () => inMemoryDatabaseLayer)
)

console.log("\n" + "=".repeat(60))
console.log("2. Layer.catchTag — 捕获特定错误并提供回退")
console.log("=".repeat(60))
console.log("✅ databaseWithFallback 已创建")
console.log("   当 DatabaseError 发生时，自动回退到内存数据库")

// ============================================================
// 3. Layer.provideMerge — 合并 Layer 上下文
// ============================================================
// Layer.provideMerge(self, that) 将 that 的上下文合并到 self 中，
// 两者的服务都保持可见。与 Layer.provide 不同，provideMerge 不消除
// 被提供者的依赖——它只是合并上下文。

const loggerLayer = Layer.succeed(Logger)({
  log: (msg: string) => console.log(`  [LOG] ${msg}`)
})

// 使用 provideMerge 将 Logger 合并到 Database Layer 中
const databaseWithLogger = databaseWithFallback.pipe(
  Layer.provideMerge(loggerLayer)
)

console.log("\n" + "=".repeat(60))
console.log("3. Layer.provideMerge — 合并 Layer 上下文")
console.log("=".repeat(60))
console.log("✅ databaseWithLogger 已创建")
console.log("   Logger 被合并到 Database Layer 中，两者都可用")

// ============================================================
// 4. 条件 Layer 选择
// ============================================================
// 根据运行时条件选择不同的 Layer 实现。

class Cache extends Context.Service<Cache, {
  readonly get: (key: string) => string | null
  readonly set: (key: string, value: string) => void
}>()("Cache") {}

// Redis 缓存实现
const redisCacheLayer = Layer.effect(Cache)(
  Effect.sync(() => {
    const store = new Map<string, string>()
    console.log("  [Cache] 使用 Redis 缓存")
    return {
      get: (key: string) => store.get(key) ?? null,
      set: (key: string, value: string) => { store.set(key, value) }
    }
  })
)

// 内存缓存实现
const memoryCacheLayer = Layer.effect(Cache)(
  Effect.sync(() => {
    const store = new Map<string, string>()
    console.log("  [Cache] 使用内存缓存")
    return {
      get: (key: string) => store.get(key) ?? null,
      set: (key: string, value: string) => { store.set(key, value) }
    }
  })
)

// 根据条件选择缓存实现
const selectCacheLayer = (useRedis: boolean): Layer.Layer<Cache> =>
  useRedis ? redisCacheLayer : memoryCacheLayer

console.log("\n" + "=".repeat(60))
console.log("4. 条件 Layer 选择")
console.log("=".repeat(60))

const appWithRedis = Effect.gen(function* () {
  const cache = yield* Cache
  cache.set("user:1", "Alice")
  const user = cache.get("user:1")
  return `从缓存获取: ${user}`
})

const redisResult = Effect.runSync(
  Effect.provide(appWithRedis, selectCacheLayer(true))
)
console.log("✅ Redis 缓存结果:", redisResult)

const memoryResult = Effect.runSync(
  Effect.provide(appWithRedis, selectCacheLayer(false))
)
console.log("✅ 内存缓存结果:", memoryResult)

// ============================================================
// 5. 完整示例：条件注入 + 错误处理 + 合并
// ============================================================

const fullProgram = Effect.gen(function* () {
  const config = yield* Config
  const db = yield* Database
  const logger = yield* Logger
  const cache = yield* Cache

  logger.log(`应用启动: API=${config.apiUrl}, 超时=${config.timeout}ms`)

  // 使用数据库
  const data = db.query("SELECT * FROM products")
  logger.log(`数据库查询: ${data}`)

  // 使用缓存
  cache.set("products", data)
  const cached = cache.get("products")
  logger.log(`缓存结果: ${cached}`)

  return {
    apiUrl: config.apiUrl,
    dbResult: data,
    cachedResult: cached
  }
})

// 组装所有 Layer
// 注意: databaseWithLogger 依赖 Config，需要通过 Layer.provideMerge 注入
const databaseWithConfig = databaseWithLogger.pipe(
  Layer.provideMerge(configLayerOrDie)
)

const fullLayer = Layer.mergeAll(
  databaseWithConfig,
  selectCacheLayer(true)
)

console.log("\n" + "=".repeat(60))
console.log("5. 完整示例：条件注入 + 错误处理 + 合并")
console.log("=".repeat(60))

const fullResult = Effect.runSync(Effect.provide(fullProgram, fullLayer))
console.log("✅ 完整结果:", JSON.stringify(fullResult, null, 2))

// ============================================================
// 总结
// ============================================================
console.log("\n" + "=".repeat(60))
console.log("总结: 条件注入与 Layer 错误处理")
console.log("=".repeat(60))
console.log("  1. Layer.orDie — 无回退方案时终止 Fiber")
console.log("  2. Layer.catchTag — 捕获特定错误，提供回退 Layer")
console.log("  3. Layer.provideMerge — 合并 Layer 上下文")
console.log("  4. 条件选择 — 根据运行时条件选择不同实现")
console.log("")
console.log("  最佳实践:")
console.log("  - 关键服务（如 Config）使用 orDie，失败即终止")
console.log("  - 非关键服务（如 Cache）使用 catchTag 回退")
console.log("  - 使用 provideMerge 组合多个独立服务")
