/**
 * 案例 1: Runtime 架构 — ManagedRuntime + Layer.mergeAll
 *
 * 本 demo 模拟 OpenCode 中 app-runtime.ts 的核心模式：
 * 使用 Layer.mergeAll 合并多个服务层，再通过 ManagedRuntime.make 创建运行时。
 *
 * 关键 API:
 * - Context.Tag / Context.Service — 定义服务标识
 * - Layer.effect — 从 Effect 创建 Layer
 * - Layer.mergeAll — 合并多个 Layer 为一个
 * - ManagedRuntime.make — 从 Layer 创建可运行的 Runtime
 * - ManagedRuntime.Services — 提取运行时提供的服务类型
 */

import { Context, Effect, Layer, ManagedRuntime, Console } from "effect"

// ============================================================
// 1. 定义服务接口
// ============================================================

// --- 配置服务 ---
export interface ConfigInterface {
  readonly get: () => Effect.Effect<{ port: number; host: string }>
}
export class ConfigService extends Context.Service<ConfigService, ConfigInterface>()(
  "@demo/Config",
) {}

// --- 日志服务 ---
export interface LoggerInterface {
  readonly info: (msg: string) => Effect.Effect<void>
  readonly error: (msg: string) => Effect.Effect<void>
}
export class LoggerService extends Context.Service<LoggerService, LoggerInterface>()(
  "@demo/Logger",
) {}

// --- 数据库服务 ---
export interface DatabaseInterface {
  readonly query: (sql: string) => Effect.Effect<string[]>
}
export class DatabaseService extends Context.Service<DatabaseService, DatabaseInterface>()(
  "@demo/Database",
) {}

// --- 应用服务 (依赖 Config + Logger + Database) ---
export interface AppInterface {
  readonly start: () => Effect.Effect<void>
}
export class AppService extends Context.Service<AppService, AppInterface>()(
  "@demo/App",
) {}

// ============================================================
// 2. 实现各服务层
// ============================================================

// Config 层: 提供配置读取
export const ConfigLayer = Layer.effect(
  ConfigService,
  Effect.sync(() =>
    ConfigService.of({
      get: () => Effect.succeed({ port: 8080, host: "localhost" }),
    })
  ),
)

// Logger 层: 提供日志记录
export const LoggerLayer = Layer.effect(
  LoggerService,
  Effect.sync(() =>
    LoggerService.of({
      info: (msg) => Console.log(`[INFO] ${msg}`),
      error: (msg) => Console.log(`[ERROR] ${msg}`),
    })
  ),
)

// Database 层: 依赖 Config
export const DatabaseLayer = Layer.effect(
  DatabaseService,
  Effect.gen(function* () {
    const config = yield* ConfigService
    return DatabaseService.of({
      query: (sql) =>
        Effect.gen(function* () {
          const cfg = yield* config.get()
          yield* Console.log(`[DB] 查询 ${cfg.host}:${cfg.port} — ${sql}`)
          return [`result_1`, `result_2`]
        }),
    })
  }),
).pipe(Layer.provide(ConfigLayer))

// App 层: 依赖 Config + Logger + Database
export const AppLayer = Layer.effect(
  AppService,
  Effect.gen(function* () {
    const config = yield* ConfigService
    const logger = yield* LoggerService
    const db = yield* DatabaseService
    return AppService.of({
      start: () =>
        Effect.gen(function* () {
          const cfg = yield* config.get()
          yield* logger.info(`应用启动于 ${cfg.host}:${cfg.port}`)
          const results = yield* db.query("SELECT * FROM users")
          yield* logger.info(`查询到 ${results.length} 条记录`)
          yield* Console.log("应用启动完成!")
        }),
    })
  }),
).pipe(Layer.provide(ConfigLayer), Layer.provide(LoggerLayer), Layer.provide(DatabaseLayer))

// ============================================================
// 3. 合并所有层 — 类似 OpenCode 的 Layer.mergeAll
// ============================================================

// 将所有服务层合并为一个 Layer
// 对应 OpenCode 中: const AppLayer = Layer.mergeAll(Npm.defaultLayer, Bus.defaultLayer, ...)
export const AllLayers = Layer.mergeAll(
  ConfigLayer,
  LoggerLayer,
  DatabaseLayer,
  AppLayer,
)

// ============================================================
// 4. 创建 ManagedRuntime — 类似 OpenCode 的 ManagedRuntime.make
// ============================================================

// 从合并后的 Layer 创建运行时
// 对应 OpenCode 中: const rt = ManagedRuntime.make(AppLayer, { memoMap })
const rt = ManagedRuntime.make(AllLayers)

// 提取运行时提供的服务类型
// 对应 OpenCode 中: type AppServices = ManagedRuntime.ManagedRuntime.Services<typeof rt>
type AppServices = ManagedRuntime.ManagedRuntime.Services<typeof rt>

// 包装运行时，提供类型安全的 runPromise 方法
// 对应 OpenCode 中: const AppRuntime: Runtime = { runSync, runPromise, ... }
const AppRuntime = {
  runPromise: <E, A>(effect: Effect.Effect<A, E>) => rt.runPromise(effect),
  dispose: () => rt.dispose(),
}

// ============================================================
// 5. 使用运行时
// ============================================================

// 通过 AppRuntime 运行 Effect，自动注入所有依赖
await AppRuntime.runPromise(
  Effect.gen(function* () {
    const app = yield* AppService
    yield* app.start()
  }),
)
