/**
 * 04-layer-composition.ts
 * 演示 Layer 的组合模式:
 *   - Layer.merge — 合并两个独立 Layer
 *   - Layer.provide — 满足依赖
 *   - Layer.flatMap — 动态构建依赖链
 *   - 构建三层依赖服务体系: Config → Database → UserService
 *
 * 运行: bun run src/04-layer-composition.ts
 */

import { Context, Effect, Layer } from "effect"

// ============================================================
// 服务接口声明 — 三层依赖体系
// ============================================================
// Config（底层）→ Database（中层，依赖 Config）→ UserService（上层，依赖 Database）

interface Logger {
  readonly log: (message: string) => void
}
const Logger = Context.GenericTag<Logger>("Logger")

interface Config {
  readonly dbHost: string
  readonly dbPort: number
  readonly dbName: string
}
const Config = Context.GenericTag<Config>("Config")

interface Database {
  readonly query: (sql: string) => string
  readonly getConnectionInfo: () => string
}
const Database = Context.GenericTag<Database>("Database")

interface UserService {
  readonly findById: (id: number) => string
  readonly listAll: () => string[]
  readonly createUser: (name: string, email: string) => string
}
const UserService = Context.GenericTag<UserService>("UserService")

// ============================================================
// 1. Layer.merge — 合并两个独立 Layer
// ============================================================
// Layer.merge(layerA, layerB) 将两个互不依赖的 Layer 合并为一个。
// 合并后的 Layer 同时提供两个服务的上下文。

const loggerLayer = Layer.succeed(Logger, {
  log: (msg) => console.log(`  [LOG] ${msg}`)
})

const configLayer = Layer.succeed(Config, {
  dbHost: "localhost",
  dbPort: 5432,
  dbName: "myapp"
})

// 合并两个独立 Layer
const baseInfraLayer = Layer.merge(loggerLayer, configLayer)

console.log("=".repeat(60))
console.log("1. Layer.merge — 合并两个独立 Layer")
console.log("=".repeat(60))
console.log("✅ baseInfraLayer 已创建（类型: Layer<Logger | Config>）")
console.log("   合并内容: Logger + Config（两个互不依赖的服务）")

// ============================================================
// 2. Layer.provide — 满足 Layer 之间的依赖
// ============================================================
// Database Layer 的构建需要 Config，使用 Layer.provide 注入。

const databaseLayer = Layer.effect(Database, Effect.gen(function* () {
  const config = yield* Config
  const logger = yield* Logger

  logger.log(`正在连接数据库: ${config.dbHost}:${config.dbPort}/${config.dbName}`)

  return {
    query: (sql: string) => {
      logger.log(`执行查询: ${sql}`)
      return `[${config.dbHost}:${config.dbPort}/${config.dbName}] 查询结果: ${sql}`
    },
    getConnectionInfo: () => `${config.dbHost}:${config.dbPort}/${config.dbName}`
  }
}))

// 将 Config + Logger 注入到 Database 的构建中
const databaseWithDeps = Layer.provide(databaseLayer, baseInfraLayer)

console.log("\n" + "=".repeat(60))
console.log("2. Layer.provide — 满足 Layer 依赖")
console.log("=".repeat(60))
console.log("✅ databaseWithDeps 已创建（类型: Layer<Database>）")
console.log("   依赖链: Logger + Config → Database")
console.log("   使用: Layer.provide(databaseLayer, baseInfraLayer)")

// ============================================================
// 3. Layer.flatMap — 动态构建依赖链
// ============================================================
// Layer.flatMap(layer, (context) => nextLayer) 允许你在获取一个 Layer
// 的上下文后，基于上下文动态决定下一个 Layer 的构建方式。

// 场景: 根据 Config 决定使用不同的数据库实现
const databaseLayerDynamic = Layer.flatMap(configLayer, (ctx) => {
  if (ctx.dbHost === "localhost") {
    // 本地开发 — 使用内存数据库
    console.log("  [flatMap] 检测到本地环境，使用内存数据库")
    return Layer.succeed(Database, {
      query: (sql: string) => `[内存DB] ${sql} → 空结果集`,
      getConnectionInfo: () => "memory://local"
    })
  } else {
    // 生产环境 — 使用真实数据库
    console.log("  [flatMap] 检测到远程环境，使用真实数据库")
    return Layer.succeed(Database, {
      query: (sql: string) => `[远程DB ${ctx.dbHost}] ${sql} → 数据行`,
      getConnectionInfo: () => `${ctx.dbHost}:${ctx.dbPort}/${ctx.dbName}`
    })
  }
})

console.log("\n" + "=".repeat(60))
console.log("3. Layer.flatMap — 基于上下文动态构建")
console.log("=".repeat(60))
console.log("✅ databaseLayerDynamic 已创建")
console.log("   flatMap 根据 Config.dbHost 决定使用哪种 Database 实现")
console.log("   💡 适合场景: 根据配置切换实现（如 dev/prod 数据库）")

// ============================================================
// 4. 完整三层依赖体系: Config → Database → UserService
// ============================================================

const userServiceLayer = Layer.effect(UserService, Effect.gen(function* () {
  const db = yield* Database
  const logger = yield* Logger

  logger.log("正在初始化 UserService...")

  // 模拟内存数据存储
  const users = new Map<number, { name: string; email: string }>()

  return {
    findById: (id: number) => {
      const user = users.get(id)
      if (user) {
        return `用户: ${user.name} <${user.email}>`
      }
      return db.query(`SELECT * FROM users WHERE id = ${id}`)
    },
    listAll: () => {
      const result: string[] = []
      users.forEach((u, id) => result.push(`[${id}] ${u.name} <${u.email}>`))
      return result
    },
    createUser: (name: string, email: string) => {
      const id = users.size + 1
      users.set(id, { name, email })
      logger.log(`创建用户: ${name} <${email}> (ID=${id})`)
      return `用户 ${name} 已创建，ID=${id}`
    }
  }
}))

// 构建完整的依赖链: (Logger + Config) → Database → UserService
const userServiceWithDeps = Layer.provide(
  Layer.provide(userServiceLayer, databaseWithDeps),
  baseInfraLayer
)

// 或者使用更简洁的方式（推荐）
const appLayer = Layer.provide(
  Layer.provide(userServiceLayer, databaseLayer),
  baseInfraLayer
)

console.log("\n" + "=".repeat(60))
console.log("4. 完整三层依赖体系")
console.log("=".repeat(60))
console.log("✅ appLayer 已创建")
console.log("   依赖链: Config + Logger → Database → UserService")
console.log("   Layer 图: baseInfraLayer → databaseLayer → userServiceLayer")

// ============================================================
// 5. 运行完整应用
// ============================================================

const app = Effect.gen(function* () {
  const logger = yield* Logger
  const config = yield* Config
  const userService = yield* UserService

  logger.log(`应用启动 — 环境: ${config.dbHost}:${config.dbPort}`)

  // 创建用户
  const r1 = userService.createUser("Alice", "alice@example.com")
  const r2 = userService.createUser("Bob", "bob@example.com")

  // 查询用户
  const r3 = userService.findById(1)
  const r4 = userService.findById(2)

  // 列出所有用户
  const allUsers = userService.listAll()

  return {
    createResults: [r1, r2],
    findResults: [r3, r4],
    allUsers
  }
})

console.log("\n" + "=".repeat(60))
console.log("5. 运行完整应用")
console.log("=".repeat(60))

const result = Effect.runSync(Effect.provide(app, appLayer))
console.log("\n✅ 运行结果:", JSON.stringify(result, null, 2))

// ============================================================
// 6. 使用 flatMap 的动态实现
// ============================================================

const dynamicApp = Effect.gen(function* () {
  const db = yield* Database
  const config = yield* Config

  const connInfo = db.getConnectionInfo()
  const data = db.query("SELECT version()")

  return { config: `${config.dbHost}:${config.dbPort}`, connInfo, data }
})

const dynamicAppLayer = Layer.merge(configLayer, databaseLayerDynamic)

console.log("\n" + "=".repeat(60))
console.log("6. flatMap 动态实现 — 本地环境")
console.log("=".repeat(60))

const dynamicResult = Effect.runSync(Effect.provide(dynamicApp, dynamicAppLayer))
console.log("✅ 结果:", dynamicResult)

// ============================================================
// 7. 依赖图可视化
// ============================================================

console.log("\n" + "=".repeat(60))
console.log("7. 依赖图总结")
console.log("=".repeat(60))
console.log("   ┌──────────────────────────────────────────┐")
console.log("   │           appLayer (最终组合)              │")
console.log("   │                                           │")
console.log("   │  ┌─────────┐    ┌──────────┐             │")
console.log("   │  │ Logger  │    │  Config  │             │")
console.log("   │  └────┬────┘    └────┬─────┘             │")
console.log("   │       │              │                    │")
console.log("   │       ▼              ▼                    │")
console.log("   │  ┌──────────────────────┐                │")
console.log("   │  │      Database        │                │")
console.log("   │  └──────────┬───────────┘                │")
console.log("   │             │                             │")
console.log("   │             ▼                             │")
console.log("   │  ┌──────────────────────┐                │")
console.log("   │  │    UserService       │                │")
console.log("   │  └──────────────────────┘                │")
console.log("   │                                           │")
console.log("   │  构建方式:                                  │")
console.log("   │  Layer.provide(                           │")
console.log("   │    Layer.provide(userServiceLayer,         │")
console.log("   │      databaseLayer),                      │")
console.log("   │    baseInfraLayer                         │")
console.log("   │  )                                        │")
console.log("   └──────────────────────────────────────────┘")
