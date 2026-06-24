/**
 * 02-provider.ts
 * 演示 ConfigProvider 的多种数据源：fromUnknown (JSON对象)、
 * fromEnv (环境变量)、constantCase (camelCase→CONSTANT_CASE)、
 * fromDotEnvContents (.env 字符串)、orElse (回退)、nested (前缀)
 *
 * 运行: bun run src/02-provider.ts
 */

import { Config, ConfigProvider, Effect, Layer } from "effect"

// ============================================================
// 1. ConfigProvider.fromUnknown — 从 JSON 对象读取配置
// ============================================================
// 最常见的测试/开发用 Provider。路径遍历遵循 JS 对象规则：
// 字符串段 → 对象键，数字段 → 数组索引。

const fromUnknownProvider = ConfigProvider.fromUnknown({
  host: "localhost",
  port: 5432,
  features: {
    logging: true,
    caching: false
  }
})

const basicProgram = Effect.gen(function* () {
  const host = yield* Config.string("host")
  const port = yield* Config.number("port")
  return { host, port }
})

const result1 = Effect.runSync(
  basicProgram.pipe(
    Effect.provideService(ConfigProvider.ConfigProvider, fromUnknownProvider)
  )
)

console.log("=".repeat(60))
console.log("1. ConfigProvider.fromUnknown — JSON 对象")
console.log("=".repeat(60))
console.log("✅ 读取结果:", result1)

// 嵌套访问
const featuresConfig = Config.all({
  logging: Config.boolean("logging"),
  caching: Config.boolean("caching")
}).pipe(Config.nested("features"))

const result1b = Effect.runSync(
  featuresConfig.parse(fromUnknownProvider)
)

console.log("✅ 嵌套读取 (features):", result1b)

// ============================================================
// 2. ConfigProvider.fromEnv — 从环境变量读取
// ============================================================
// fromEnv 使用 _ 连接路径段进行查找，同时也将环境变量名按 _ 分割
// 构建字典树。例如 DATABASE_HOST=localhost 在路径 ["DATABASE","HOST"]
// 和 ["DATABASE_HOST"] 都可访问。

const envProvider = ConfigProvider.fromEnv({
  env: {
    APP_HOST: "prod.example.com",
    APP_PORT: "8080",
    DATABASE_HOST: "db.internal",
    DATABASE_PORT: "5432"
  }
})

const appConfig = Config.all({
  host: Config.string("HOST"),
  port: Config.number("PORT")
})

const result2 = Effect.runSync(
  appConfig.parse(
    envProvider.pipe(ConfigProvider.nested("APP"))
  )
)

console.log("\n" + "=".repeat(60))
console.log("2. ConfigProvider.fromEnv — 环境变量")
console.log("=".repeat(60))
console.log("✅ APP 命名空间结果:", result2)

// 直接路径访问 (DATABASE_HOST 作为一个整体键)
const dbHostDirect = Effect.runSync(
  Config.string("DATABASE_HOST").parse(envProvider)
)
console.log("✅ 直接路径 DATABASE_HOST:", dbHostDirect)

// ============================================================
// 3. ConfigProvider.constantCase — camelCase → CONSTANT_CASE
// ============================================================
// 将 camelCase 的配置键自动转换为 SCREAMING_SNAKE_CASE，
// 这是桥接 TypeScript 命名约定与环境变量命名约定的标准方式。

const camelCaseProvider = ConfigProvider.fromEnv({
  env: {
    DATABASE_HOST: "db.example.com",
    DATABASE_PORT: "5432",
    REDIS_URL: "redis://localhost:6379"
  }
}).pipe(ConfigProvider.constantCase)

const typedConfig = Config.all({
  databaseHost: Config.string("databaseHost"),
  databasePort: Config.number("databasePort"),
  redisUrl: Config.string("redisUrl")
})

const result3 = Effect.runSync(typedConfig.parse(camelCaseProvider))

console.log("\n" + "=".repeat(60))
console.log("3. ConfigProvider.constantCase — 命名约定转换")
console.log("=".repeat(60))
console.log("✅ camelCase 键 → CONSTANT_CASE 环境变量:")
console.log("   databaseHost  → DATABASE_HOST →", result3.databaseHost)
console.log("   databasePort  → DATABASE_PORT →", result3.databasePort)
console.log("   redisUrl      → REDIS_URL     →", result3.redisUrl)

// ============================================================
// 4. ConfigProvider.fromDotEnvContents — 解析 .env 文件内容
// ============================================================
// 当你已有 .env 文件内容字符串时使用（如从远程加载或嵌入测试）。

const dotEnvContents = `
# 服务器配置
HOST=0.0.0.0
PORT=3000

# 调试模式
DEBUG=true
`

const dotEnvProvider = ConfigProvider.fromDotEnvContents(dotEnvContents)

const dotEnvProgram = Effect.gen(function* () {
  const host = yield* Config.string("HOST")
  const port = yield* Config.number("PORT")
  const debug = yield* Config.boolean("DEBUG")
  return { host, port, debug }
})

const result4 = Effect.runSync(
  dotEnvProgram.pipe(
    Effect.provideService(ConfigProvider.ConfigProvider, dotEnvProvider)
  )
)

console.log("\n" + "=".repeat(60))
console.log("4. ConfigProvider.fromDotEnvContents — .env 文件解析")
console.log("=".repeat(60))
console.log("✅ .env 解析结果:", result4)

// ============================================================
// 5. ConfigProvider.orElse — 多源回退
// ============================================================
// 当主 Provider 返回 undefined（未找到）时，回退到备用 Provider。
// 注意：主 Provider 的 SourceError 不会被捕获，会直接传播。

const primaryProvider = ConfigProvider.fromUnknown({
  host: "primary.example.com"
  // port 故意不提供，让回退生效
})

const fallbackProvider = ConfigProvider.fromUnknown({
  host: "fallback.example.com",
  port: 9999
})

const combinedProvider = ConfigProvider.orElse(primaryProvider, fallbackProvider)

const orElseProgram = Effect.gen(function* () {
  const host = yield* Config.string("host")
  const port = yield* Config.number("port")
  return { host, port }
})

const result5 = Effect.runSync(
  orElseProgram.pipe(
    Effect.provideService(ConfigProvider.ConfigProvider, combinedProvider)
  )
)

console.log("\n" + "=".repeat(60))
console.log("5. ConfigProvider.orElse — 多源回退")
console.log("=".repeat(60))
console.log("✅ host 来自主源, port 回退到备用源:", result5)

// ============================================================
// 6. ConfigProvider.nested — Provider 级别前缀
// ============================================================
// 在 Provider 级别添加路径前缀，与 Config.nested 在 Config 级别
// 添加前缀形成互补。两者可以组合使用。

const baseProvider = ConfigProvider.fromUnknown({
  app: {
    host: "myapp.local",
    port: 8080
  },
  database: {
    host: "db.local",
    port: 5432
  }
})

// Provider 级别的嵌套
const appProvider = baseProvider.pipe(ConfigProvider.nested("app"))
const dbProvider = baseProvider.pipe(ConfigProvider.nested("database"))

const hostPortConfig = Config.all({
  host: Config.string("host"),
  port: Config.number("port")
})

const appResult = Effect.runSync(hostPortConfig.parse(appProvider))
const dbResult = Effect.runSync(hostPortConfig.parse(dbProvider))

console.log("\n" + "=".repeat(60))
console.log("6. ConfigProvider.nested — Provider 前缀")
console.log("=".repeat(60))
console.log("✅ app 命名空间:", appResult)
console.log("✅ database 命名空间:", dbResult)

// ============================================================
// 7. ConfigProvider.layer — 将 Provider 安装为 Layer
// ============================================================
// layer 将 Provider 安装为可组合的 Layer，替换当前上下文中
// 的 ConfigProvider。

const testLayer = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ HOST: "test.local", PORT: 4000 })
)

const layerProgram = Effect.gen(function* () {
  const host = yield* Config.string("HOST")
  const port = yield* Config.number("PORT")
  return { host, port }
})

const result7 = Effect.runSync(Effect.provide(layerProgram, testLayer))

console.log("\n" + "=".repeat(60))
console.log("7. ConfigProvider.layer — 安装为 Layer")
console.log("=".repeat(60))
console.log("✅ Layer 方式提供:", result7)

// ============================================================
// 8. ConfigProvider.layerAdd — 追加 Provider（不替换现有）
// ============================================================
// layerAdd 将新 Provider 与当前已有的合并（通过 orElse），
// 而不是替换。默认新 Provider 作为回退；设置 asPrimary: true
// 让它成为主源。
//
// 下面演示: 先用 layer 安装基础 Provider，再用 layerAdd
// 追加默认值 Provider。当基础 Provider 缺少 PORT 时，
// 回退到默认值。

const layerAddBaseProvider = ConfigProvider.fromUnknown({ HOST: "base.local" })
// PORT 故意不提供，让默认值层生效

const layerAddDefaultsProvider = ConfigProvider.fromUnknown({
  HOST: "default.local",
  PORT: 3000
})

// 构建双层 Layer: 基础 + 默认值回退
const combinedLayer = Layer.provide(
  ConfigProvider.layerAdd(layerAddDefaultsProvider),
  ConfigProvider.layer(layerAddBaseProvider)
)

const layerAddProgram = Effect.gen(function* () {
  const host = yield* Config.string("HOST")
  const port = yield* Config.number("PORT")
  return { host, port }
})

const result8 = Effect.runSync(Effect.provide(layerAddProgram, combinedLayer))

console.log("\n" + "=".repeat(60))
console.log("8. ConfigProvider.layerAdd — 追加 Provider")
console.log("=".repeat(60))
console.log("✅ HOST 来自基础层, PORT 来自默认值层:", result8)

// ============================================================
// 9. 总结
// ============================================================
console.log("\n" + "=".repeat(60))
console.log("总结: ConfigProvider 数据源")
console.log("=".repeat(60))
console.log("  fromUnknown(obj)        — JSON 对象 (测试/开发)")
console.log("  fromEnv({env})          — 环境变量")
console.log("  fromDotEnvContents(str) — .env 文件内容")
console.log("  fromDotEnv()            — 读取 .env 文件 (需 FileSystem)")
console.log("  constantCase            — camelCase → CONSTANT_CASE")
console.log("  orElse(a, b)            — 多源回退")
console.log("  nested(prefix)          — 路径前缀")
console.log("  mapInput(f)             — 自定义路径变换")
console.log("  layer(provider)         — 安装为 Layer")
console.log("  layerAdd(provider)      — 追加 Layer (不替换)")
