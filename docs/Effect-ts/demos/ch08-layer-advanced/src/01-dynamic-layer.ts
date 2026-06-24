/**
 * 01-dynamic-layer.ts
 * 演示动态 Layer 选择:
 *   - Layer.unwrap(Effect) — 运行时根据 Effect 结果选择 Layer
 *   - Layer.effect(Service)(effect) — 异步服务构建
 *   - Layer.fresh(layer) — 每次获取都创建新实例
 *
 * 运行: bun run src/01-dynamic-layer.ts
 */

import { Context, Effect, Layer, Random } from "effect"

// ============================================================
// 服务声明 — 使用 Context.Service 类模式
// ============================================================
// Effect 4.0.0-beta.65 使用 Context.Service 类来声明服务。
// 类模式同时提供类型标记和依赖获取器两个功能。

class Database extends Context.Service<Database, {
  readonly query: (sql: string) => string
  readonly engine: string
}>()("Database") {}

class Logger extends Context.Service<Logger, {
  readonly log: (message: string) => void
}>()("Logger") {}

// ============================================================
// 1. Layer.effect — 异步服务构建
// ============================================================
// Layer.effect(Service)(effect) 通过 Effect 构建服务实例。
// 构建过程可以包含副作用（如读取配置、建立连接）。

const loggerLayer = Layer.effect(Logger)(
  Effect.sync(() => ({
    log: (message: string) => console.log(`  [LOG] ${message}`)
  }))
)

// 两个不同的 Database 实现
const postgresLayer = Layer.effect(Database)(
  Effect.sync(() => ({
    query: (sql: string) => `[PostgreSQL] 执行: ${sql}`,
    engine: "PostgreSQL 16"
  }))
)

const sqliteLayer = Layer.effect(Database)(
  Effect.sync(() => ({
    query: (sql: string) => `[SQLite] 执行: ${sql}`,
    engine: "SQLite 3"
  }))
)

console.log("=".repeat(60))
console.log("1. Layer.effect — 异步服务构建")
console.log("=".repeat(60))
console.log("✅ postgresLayer 已创建（类型: Layer<Database>）")
console.log("✅ sqliteLayer 已创建（类型: Layer<Database>）")
console.log("✅ loggerLayer 已创建（类型: Layer<Logger>）")

// ============================================================
// 2. Layer.unwrap — 运行时动态选择 Layer
// ============================================================
// Layer.unwrap(effect) 接受一个 Effect<Layer<A, E, R>>，
// 在 Layer 构建时执行该 Effect，根据结果决定使用哪个 Layer。
// 这实现了"运行时依赖选择"——根据配置、环境或随机条件切换实现。

const dynamicDatabaseLayer = Layer.unwrap(
  Effect.gen(function* () {
    // 模拟运行时决策：随机选择数据库引擎
    const random = yield* Random.next
    if (random > 0.5) {
      console.log("  [动态选择] 使用 PostgreSQL")
      return postgresLayer
    } else {
      console.log("  [动态选择] 使用 SQLite")
      return sqliteLayer
    }
  })
)

console.log("\n" + "=".repeat(60))
console.log("2. Layer.unwrap — 运行时动态选择 Layer")
console.log("=".repeat(60))
console.log("✅ dynamicDatabaseLayer 已创建")
console.log("   每次构建时随机选择 PostgreSQL 或 SQLite")

// 运行两次，观察不同的选择结果
const program1 = Effect.gen(function* () {
  const db = yield* Database
  const logger = yield* Logger
  logger.log(`数据库引擎: ${db.engine}`)
  const result = db.query("SELECT * FROM users")
  logger.log(result)
  return `引擎: ${db.engine}, 查询: ${result}`
})

console.log("\n--- 第 1 次运行 ---")
const result1 = Effect.runSync(
  Effect.provide(program1, Layer.mergeAll(dynamicDatabaseLayer, loggerLayer))
)
console.log("✅ 结果:", result1)

console.log("\n--- 第 2 次运行 ---")
const result2 = Effect.runSync(
  Effect.provide(program1, Layer.mergeAll(dynamicDatabaseLayer, loggerLayer))
)
console.log("✅ 结果:", result2)

// ============================================================
// 3. Layer.fresh — 每次获取都创建新实例
// ============================================================
// 默认情况下，Layer 是共享的——同一个实例被所有消费者复用。
// Layer.fresh(layer) 强制每次 yield* 都创建新实例。
// 这对于需要隔离状态的服务非常有用。

class Counter extends Context.Service<Counter, {
  readonly increment: () => number
  readonly value: () => number
}>()("Counter") {}

// 普通 Layer（共享实例）
const sharedCounterLayer = Layer.effect(Counter)(
  Effect.sync(() => {
    let count = 0
    console.log("  [构建] 创建共享 Counter 实例")
    return {
      increment: () => {
        count++
        return count
      },
      value: () => count
    }
  })
)

// Fresh Layer（每次新实例）
const freshCounterLayer = Layer.fresh(
  Layer.effect(Counter)(
    Effect.sync(() => {
      let count = 0
      console.log("  [构建] 创建 Fresh Counter 实例")
      return {
        increment: () => {
          count++
          return count
        },
        value: () => count
      }
    })
  )
)

console.log("\n" + "=".repeat(60))
console.log("3. Layer.fresh — 每次获取都创建新实例")
console.log("=".repeat(60))

// 共享实例演示：同一个 Layer 被多次 Effect.provide 时复用实例
const useCounter = Effect.gen(function* () {
  const c = yield* Counter
  c.increment()
  c.increment()
  return c.value()
})

console.log("\n--- 共享 Layer（实例被复用）---")
const shared1 = Effect.runSync(Effect.provide(useCounter, sharedCounterLayer))
const shared2 = Effect.runSync(Effect.provide(useCounter, sharedCounterLayer))
console.log(`  [共享] 第 1 次: ${shared1}（从 0 开始）`)
console.log(`  [共享] 第 2 次: ${shared2}（从上次结果继续）`)
console.log("   共享 Layer 的实例在多次 Effect.provide 之间被复用")

// Fresh 实例演示：每次 Effect.provide 都创建新实例
console.log("\n--- Fresh Layer（每次 Effect.provide 创建新实例）---")
const fresh1 = Effect.runSync(Effect.provide(useCounter, freshCounterLayer))
const fresh2 = Effect.runSync(Effect.provide(useCounter, freshCounterLayer))
console.log(`  [Fresh] 第 1 次: ${fresh1}（从 0 开始）`)
console.log(`  [Fresh] 第 2 次: ${fresh2}（也从 0 开始，新实例）`)
console.log("   Fresh Layer 每次 Effect.provide 都创建新实例")

// ============================================================
// 总结
// ============================================================
console.log("\n" + "=".repeat(60))
console.log("总结: 动态 Layer 技术")
console.log("=".repeat(60))
console.log("  1. Layer.effect(Service)(effect) — 通过 Effect 构建服务")
console.log("  2. Layer.unwrap(effect) — 运行时动态选择 Layer 实现")
console.log("  3. Layer.fresh(layer) — 每次获取都创建新实例")
console.log("")
console.log("  应用场景:")
console.log("  - 根据环境变量选择数据库引擎")
console.log("  - A/B 测试不同服务实现")
console.log("  - 需要隔离状态的多租户场景")
