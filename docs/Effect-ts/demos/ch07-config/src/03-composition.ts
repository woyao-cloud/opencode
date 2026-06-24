/**
 * 03-composition.ts
 * 演示 Config 的组合与验证：Config.all (多配置组合)、
 * Config.schema (Schema 结构化配置)、Config.orElse (回退)、
 * Config.redacted (敏感信息)、嵌套组合模式
 *
 * 运行: bun run src/03-composition.ts
 */

import { Config, ConfigProvider, Effect, Schema } from "effect"

// ============================================================
// 1. Config.all — 组合多个 Config
// ============================================================
// Config.all 将多个独立的 Config 组合成一个 Config，返回结果
// 镜像输入结构（元组、数组或记录对象）。

const combinedConfig = Config.all({
  host: Config.string("HOST"),
  port: Config.number("PORT").pipe(Config.withDefault(3000)),
  debug: Config.boolean("DEBUG").pipe(Config.withDefault(false))
})

const provider = ConfigProvider.fromUnknown({
  HOST: "api.example.com",
  PORT: 443,
  DEBUG: "true"
})

const result1 = Effect.runSync(combinedConfig.parse(provider))

console.log("=".repeat(60))
console.log("1. Config.all — 多配置组合")
console.log("=".repeat(60))
console.log("✅ 组合结果:", result1)

// ============================================================
// 2. Config.schema — 使用 Schema 定义结构化配置
// ============================================================
// Config.schema 是最高级的配置定义方式。它利用 Schema.Codec
// 来解码和验证配置数据。所有便捷构造函数内部都委托给 schema。

// 2a. 使用 Schema.Struct 定义完整配置结构
const AppConfig = Config.schema(
  Schema.Struct({
    host: Schema.String,
    port: Schema.Int,
    debug: Schema.Boolean
  }),
  "app"  // 配置根路径
)

const schemaProvider = ConfigProvider.fromUnknown({
  app: {
    host: "api.example.com",
    port: 8080,
    debug: true
  }
})

const result2a = Effect.runSync(AppConfig.parse(schemaProvider))

console.log("\n" + "=".repeat(60))
console.log("2a. Config.schema + Schema.Struct — 结构化配置")
console.log("=".repeat(60))
console.log("✅ Schema 解析结果:", result2a)

// 2b. 使用 Schema 的变换能力 — 从字符串解析 URL
const UrlConfig = Config.schema(Schema.URLFromString, "SERVICE_URL")

const urlProvider = ConfigProvider.fromUnknown({
  SERVICE_URL: "https://api.example.com/v2"
})

const result2b = Effect.runSync(UrlConfig.parse(urlProvider))

console.log("\n2b. Config.schema + Schema.URL — URL 配置")
console.log("✅ URL 解析结果:", result2b.toString())

// 2c. 使用 Config.duration — 从字符串解析 Duration
const DurationConfig = Config.duration("TIMEOUT")

const durationProvider = ConfigProvider.fromUnknown({
  TIMEOUT: "30 seconds"
})

const result2c = Effect.runSync(DurationConfig.parse(durationProvider))

console.log("\n2c. Config.duration — Duration 配置")
console.log("✅ Duration 解析结果:", result2c.toString())

// 2d. 使用 Config.literals — 限制为特定值
const EnvConfig = Config.literals(["development", "staging", "production"] as const, "ENV")

const envProvider = ConfigProvider.fromUnknown({ ENV: "production" })

const result2d = Effect.runSync(EnvConfig.parse(envProvider))

console.log("\n2d. Config.literals — 枚举配置")
console.log("✅ 环境配置:", result2d)

// ============================================================
// 3. Config.orElse — 配置级别回退
// ============================================================
// 与 withDefault 不同，orElse 捕获所有 ConfigError（不只是缺失）。
// 回退函数接收错误信息，可以据此选择不同的回退策略。

const primaryHost = Config.string("PRIMARY_HOST")
const fallbackHost = Config.string("FALLBACK_HOST")

const resilientHost = primaryHost.pipe(
  Config.orElse(() => fallbackHost)
)

// 场景1: 主键存在
const provider1 = ConfigProvider.fromUnknown({
  PRIMARY_HOST: "primary.example.com",
  FALLBACK_HOST: "fallback.example.com"
})
const result3a = Effect.runSync(resilientHost.parse(provider1))

// 场景2: 主键缺失，回退生效
const provider2 = ConfigProvider.fromUnknown({
  FALLBACK_HOST: "fallback.example.com"
})
const result3b = Effect.runSync(resilientHost.parse(provider2))

console.log("\n" + "=".repeat(60))
console.log("3. Config.orElse — 配置级别回退")
console.log("=".repeat(60))
console.log("✅ 主键存在:", result3a)
console.log("✅ 主键缺失→回退:", result3b)

// ============================================================
// 4. Config.redacted — 敏感信息保护
// ============================================================
// redacted 将配置值包装在 Redacted 容器中，防止在日志、
// toString 和错误信息中泄露。

const ApiConfig = Config.all({
  endpoint: Config.string("ENDPOINT"),
  apiKey: Config.redacted("API_KEY")
})

const secretsProvider = ConfigProvider.fromUnknown({
  ENDPOINT: "https://api.example.com",
  API_KEY: "sk-1234567890abcdef"
})

const result4 = Effect.runSync(ApiConfig.parse(secretsProvider))

console.log("\n" + "=".repeat(60))
console.log("4. Config.redacted — 敏感信息保护")
console.log("=".repeat(60))
console.log("✅ endpoint:", result4.endpoint)
console.log("✅ apiKey (被遮蔽):", result4.apiKey.toString())
// 注意: apiKey 在输出中显示为 <redacted>

// ============================================================
// 5. 多层嵌套组合 — 完整应用配置
// ============================================================
// 真实应用中，配置通常分为多个命名空间（database, redis, server）。

const DatabaseConfig = Config.all({
  host: Config.string("host"),
  port: Config.port("port").pipe(Config.withDefault(5432)),
  name: Config.string("name"),
  poolSize: Config.int("poolSize").pipe(Config.withDefault(10))
}).pipe(Config.nested("database"))

const RedisConfig = Config.all({
  url: Config.string("url"),
  ttl: Config.duration("ttl").pipe(Config.withDefault("3600 seconds" as any))
}).pipe(Config.nested("redis"))

const ServerConfig = Config.all({
  host: Config.string("host").pipe(Config.withDefault("0.0.0.0")),
  port: Config.port("port").pipe(Config.withDefault(3000))
}).pipe(Config.nested("server"))

const FullAppConfig = Config.all({
  database: DatabaseConfig,
  redis: RedisConfig,
  server: ServerConfig
})

const fullProvider = ConfigProvider.fromUnknown({
  database: {
    host: "db.internal",
    port: 5432,
    name: "myapp",
    poolSize: 20
  },
  redis: {
    url: "redis://cache.internal:6379",
    ttl: "1800 seconds"
  },
  server: {
    host: "0.0.0.0",
    port: 8080
  }
})

const result5 = Effect.runSync(FullAppConfig.parse(fullProvider))

console.log("\n" + "=".repeat(60))
console.log("5. 多层嵌套 — 完整应用配置")
console.log("=".repeat(60))
console.log("✅ 数据库:", result5.database)
console.log("✅ Redis:", result5.redis)
console.log("✅ 服务器:", result5.server)

// ============================================================
// 6. Schema 验证失败示例
// ============================================================
// 当 Schema 验证失败时，ConfigError 包含详细的错误信息。

const StrictConfig = Config.schema(
  Schema.Struct({
    port: Schema.Int.pipe(
      Schema.check(Schema.isBetween({ minimum: 1, maximum: 65535 }))
    ),
    env: Schema.Literal("production", "staging")
  })
)

const invalidProvider = ConfigProvider.fromUnknown({
  port: 99999,       // 超出范围
  env: "development" // 不是合法值
})

const exit6 = Effect.runSyncExit(StrictConfig.parse(invalidProvider))

console.log("\n" + "=".repeat(60))
console.log("6. Schema 验证失败")
console.log("=".repeat(60))

if (exit6._tag === "Failure") {
  console.log("✅ 验证失败（符合预期）")
  console.log("   错误摘要:", exit6.cause.toString().slice(0, 200))
}

// ============================================================
// 7. 总结
// ============================================================
console.log("\n" + "=".repeat(60))
console.log("总结: Config 组合与验证")
console.log("=".repeat(60))
console.log("  Config.all({...})        — 组合多个 Config")
console.log("  Config.schema(codec)     — Schema 结构化配置 (最强)")
console.log("  Config.orElse(fallback)  — 配置级别回退")
console.log("  Config.redacted(name)    — 敏感信息自动遮蔽")
console.log("  Config.nested(prefix)    — 命名空间前缀")
console.log("  Config.duration(name)    — Duration 类型配置")
console.log("  Config.literals([...])   — 枚举值限制")
console.log("  Schema 验证失败 → ConfigError 包含详细错误路径")
