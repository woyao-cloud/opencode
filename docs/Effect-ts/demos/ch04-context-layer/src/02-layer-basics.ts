/**
 * 02-layer-basics.ts
 * 演示 Layer 的四种构建方式: succeed, sync, effect, scoped
 * 以及 Layer.provide 满足 Layer 之间的依赖
 *
 * 运行: bun run src/02-layer-basics.ts
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
  readonly connect: () => string
  readonly disconnect: () => void
}
const Database = Context.GenericTag<Database>("Database")

interface UserRepo {
  readonly findById: (id: number) => string
}
const UserRepo = Context.GenericTag<UserRepo>("UserRepo")

// ============================================================
// 1. Layer.succeed — 提供固定值
// ============================================================
// Layer.succeed(tag, instance) 是最简单的 Layer 构建方式。
// 直接提供一个已经创建好的实例，不需要任何副作用。

const loggerLayer = Layer.succeed(Logger, {
  log: (message: string) => console.log(`  [LOG] ${message}`)
})

console.log("=".repeat(60))
console.log("1. Layer.succeed — 提供固定值")
console.log("=".repeat(60))
console.log("✅ loggerLayer 已创建（类型: Layer<Logger>）")

// ============================================================
// 2. Layer.sync — 同步构建（每次提供时重新执行）
// ============================================================
// Layer.sync(tag, () => instance) 在每次构建 Layer 时执行工厂函数。
// 与 succeed 的区别: sync 每次都是新实例，succeed 是同一个实例。

let counter = 0
const loggerWithCounterLayer = Layer.sync(Logger, () => ({
  log: (message: string) => {
    counter++
    console.log(`  [LOG#${counter}] ${message}`)
  }
}))

console.log("\n" + "=".repeat(60))
console.log("2. Layer.sync — 同步构建（每次提供时重新执行）")
console.log("=".repeat(60))
console.log("✅ loggerWithCounterLayer 已创建（每次构建时 counter 从 0 开始）")

// ============================================================
// 3. Layer.effect — 异步/Effect 构建
// ============================================================
// Layer.effect(tag, Effect.gen(...)) 通过 Effect 构建服务实例。
// 常用于需要依赖其他服务的场景，或构建过程本身有副作用。

const databaseLayer = Layer.effect(Database, Effect.gen(function* () {
  // 模拟数据库连接建立过程
  console.log("  [构建 Database] 正在建立连接...")

  return {
    connect: () => "已连接到数据库 (localhost:5432)",
    disconnect: () => { console.log("  [Database] 已断开连接") }
  }
}))

console.log("\n" + "=".repeat(60))
console.log("3. Layer.effect — Effect 构建服务实例")
console.log("=".repeat(60))
console.log("✅ databaseLayer 已创建（类型: Layer<Database>）")

// ============================================================
// 4. Layer.scoped — 带资源管理的构建
// ============================================================
// Layer.scoped(tag, Effect.acquireRelease(acquire, release)) 用于
// 需要生命周期管理的服务（如数据库连接、文件句柄等）。
// acquire 在 Layer 构建时执行，release 在 Scope 关闭时执行。

const databaseScopedLayer = Layer.scoped(Database,
  Effect.acquireRelease(
    // acquire — 获取资源
    Effect.sync(() => {
      console.log("  [Scoped] 获取数据库连接")
      return {
        connect: () => "已连接 (scoped)",
        disconnect: () => { console.log("  [Scoped] 断开连接") }
      }
    }),
    // release — 释放资源
    (db) => Effect.sync(() => {
      console.log("  [Scoped] 释放数据库资源")
      db.disconnect()
    })
  )
)

console.log("\n" + "=".repeat(60))
console.log("4. Layer.scoped — 带资源生命周期管理")
console.log("=".repeat(60))
console.log("✅ databaseScopedLayer 已创建（类型: Layer<Database, never, Scope>）")
console.log("   ⚠️ 注意: scoped Layer 需要 Scope 上下文，运行时需要 Scope")

// ============================================================
// 5. Layer.provide — 满足 Layer 之间的依赖
// ============================================================
// 当一个 Layer 的构建需要另一个服务时，使用 Layer.provide 来满足依赖。
// Layer.provide(layerThatNeedsDeps, layerThatProvidesDeps)

// UserRepo 的构建需要 Database 服务
const userRepoLayer = Layer.effect(UserRepo, Effect.gen(function* () {
  const db = yield* Database

  console.log("  [构建 UserRepo] 依赖 Database 服务")

  return {
    findById: (id: number) => {
      const connection = db.connect()
      return `${connection} → 查询用户 ID=${id}`
    }
  }
}))

// 将 Database 注入到 UserRepo 的构建中
const userRepoWithDbLayer = Layer.provide(userRepoLayer, databaseLayer)

console.log("\n" + "=".repeat(60))
console.log("5. Layer.provide — 满足 Layer 之间的依赖")
console.log("=".repeat(60))
console.log("✅ userRepoWithDbLayer 已创建（类型: Layer<UserRepo>）")
console.log("   依赖关系: Database → UserRepo")
console.log("   使用: Layer.provide(userRepoLayer, databaseLayer)")

// ============================================================
// 6. 组合运行 — 完整示例
// ============================================================

const program = Effect.gen(function* () {
  const logger = yield* Logger
  const repo = yield* UserRepo

  logger.log("开始查询用户...")
  const user = repo.findById(42)
  logger.log(`查询结果: ${user}`)

  return user
})

// 组合 Layer: Logger + (Database → UserRepo)
const appLayer = Layer.merge(loggerLayer, userRepoWithDbLayer)

console.log("\n" + "=".repeat(60))
console.log("6. 完整示例 — 组合 Layer 并运行")
console.log("=".repeat(60))

const result = Effect.runSync(Effect.provide(program, appLayer))
console.log("✅ 运行结果:", result)

// ============================================================
// 7. Scoped Layer 的运行示例
// ============================================================

const scopedProgram = Effect.gen(function* () {
  const db = yield* Database
  const logger = yield* Logger

  logger.log("使用 scoped 数据库")
  const conn = db.connect()
  logger.log(conn)

  return "scoped done"
})

console.log("\n" + "=".repeat(60))
console.log("7. Scoped Layer — 资源生命周期演示")
console.log("=".repeat(60))

const scopedResult = Effect.runSync(
  Effect.scoped(
    Effect.provide(scopedProgram, databaseScopedLayer)
  )
)
console.log("✅ Scoped 运行结果:", scopedResult)
console.log("   注意: 上面的 '[Scoped] 释放数据库资源' 在 Effect.scoped 结束时自动执行")
