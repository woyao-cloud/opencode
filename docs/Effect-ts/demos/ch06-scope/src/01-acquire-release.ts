/**
 * 01-acquire-release.ts — acquireRelease 资源获取与释放模式
 *
 * acquireRelease 是 Scope 的核心模式：
 * - acquire: 获取资源的 Effect
 * - release: 无论成功或失败都会执行的清理函数 (接收资源 + Exit 状态)
 *
 * 这个模式保证资源在使用后一定会被释放，类似于 try-finally，
 * 但通过 Effect 的类型系统在编译期确保。
 */
import { Effect, Console, Scope, Exit } from "effect"

// ---------------------------------------------------------------------------
// 1. 模拟数据库连接资源
// ---------------------------------------------------------------------------

/** 模拟的数据库连接 */
interface DbConnection {
  readonly id: number
  readonly query: (sql: string) => Effect.Effect<string, Error>
}

let connectionCounter = 0

/** acquire: 创建数据库连接的 Effect */
const acquireConnection: Effect.Effect<DbConnection, Error> = Effect.sync(() => {
  const id = ++connectionCounter
  Console.log(`[acquire] 打开数据库连接 #${id}`)
  return {
    id,
    query: (sql: string) =>
      Effect.sync(() => `[连接 #${id}] 查询 "${sql}" 的结果`),
  }
})

/**
 * release: 释放连接的清理函数
 *
 * 第二个参数 exit: Exit.Exit<unknown, unknown> 表示 Effect 的退出状态：
 * - Exit.isSuccess(exit) 为 true 表示 Effect 成功完成
 * - Exit.isFailure(exit) 为 true 表示 Effect 以错误结束
 */
const releaseConnection = (
  conn: DbConnection,
  exit: Exit.Exit<unknown, unknown>,
): Effect.Effect<void> =>
  Effect.sync(() => {
    const status = Exit.isSuccess(exit) ? "成功" : "失败"
    Console.log(`[release] 关闭数据库连接 #${conn.id} (退出状态: ${status})`)
  })

// ---------------------------------------------------------------------------
// 2. 创建受 Scope 管理的连接 Effect
// ---------------------------------------------------------------------------

/**
 * acquireRelease 返回的 Effect 需要 Scope 上下文。
 * 使用 Effect.scoped 提供 Scope，Scope 关闭时自动调用 release。
 */
const managedConnection: Effect.Effect<DbConnection, Error, Scope.Scope> =
  Effect.acquireRelease(acquireConnection, releaseConnection)

// ---------------------------------------------------------------------------
// 3. 场景 1：正常查询 — 资源成功释放
// ---------------------------------------------------------------------------

const program1 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("=== 场景 1: 正常查询 ===")
    const conn = yield* managedConnection
    const result = yield* conn.query("SELECT * FROM users")
    Console.log(result)
    // Scope 关闭时会自动调用 releaseConnection
  }),
)

// ---------------------------------------------------------------------------
// 4. 场景 2：异常查询 — 即使失败也释放资源
// ---------------------------------------------------------------------------

const program2 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("\n=== 场景 2: 查询失败 ===")
    const conn = yield* managedConnection
    // 模拟错误：在执行查询前抛出异常
    yield* Effect.fail(new Error("数据库连接中断"))
    // 这行不会执行，但 release 仍然会被调用
    yield* conn.query("SELECT * FROM orders")
  }),
)

// ---------------------------------------------------------------------------
// 5. 场景 3：并行资源 — 多个连接共享 Scope（LIFO 释放）
// ---------------------------------------------------------------------------

const program3 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("\n=== 场景 3: 并行查询多个连接 ===")
    const conn1 = yield* managedConnection
    const conn2 = yield* managedConnection

    const results = yield* Effect.all([
      conn1.query("SELECT * FROM users"),
      conn2.query("SELECT * FROM orders"),
    ])

    Console.log(results[0])
    Console.log(results[1])
    // Scope 关闭时，conn2 先释放，conn1 后释放（LIFO 顺序）
  }),
)

// ---------------------------------------------------------------------------
// 运行所有场景
// ---------------------------------------------------------------------------

Effect.runPromise(program1)
  .then(() =>
    Effect.runPromise(program2).catch((err) =>
      console.log(`场景 2 捕获错误: ${err.message}`),
    ),
  )
  .then(() => Effect.runPromise(program3))
