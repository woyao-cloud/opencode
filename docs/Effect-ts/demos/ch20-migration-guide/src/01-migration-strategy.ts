/**
 * 01-migration-strategy.ts — 四阶段迁移策略
 *
 * 展示从传统 TypeScript 逐步迁移到 Effect-TS 的四个阶段：
 *   阶段 1: Schema 先行 — 用 Schema 定义数据模型和校验
 *   阶段 2: Effect 包装 — 将现有函数包装为 Effect
 *   阶段 3: Layer DI — 用 Context + Layer 管理依赖
 *   阶段 4: 全 Effect 架构 — 完整的 Effect 化应用
 *
 * 每个阶段都展示 before→after 对比，方便理解迁移路径。
 *
 * 运行: bun run src/01-migration-strategy.ts
 */
import { Effect, Schema, Context, Layer, ManagedRuntime } from "effect"

// ============================================================
// 阶段 1: Schema 先行 — 用 Schema 定义数据模型和校验
// ============================================================

// ---- Before: 纯 TypeScript 类型 + 手工校验 ----
interface UserBefore {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly age: number
}

function validateUserBefore(data: unknown): UserBefore {
  if (typeof data !== "object" || data === null) throw new Error("必须是对象")
  const obj = data as Record<string, unknown>
  if (typeof obj.id !== "string") throw new Error("id 必须是字符串")
  if (typeof obj.name !== "string") throw new Error("name 必须是字符串")
  if (typeof obj.email !== "string") throw new Error("email 必须是字符串")
  if (typeof obj.age !== "number") throw new Error("age 必须是数字")
  return { id: obj.id, name: obj.name, email: obj.email, age: obj.age }
}

// ---- After: Schema 定义，类型自动推导 ----
class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  age: Schema.Number,
}) {}

function demoPhase1() {
  return Effect.gen(function* () {
    console.log("=== 阶段 1: Schema 先行 ===")

    // Before: 手工校验
    const validData = { id: "1", name: "Alice", email: "alice@test.com", age: 25 }
    const userBefore = validateUserBefore(validData)
    console.log(`[Before] 校验通过: ${userBefore.name}`)

    // After: Schema 解码
    const userAfter = Schema.decodeUnknownSync(User)(validData)
    console.log(`[After] Schema 解码: ${userAfter.name}, 邮箱: ${userAfter.email}`)

    // Schema 自动提供编码
    const encoded = Schema.encodeSync(User)(userAfter)
    console.log(`[After] Schema 编码: ${JSON.stringify(encoded)}`)

    // Schema 校验失败示例
    const badData = { id: "2", name: "Bob", email: "not-an-email", age: -1 }
    const result = yield* Schema.decodeEffect(User)(badData).pipe(Effect.catch((e) =>
      Effect.succeed(`校验失败: ${e.message}`)
    ))
    console.log(`[After] 校验失败: ${result}`)
  })
}

// ============================================================
// 阶段 2: Effect 包装 — 将现有函数包装为 Effect
// ============================================================

// ---- Before: 传统 async/await 函数 ----
async function fetchUserLegacy(id: string): Promise<{ id: string; name: string }> {
  if (id === "error") throw new Error("网络错误")
  return { id, name: "Alice" }
}

async function saveUserLegacy(user: { id: string; name: string }): Promise<void> {
  console.log(`[Legacy] 保存用户: ${user.name}`)
}

// ---- After: 包装为 Effect ----
class FetchError {
  readonly _tag = "FetchError"
  constructor(readonly message: string) {}
}

const fetchUserEffect = (id: string): Effect.Effect<never, FetchError, { id: string; name: string }> =>
  id === "error"
    ? Effect.fail(new FetchError("网络错误"))
    : Effect.succeed({ id, name: "Alice" })

const saveUserEffect = (user: { id: string; name: string }): Effect.Effect<never, never, void> =>
  Effect.sync(() => console.log(`[Effect] 保存用户: ${user.name}`))

// Before 部分使用独立 async 函数
async function demoPhase2Before() {
  console.log("[Before] async/await 方式:")
  try {
    const user = await fetchUserLegacy("1")
    await saveUserLegacy(user)
    console.log("  async/await 成功")
  } catch (e) {
    console.log(`  async/await 失败: ${(e as Error).message}`)
  }
}

function demoPhase2() {
  return Effect.gen(function* () {
    console.log("\n=== 阶段 2: Effect 包装 ===")

    // Before: async/await 方式
    yield* Effect.promise(() => demoPhase2Before())

    // After: Effect 方式
    console.log("[After] Effect 方式:")
    const user = yield* fetchUserEffect("1")
    yield* saveUserEffect(user)
    console.log("  Effect 成功")

    // Effect 错误处理
    const errorResult = yield* fetchUserEffect("error").pipe(
      Effect.catch((e) => Effect.succeed(`捕获错误: ${e.message}`)),
    )
    console.log(`  ${errorResult}`)
  })
}

// ============================================================
// 阶段 3: Layer DI — 用 Context + Layer 管理依赖
// ============================================================

// ---- Before: 手工依赖注入 ----
interface LoggerService {
  log: (msg: string) => void
}

class AppServiceBefore {
  constructor(private logger: LoggerService) {}
  run() {
    this.logger.log("AppServiceBefore 运行中")
  }
}

// ---- After: Context + Layer ----
interface LoggerShape {
  readonly log: (msg: string) => Effect.Effect<void>
}

class Logger extends Context.Service<Logger, LoggerShape>()("Logger") {}

interface AppServiceShape {
  readonly run: Effect.Effect<void>
}

class AppService extends Context.Service<AppService, AppServiceShape>()("AppService") {}

// Logger 实现
const LoggerLive = Layer.succeed(Logger)(Logger.of({
  log: (msg) => Effect.sync(() => console.log(`[Logger] ${msg}`)),
}))

// AppService 实现（依赖 Logger）
const AppServiceLive = Layer.effect(AppService)(
  Effect.gen(function* () {
    const logger = yield* Logger
    return AppService.of({
      run: Effect.gen(function* () {
        yield* logger.log("AppService 运行中")
      }),
    })
  }),
)

// 组合 Layer: AppServiceLive 依赖 LoggerLive
const MainLayer = AppServiceLive.pipe(
  Layer.provide(LoggerLive),
)

async function demoPhase3() {
  console.log("\n=== 阶段 3: Layer DI ===")

  // Before: 手工 DI
  const loggerBefore: LoggerService = { log: (msg) => console.log(`[手工DI] ${msg}`) }
  const appBefore = new AppServiceBefore(loggerBefore)
  appBefore.run()
  console.log("[Before] 手工 DI 完成")

  // After: Layer DI — 使用 ManagedRuntime 注入依赖
  const runtime = ManagedRuntime.make(MainLayer)
  const svc = await runtime.runPromise(
    Effect.gen(function* () {
      return yield* AppService
    }),
  )
  await Effect.runPromise(svc.run)
  await runtime.dispose()
  console.log("[After] Layer DI 完成")
}

// ============================================================
// 阶段 4: 全 Effect 架构 — 完整的 Effect 化应用
// ============================================================

// 定义完整的应用服务
interface ConfigShape {
  readonly getApiUrl: Effect.Effect<string>
}

class ConfigService extends Context.Service<ConfigService, ConfigShape>()("ConfigService") {}

interface HttpClientShape {
  readonly get: (path: string) => Effect.Effect<string, Error>
}

class HttpClient extends Context.Service<HttpClient, HttpClientShape>()("HttpClient") {}

interface UserRepoShape {
  readonly findById: (id: string) => Effect.Effect<{ id: string; name: string }, Error>
}

class UserRepository extends Context.Service<UserRepository, UserRepoShape>()("UserRepository") {}

// 实现各层
const ConfigLive = Layer.succeed(ConfigService)(ConfigService.of({
  getApiUrl: Effect.succeed("https://api.example.com"),
}))

const HttpLive = Layer.effect(HttpClient)(
  Effect.gen(function* () {
    const config = yield* ConfigService
    return HttpClient.of({
      get: (path) =>
        Effect.gen(function* () {
          const baseUrl = yield* config.getApiUrl
          console.log(`[HTTP] GET ${baseUrl}${path}`)
          return `{"id":"1","name":"Alice"}`
        }),
    })
  }),
).pipe(Layer.provide(ConfigLive))

const UserRepoLive = Layer.effect(UserRepository)(
  Effect.gen(function* () {
    const http = yield* HttpClient
    return UserRepository.of({
      findById: (id) =>
        Effect.gen(function* () {
          const raw = yield* http.get(`/users/${id}`)
          const user = JSON.parse(raw) as { id: string; name: string }
          return user
        }),
    })
  }),
).pipe(Layer.provide(HttpLive))

const AppLayer = UserRepoLive

async function demoPhase4() {
  console.log("\n=== 阶段 4: 全 Effect 架构 ===")

  const runtime = ManagedRuntime.make(AppLayer)
  const repo = await runtime.runPromise(
    Effect.gen(function* () {
      return yield* UserRepository
    }),
  )
  const user = await Effect.runPromise(repo.findById("1"))
  await runtime.dispose()
  console.log(`[全 Effect] 用户: ${JSON.stringify(user)}`)
}

// ============================================================
// 运行所有阶段
// ============================================================

async function main() {
  try {
    await Effect.runPromise(demoPhase1())
    await Effect.runPromise(demoPhase2())
    await demoPhase3()
    await demoPhase4()
    console.log("\n✅ 01-migration-strategy.ts 运行完成")
  } catch (err) {
    console.error("运行失败:", err)
  }
}

main()
