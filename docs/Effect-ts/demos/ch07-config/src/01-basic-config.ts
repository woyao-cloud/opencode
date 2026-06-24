/**
 * 01-basic-config.ts
 * 演示 Config 基础 API：Config.string/number/boolean/int/port、
 * Config.withDefault/option/nested/map、yield* 获取配置值
 *
 * 运行: bun run src/01-basic-config.ts
 */

import { Config, ConfigProvider, Effect } from "effect"

// ============================================================
// 1. Config 基本构造函数 — 声明"我需要读取什么配置"
// ============================================================
// Config<T> 是一份"配置配方"：它描述如何从 ConfigProvider 中
// 提取并验证一个类型为 T 的值。
//
// 每个 Config 都可以在 Effect.gen 中通过 yield* 直接使用，
// 它会自动从上下文中解析当前的 ConfigProvider。

const hostConfig = Config.string("HOST")        // 读取字符串
const portConfig = Config.number("PORT")         // 读取数字 (包括 NaN/Infinity)
const debugConfig = Config.boolean("DEBUG")      // 读取布尔值 ("true"/"false"/"yes"/"no"/"on"/"off"/"1"/"0")
const workersConfig = Config.int("WORKERS")      // 读取整数 (拒绝浮点数)
const listenPortConfig = Config.port("PORT")     // 读取端口号 (1-65535)

console.log("=".repeat(60))
console.log("1. Config 基本构造函数")
console.log("=".repeat(60))
console.log("✅ Config.string('HOST')   — 创建字符串配置")
console.log("✅ Config.number('PORT')   — 创建数字配置")
console.log("✅ Config.boolean('DEBUG')  — 创建布尔配置 (yes/no/on/off/1/0)")
console.log("✅ Config.int('WORKERS')    — 创建整数配置")
console.log("✅ Config.port('PORT')      — 创建端口号配置 (1-65535)")

// ============================================================
// 2. 在 Effect.gen 中通过 yield* 获取配置值
// ============================================================
// Config 实现了 Effect.Yieldable 接口，可以直接 yield*。
// 系统自动从上下文中获取 ConfigProvider 并执行解析。

const program1 = Effect.gen(function* () {
  const host = yield* Config.string("HOST")
  const port = yield* Config.number("PORT")
  return `服务器启动于 ${host}:${port}`
})

// 使用 fromUnknown 提供测试数据
const result1 = Effect.runSync(
  program1.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ HOST: "localhost", PORT: 3000 })
    )
  )
)

console.log("\n" + "=".repeat(60))
console.log("2. Effect.gen 中 yield* Config")
console.log("=".repeat(60))
console.log("✅ 结果:", result1)

// ============================================================
// 3. Config.withDefault — 为缺失的配置提供默认值
// ============================================================
// withDefault 仅在数据缺失时生效。如果数据存在但类型错误
// （如 PORT="abc"），验证错误仍然会传播。

const portWithDefault = Config.number("PORT").pipe(Config.withDefault(3000))

const program2 = Effect.gen(function* () {
  const port = yield* portWithDefault
  return `端口: ${port}`
})

// 不提供 PORT — 使用默认值
const result2a = Effect.runSync(
  program2.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({}) // PORT 缺失
    )
  )
)

// 提供 PORT — 使用提供的值
const result2b = Effect.runSync(
  program2.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ PORT: 8080 }) // PORT 存在
    )
  )
)

console.log("\n" + "=".repeat(60))
console.log("3. Config.withDefault — 默认值")
console.log("=".repeat(60))
console.log("✅ PORT 缺失时使用默认值:", result2a)
console.log("✅ PORT 存在时使用实际值:", result2b)

// ============================================================
// 4. Config.option — 将配置变为可选
// ============================================================
// 返回 Option<A>: Some(value) 表示存在, None 表示缺失。
// 与 withDefault 一样，仅在数据缺失时返回 None。

const maybeDebug = Config.option(Config.boolean("DEBUG"))

const program3 = Effect.gen(function* () {
  const debug = yield* maybeDebug
  return `DEBUG 配置: ${debug._tag === "Some" ? `开启 (${debug.value})` : "未设置 (None)"}`
})

const result3a = Effect.runSync(
  program3.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({}) // DEBUG 缺失
    )
  )
)

const result3b = Effect.runSync(
  program3.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ DEBUG: "yes" }) // DEBUG 存在
    )
  )
)

console.log("\n" + "=".repeat(60))
console.log("4. Config.option — 可选配置")
console.log("=".repeat(60))
console.log("✅ 缺失时:", result3a)
console.log("✅ 存在时:", result3b)

// ============================================================
// 5. Config.nested — 命名空间前缀
// ============================================================
// 将配置限定在某个命名空间下，支持多层嵌套。

const dbConfig = Config.all({
  host: Config.string("host"),
  port: Config.number("port")
}).pipe(Config.nested("database"))

const program4 = Effect.gen(function* () {
  const db = yield* dbConfig
  return `数据库连接: ${db.host}:${db.port}`
})

const result4 = Effect.runSync(
  program4.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        database: { host: "db.example.com", port: 5432 }
      })
    )
  )
)

console.log("\n" + "=".repeat(60))
console.log("5. Config.nested — 命名空间")
console.log("=".repeat(60))
console.log("✅ 结果:", result4)

// ============================================================
// 6. Config.map — 对配置值进行纯函数变换
// ============================================================

const upperHost = Config.string("HOST").pipe(
  Config.map((s) => s.toUpperCase())
)

const program5 = Effect.gen(function* () {
  const host = yield* upperHost
  return `大写主机名: ${host}`
})

const result5 = Effect.runSync(
  program5.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ HOST: "my-server" })
    )
  )
)

console.log("\n" + "=".repeat(60))
console.log("6. Config.map — 值变换")
console.log("=".repeat(60))
console.log("✅ 结果:", result5)

// ============================================================
// 7. ConfigError — 当配置验证失败时
// ============================================================
// 当数据存在但类型不匹配时，抛出 ConfigError

const strictPort = Config.port("PORT") // 要求 1-65535 的整数

const program6 = Effect.gen(function* () {
  const port = yield* strictPort
  return `端口: ${port}`
})

const exit6 = Effect.runSyncExit(
  program6.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ PORT: "not-a-number" }) // 无效值
    )
  )
)

console.log("\n" + "=".repeat(60))
console.log("7. ConfigError — 验证失败")
console.log("=".repeat(60))
console.log("✅ 配置错误（符合预期）:", exit6._tag === "Failure" ? "Failure" : "Success")

if (exit6._tag === "Failure") {
  const msg = exit6.cause.toString()
  console.log("   错误原因:", msg.slice(0, 150))
}

// ============================================================
// 8. 总结
// ============================================================
console.log("\n" + "=".repeat(60))
console.log("总结: Config 的核心 API")
console.log("=".repeat(60))
console.log("  Config.string(name)    — 读取字符串配置")
console.log("  Config.number(name)    — 读取数字配置")
console.log("  Config.boolean(name)   — 读取布尔配置")
console.log("  Config.int(name)       — 读取整数配置")
console.log("  Config.port(name)      — 读取端口号配置")
console.log("  .pipe(Config.withDefault(v)) — 提供默认值")
console.log("  Config.option(c)       — 变为可选")
console.log("  .pipe(Config.nested(n))— 命名空间前缀")
console.log("  .pipe(Config.map(f))   — 纯函数变换")
console.log("  yield* config          — 在 Effect.gen 中直接使用")
