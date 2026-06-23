/**
 * 01-context-tag.ts
 * 演示 Context.GenericTag 声明服务接口、Effect.gen 中 yield* 获取服务实例、
 * 缺少 Layer 提供时的 MissingService 错误
 *
 * 运行: bun run src/01-context-tag.ts
 */

import { Context, Effect, Exit } from "effect"

// ============================================================
// 1. 使用 Context.GenericTag 声明服务接口（Service Interface）
// ============================================================
// Effect-TS 中，服务通过 Context.GenericTag<接口类型>()("名称") 声明。
// GenericTag 同时扮演"类型标记"和"依赖获取器"两个角色。

// 声明一个 Logger 服务接口
interface Logger {
  readonly log: (message: string) => void
}
const Logger = Context.GenericTag<Logger>("Logger")

// 声明一个 Database 服务接口
interface Database {
  readonly query: (sql: string) => string
}
const Database = Context.GenericTag<Database>("Database")

// 声明一个 Config 服务接口
interface Config {
  readonly apiUrl: string
  readonly timeout: number
}
const Config = Context.GenericTag<Config>("Config")

console.log("=".repeat(60))
console.log("1. Context.GenericTag — 声明服务接口")
console.log("=".repeat(60))
console.log("✅ Logger Tag 已声明:", typeof Logger)
console.log("✅ Database Tag 已声明:", typeof Database)
console.log("✅ Config Tag 已声明:", typeof Config)

// ============================================================
// 2. Effect.gen 中通过 yield* 获取服务实例
// ============================================================
// yield* Tag 是 Effect-TS 中获取依赖的标准方式。
// 它告诉 Effect: "我需要这个服务，请从上下文中提供给我"。

const businessLogic = Effect.gen(function* () {
  // yield* 从上下文中获取 Logger 服务
  const logger = yield* Logger
  // yield* 从上下文中获取 Config 服务
  const config = yield* Config

  logger.log(`[业务逻辑] 使用 API 地址: ${config.apiUrl}`)
  logger.log(`[业务逻辑] 超时设置: ${config.timeout}ms`)

  return { success: true, apiUrl: config.apiUrl }
})

console.log("\n" + "=".repeat(60))
console.log("2. Effect.gen + yield* — 声明依赖需求")
console.log("=".repeat(60))
console.log("✅ businessLogic Effect 已定义（尚未提供依赖）")

// ============================================================
// 3. 无 Layer 提供时运行 — MissingService 错误
// ============================================================
// 当 Effect 需要的服务没有通过 Layer 提供时，运行会抛出
// ConfigError.MissingServiceOnly 错误，告诉你缺少哪个服务。

console.log("\n" + "=".repeat(60))
console.log("3. 缺少 Layer — MissingService 错误演示")
console.log("=".repeat(60))

const resultWithoutLayer = Effect.runSyncExit(businessLogic)

if (Exit.isFailure(resultWithoutLayer)) {
  const cause = resultWithoutLayer.cause
  console.log("❌ 运行失败（符合预期）:")
  console.log("   错误类型: ConfigError — 缺少必需的服务依赖")
  console.log("   原因: businessLogic 需要 Logger 和 Config，但未提供 Layer")
  console.log("   错误信息:", cause.toString().slice(0, 200))
}

// ============================================================
// 4. 部分提供 — 仍然会报错
// ============================================================
// 如果只提供了部分依赖，缺少的依赖仍然会触发错误。

const partialProgram = Effect.gen(function* () {
  const logger = yield* Logger
  const config = yield* Config
  const db = yield* Database

  logger.log(`数据库查询: ${db.query("SELECT 1")}`)
  return config.apiUrl
})

// 只提供 Logger，缺少 Config 和 Database
const partialResult = Effect.runSyncExit(
  Effect.provideService(partialProgram, Logger, {
    log: (msg) => { /* 空实现 */ }
  })
)

console.log("\n" + "=".repeat(60))
console.log("4. 部分提供 — 仍然报 MissingService")
console.log("=".repeat(60))

if (Exit.isFailure(partialResult)) {
  console.log("❌ 运行失败（符合预期）:")
  console.log("   原因: 只提供了 Logger，仍然缺少 Config 和 Database")
  console.log("   错误信息:", partialResult.cause.toString().slice(0, 200))
}

// ============================================================
// 5. 正确提供所有依赖
// ============================================================

const fullProgram = Effect.gen(function* () {
  const logger = yield* Logger
  const config = yield* Config
  const db = yield* Database

  logger.log(`连接到 ${config.apiUrl}`)
  const result = db.query("SELECT * FROM users")

  return { config: config.apiUrl, dbResult: result }
})

const fullResult = Effect.runSync(
  Effect.provide(fullProgram, Context.empty.pipe(
    Context.add(Logger, { log: (msg) => console.log("  [LOG]", msg) }),
    Context.add(Config, { apiUrl: "https://api.example.com", timeout: 5000 }),
    Context.add(Database, { query: (sql) => `执行: ${sql}` }),
  ))
)

console.log("\n" + "=".repeat(60))
console.log("5. 正确提供所有依赖")
console.log("=".repeat(60))
console.log("✅ 运行成功:", fullResult)

// ============================================================
// 6. Context.Tag 的两种角色
// ============================================================
// GenericTag 同时是:
//   1. 类型标记 — 在 Effect<R, E, A> 中占据 R 位置
//   2. 依赖获取器 — 在 Effect.gen 中通过 yield* 获取实例
//
// 这与传统 DI 框架中分别定义"接口"和"注入令牌"的做法不同。

console.log("\n" + "=".repeat(60))
console.log("6. GenericTag 的双重角色")
console.log("=".repeat(60))
console.log("  - 作为类型标记: Effect<Logger | Config, never, void>")
console.log("  - 作为依赖获取器: const logger = yield* Logger")
console.log("  - 一个 GenericTag 同时完成两个职责")
