/**
 * 03-finalizer.ts — addFinalizer 清理钩子
 *
 * addFinalizer 向当前 Scope 注册一个"终结器"（finalizer）。
 * 当 Scope 关闭时，所有注册的 finalizer 会按 LIFO 顺序执行。
 *
 * 与 acquireRelease 的区别：
 * - acquireRelease: 将"获取"和"释放"配对，适用于需要显式获取的资源
 * - addFinalizer: 只注册清理逻辑，适用于已有资源或副作用清理
 *
 * 典型场景：
 * - 关闭文件描述符
 * - 清理临时文件
 * - 取消订阅
 * - 重置状态
 */
import { Effect, Console, Scope, Exit } from "effect"

// ---------------------------------------------------------------------------
// 1. 基本 finalizer 注册和执行顺序
// ---------------------------------------------------------------------------

const program1 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("=== 场景 1: 基本 finalizer 和 LIFO 执行顺序 ===")

    // 注册 finalizer 1（最先注册，最后执行）
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => Console.log("[finalizer] 第 1 个注册 — 最后执行")),
    )

    // 注册 finalizer 2
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => Console.log("[finalizer] 第 2 个注册 — 第二个执行")),
    )

    // 注册 finalizer 3（最后注册，最先执行）
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => Console.log("[finalizer] 第 3 个注册 — 最先执行")),
    )

    Console.log("Scope 即将关闭，finalizer 将按 LIFO 顺序执行:")
  }),
)

// ---------------------------------------------------------------------------
// 2. 模拟临时文件清理
// ---------------------------------------------------------------------------

let tempFileExists = false

const program2 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("\n=== 场景 2: 临时文件清理 ===")

    // 模拟创建临时文件
    tempFileExists = true
    Console.log("[create] 创建临时文件 /tmp/effect-demo.tmp")

    // 注册清理 finalizer — 无论成功还是失败都会执行
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (tempFileExists) {
          tempFileExists = false
          Console.log("[finalizer] 清理临时文件 /tmp/effect-demo.tmp")
        }
      }),
    )

    // 模拟文件操作
    Console.log("[work] 处理临时文件...")
    Console.log("操作完成，Scope 关闭时会自动清理")
  }),
)

// ---------------------------------------------------------------------------
// 3. finalizer 在错误场景中的行为
// ---------------------------------------------------------------------------

const program3 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("\n=== 场景 3: 错误场景中的 finalizer ===")

    let resourceCleaned = false

    // 注册清理 finalizer
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        resourceCleaned = true
        Console.log("[finalizer] 清理资源（即使发生错误）")
      }),
    )

    Console.log("[setup] 资源已初始化")

    // 模拟操作失败
    yield* Effect.fail(new Error("操作失败"))

    // 这行不会执行，但 finalizer 仍然会被调用
    Console.log("这行永远不会执行")
  }),
)

// ---------------------------------------------------------------------------
// 4. finalizer 与 acquireRelease 的组合使用
// ---------------------------------------------------------------------------

/**
 * acquireRelease 内部也是通过 addFinalizer 实现的。
 * 两者可以组合使用：
 * - acquireRelease 管理主要资源
 * - addFinalizer 添加额外的清理逻辑（日志、指标等）
 */
const program4 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("\n=== 场景 4: finalizer 与 acquireRelease 组合 ===")

    // 使用 acquireRelease 管理数据库连接
    const connection = yield* Effect.acquireRelease(
      Effect.sync(() => {
        Console.log("[acquire] 打开数据库连接")
        return { id: 1 }
      }),
      (conn, _exit) =>
        Effect.sync(() =>
          Console.log(`[release] 关闭数据库连接 #${conn.id}`),
        ),
    )

    // 额外注册一个 finalizer：记录连接使用指标
    yield* Effect.addFinalizer(() =>
      Effect.sync(() =>
        Console.log("[finalizer] 记录连接使用指标到监控系统"),
      ),
    )

    Console.log(`[work] 使用连接 #${connection.id} 执行查询...`)
    // Scope 关闭时：
    // 1. 先执行 finalizer（记录指标）— 后注册先执行
    // 2. 再执行 acquireRelease 的 release（关闭连接）
  }),
)

// ---------------------------------------------------------------------------
// 运行
// ---------------------------------------------------------------------------

Effect.runPromise(program1)
  .then(() => Effect.runPromise(program2))
  .then(() =>
    Effect.runPromise(program3).catch((err) =>
      console.log(`场景 3 捕获错误: ${err.message}`),
    ),
  )
  .then(() => Effect.runPromise(program4))
