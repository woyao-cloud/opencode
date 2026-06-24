/**
 * 04-runtime-flags-pattern.ts
 * 演示 RuntimeFlags 模式：将 Config 与 Context/Layer 结合，
 * 创建类型安全的运行时特性开关。
 *
 * 此模式源自 OpenCode 的 production 代码：
 *   1. 用 Config 声明"配置来自哪里"
 *   2. 用 Context.GenericTag 声明"谁需要这些配置"
 *   3. 用 Layer.effect 将 Config 值注入 Context
 *   4. 业务代码只需 yield* Tag，不关心配置来源
 *
 * 运行: bun run src/04-runtime-flags-pattern.ts
 */

import { Config, ConfigProvider, Context, Effect, Layer } from "effect"

// ============================================================
// 第 1 步: 定义 RuntimeFlags 接口
// ============================================================
// 将所有运行时标志集中在一个接口中，便于管理和类型推导。

interface RuntimeFlags {
  /** 是否启用调试模式 */
  readonly debug: boolean
  /** 是否启用 AI 功能 */
  readonly ai: boolean
  /** 是否启用性能监控 */
  readonly telemetry: boolean
  /** 最大并发任务数 */
  readonly maxConcurrency: number
  /** 日志级别 */
  readonly logLevel: "debug" | "info" | "warn" | "error"
}

// ============================================================
// 第 2 步: 创建 Context.GenericTag
// ============================================================
// 业务代码通过 yield* RuntimeFlags 获取标志，不关心配置来源。

const RuntimeFlags = Context.GenericTag<RuntimeFlags>("RuntimeFlags")

// ============================================================
// 第 3 步: 用 Config 声明配置映射
// ============================================================
// 每个标志对应一个 Config，声明了从 ConfigProvider 中
// 如何读取和验证该标志的值。

const runtimeFlagsConfig = Config.all({
  debug: Config.boolean("DEBUG").pipe(Config.withDefault(false)),
  ai: Config.boolean("AI").pipe(Config.withDefault(true)),
  telemetry: Config.boolean("TELEMETRY").pipe(Config.withDefault(true)),
  maxConcurrency: Config.int("MAX_CONCURRENCY").pipe(Config.withDefault(4)),
  logLevel: Config.literals(
    ["debug", "info", "warn", "error"] as const,
    "LOG_LEVEL"
  ).pipe(Config.withDefault("info" as const))
})

// ============================================================
// 第 4 步: 构建 Layer — 将 Config 值注入 Context
// ============================================================
// Layer.effect 从 Config 读取值，然后通过 Layer.succeed
// 将其注入 Context。
//
// 这层 Layer 是"配置 → 服务"的桥梁。

const RuntimeFlagsLive = Layer.effect(
  RuntimeFlags,
  Effect.gen(function* () {
    // yield* Config 从上下文的 ConfigProvider 读取配置
    const flags = yield* runtimeFlagsConfig
    return flags
  })
)

console.log("=".repeat(60))
console.log("RuntimeFlags 模式 — 配置 → Context → 业务")
console.log("=".repeat(60))

// ============================================================
// 第 5 步: 在业务代码中使用 RuntimeFlags
// ============================================================
// 业务代码只需 yield* RuntimeFlags，完全不关心配置细节。

const businessLogic = Effect.gen(function* () {
  const flags = yield* RuntimeFlags

  console.log("当前运行时标志:")
  console.log("  debug:", flags.debug)
  console.log("  ai:", flags.ai)
  console.log("  telemetry:", flags.telemetry)
  console.log("  maxConcurrency:", flags.maxConcurrency)
  console.log("  logLevel:", flags.logLevel)

  // 根据标志做出不同行为
  if (flags.debug) {
    console.log("  → 调试模式已启用，输出详细信息")
  }

  if (flags.ai) {
    console.log("  → AI 功能已启用")
  } else {
    console.log("  → AI 功能已禁用")
  }

  return {
    canUseAI: flags.ai,
    shouldReport: flags.telemetry,
    maxWorkers: flags.maxConcurrency
  }
})

// ============================================================
// 第 6 步: 组装并运行
// ============================================================
// 提供 ConfigProvider 和 RuntimeFlagsLive Layer

const appLayer = RuntimeFlagsLive.pipe(
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        DEBUG: "true",
        AI: "yes",
        TELEMETRY: "false",
        MAX_CONCURRENCY: 8,
        LOG_LEVEL: "debug"
      })
    )
  )
)

const result = Effect.runSync(Effect.provide(businessLogic, appLayer))

console.log("\n业务逻辑返回:", result)

// ============================================================
// 第 7 步: 演示不同配置环境
// ============================================================
// 同样的业务代码，不同的配置 → 不同的行为。
// 这就是 RuntimeFlags 模式的核心价值。

console.log("\n" + "=".repeat(60))
console.log("不同环境的配置切换")
console.log("=".repeat(60))

// 生产环境配置
const productionConfig = ConfigProvider.fromUnknown({
  DEBUG: "false",
  AI: "yes",
  TELEMETRY: "true",
  MAX_CONCURRENCY: 16,
  LOG_LEVEL: "warn"
})

const prodLayer = RuntimeFlagsLive.pipe(
  Layer.provide(ConfigProvider.layer(productionConfig))
)

console.log("\n[生产环境]")
const prodResult = Effect.runSync(Effect.provide(businessLogic, prodLayer))

// 测试环境配置
const testConfig = ConfigProvider.fromUnknown({
  DEBUG: "true",
  AI: "no",
  TELEMETRY: "false",
  MAX_CONCURRENCY: 1,
  LOG_LEVEL: "debug"
})

const testLayer = RuntimeFlagsLive.pipe(
  Layer.provide(ConfigProvider.layer(testConfig))
)

console.log("\n[测试环境]")
const testResult = Effect.runSync(Effect.provide(businessLogic, testLayer))

// ============================================================
// 第 8 步: 扩展模式 — 多个服务组合
// ============================================================
// RuntimeFlags 只是其中一个服务。真实应用中，你可以有多个
// 这样的"配置驱动服务"。

interface DatabaseConfig {
  readonly host: string
  readonly port: number
}

const DatabaseConfig = Context.GenericTag<DatabaseConfig>("DatabaseConfig")

const databaseConfigLive = Layer.effect(
  DatabaseConfig,
  Effect.gen(function* () {
    const host = yield* Config.string("DATABASE_HOST")
    const port = yield* Config.port("DATABASE_PORT").pipe(
      Config.withDefault(5432)
    )
    return { host, port } as DatabaseConfig
  })
)

// 组合多个服务
const combinedBusinessLogic = Effect.gen(function* () {
  const flags = yield* RuntimeFlags
  const db = yield* DatabaseConfig

  console.log("\n[组合服务]")
  console.log("  DB 连接:", `${db.host}:${db.port}`)
  console.log("  调试模式:", flags.debug)

  return { db, flags }
})

const combinedLayer = Layer.mergeAll(
  RuntimeFlagsLive,
  databaseConfigLive
).pipe(
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        DEBUG: "true",
        AI: "yes",
        TELEMETRY: "true",
        MAX_CONCURRENCY: 4,
        LOG_LEVEL: "info",
        DATABASE_HOST: "db.example.com",
        DATABASE_PORT: 5432
      })
    )
  )
)

const combinedResult = Effect.runSync(
  Effect.provide(combinedBusinessLogic, combinedLayer)
)

console.log("✅ 组合结果:", combinedResult)

// ============================================================
// 总结
// ============================================================
console.log("\n" + "=".repeat(60))
console.log("总结: RuntimeFlags 模式")
console.log("=".repeat(60))
console.log("  1. 定义 RuntimeFlags 接口 — 所有标志集中管理")
console.log("  2. Context.GenericTag<T>  — 声明服务依赖")
console.log("  3. Config.all({...})     — 声明配置读取方式")
console.log("  4. Layer.effect(Tag, ...)— 将 Config 值注入 Context")
console.log("  5. 业务代码 yield* Tag   — 只关心值，不关心来源")
console.log("")
console.log("  优势:")
console.log("  - 类型安全: 每个标志的类型由接口保证")
console.log("  - 可测试: 用 Layer.succeed 直接注入测试值")
console.log("  - 可组合: Layer.mergeAll 组合多个配置服务")
console.log("  - 环境无关: 同一业务代码，不同 ConfigProvider 不同行为")
