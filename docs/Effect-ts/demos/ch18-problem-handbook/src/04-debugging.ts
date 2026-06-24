/**
 * 04-debugging.ts — 调试与诊断
 *
 * 演示 Effect-TS 的调试和诊断工具：
 * - Cause.pretty — 格式化输出错误原因
 * - Effect.tap / Effect.tapError — 观察成功/失败值而不改变流程
 * - Fiber.getCurrent — 查看当前 Fiber 状态
 * - Effect.withLogSpan — 日志范围标记
 *
 * 运行: bun run src/04-debugging.ts
 */

import { Effect, Cause, Console, Duration, Fiber, Schedule } from "effect"

// ============================================================
// 1. Cause.pretty — 格式化输出错误原因
// ============================================================

console.log("=== 1. Cause.pretty — 格式化输出错误原因 ===\n")

// Cause.pretty 将 Cause 格式化为人类可读的字符串
// 包含错误链、Fiber 栈信息等

class DatabaseError extends Error {
  readonly _tag = "DatabaseError"
  constructor(message: string) {
    super(message)
    this.name = "DatabaseError"
  }
}

class NetworkError extends Error {
  readonly _tag = "NetworkError"
  constructor(message: string) {
    super(message)
    this.name = "NetworkError"
  }
}

// 模拟一个多层嵌套的错误场景
const program1 = Effect.gen(function* () {
  // 第一层: 网络错误
  const result1 = yield* Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(10))
    return yield* Effect.fail(new NetworkError("连接超时"))
  }).pipe(
    Effect.catch((err: NetworkError) =>
      Effect.gen(function* () {
        // 第二层: 数据库错误（包含原始网络错误）
        return yield* Effect.fail(new DatabaseError(`查询失败: ${err.message}`))
      })
    ),
  )
  return result1
})

// 使用 Cause.pretty 格式化输出
Effect.runPromiseExit(program1).then((exit) => {
  if (exit._tag === "Failure") {
    const pretty = Cause.pretty(exit.cause)
    console.log("Cause.pretty 输出:")
    console.log(pretty)
  }
})

// ============================================================
// 2. Effect.tap / Effect.tapError — 观察而不改变流程
// ============================================================

console.log("\n=== 2. Effect.tap / Effect.tapError — 观察而不改变流程 ===\n")

// tap: 观察成功值，不影响结果
// tapError: 观察错误值，不影响错误传播

const processOrder = (orderId: number): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(50))
    if (orderId <= 0) {
      return yield* Effect.fail(new Error(`无效订单 ID: ${orderId}`))
    }
    return `订单 ${orderId} 处理完成`
  })

const program2 = processOrder(42).pipe(
  // tap: 在成功时打印日志，不改变返回值
  Effect.tap((result) =>
    Console.log(`  [tap] 成功日志: ${result}`)
  ),
  // tapError: 在失败时打印日志，不改变错误
  Effect.tapError((err) =>
    Console.log(`  [tapError] 错误日志: ${err.message}`)
  ),
)

Effect.runPromise(program2).then((result) =>
  console.log("最终结果:", result),
)

// 演示 tapError
const program2b = processOrder(-1).pipe(
  Effect.tap((result) =>
    Console.log(`  [tap] 成功日志: ${result}`)
  ),
  Effect.tapError((err) =>
    Console.log(`  [tapError] 错误日志: ${err.message}`)
  ),
)

Effect.runPromise(program2b).then(
  (result) => console.log("最终结果:", result),
  (err) => console.log("最终错误:", err.message),
)

// ============================================================
// 3. Fiber.getCurrent — 查看当前 Fiber 状态
// ============================================================

console.log("\n=== 3. Fiber.getCurrent — 查看当前 Fiber 状态 ===\n")

// Fiber.getCurrent() 返回当前正在执行的 Fiber 对象
// 可以访问 id、interruptible 等属性

const program3 = Effect.gen(function* () {
  // 创建一个长时间运行的 Fiber
  const worker = yield* Effect.gen(function* () {
    let count = 0
    while (count < 5) {
      count++
      yield* Console.log(`  [worker] 处理第 ${count} 项`)
      yield* Effect.sleep(Duration.millis(200))
    }
    return "处理完成"
  }).pipe(Effect.forkChild)

  // 等待 300ms 后查看 Fiber 状态
  yield* Effect.sleep(Duration.millis(300))

  // 使用 Fiber.getCurrent 获取当前 Fiber 信息
  const currentFiber = Fiber.getCurrent()
  console.log("当前 Fiber 信息:")
  console.log(`  id: ${(currentFiber as any).id}`)
  console.log(`  interruptible: ${(currentFiber as any).interruptible}`)

  // 等待 Fiber 完成
  const result = yield* Fiber.join(worker)
  console.log(`\nFiber 结果: ${result}`)
})

Effect.runPromise(program3)

// ============================================================
// 4. Effect.withLogSpan — 日志范围标记
// ============================================================

console.log("\n=== 4. Effect.withLogSpan — 日志范围标记 ===\n")

// withLogSpan 为日志添加范围标记，方便追踪嵌套调用

const fetchUser = (id: number): Effect.Effect<string> =>
  Effect.gen(function* () {
    yield* Console.log(`获取用户 ${id}`)
    yield* Effect.sleep(Duration.millis(50))
    return `用户-${id}`
  }).pipe(
    Effect.withLogSpan("fetchUser"),
  )

const fetchOrders = (userId: number): Effect.Effect<string> =>
  Effect.gen(function* () {
    yield* Console.log(`获取用户 ${userId} 的订单`)
    yield* Effect.sleep(Duration.millis(50))
    return `订单列表-${userId}`
  }).pipe(
    Effect.withLogSpan("fetchOrders"),
  )

const processDashboard = (userId: number): Effect.Effect<string> =>
  Effect.gen(function* () {
    const user = yield* fetchUser(userId)
    const orders = yield* fetchOrders(userId)
    return `${user} 的 ${orders}`
  }).pipe(
    Effect.withLogSpan("processDashboard"),
  )

const program4 = processDashboard(42)

Effect.runPromise(program4).then((result) =>
  console.log("仪表盘结果:", result),
)

// ============================================================
// 5. 实用模式: 调试组合
// ============================================================

console.log("\n=== 5. 实用模式: 调试组合 ===\n")

// 组合多种调试技术追踪复杂操作
const complexOperation = (id: number): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(50))

    if (id % 2 === 0) {
      return yield* Effect.fail(new Error(`ID ${id} 处理失败`))
    }

    return `ID ${id} 处理成功`
  })

const program5 = complexOperation(4).pipe(
  Effect.tap((result) => Console.log(`  [调试] 操作成功: ${result}`)),
  Effect.tapError((err) => Console.log(`  [调试] 操作失败: ${err.message}`)),
  Effect.retry({ times: 2 }),
  Effect.tap((result) => Console.log(`  [调试] 重试后结果: ${result}`)),
  Effect.tapError((err) => Console.log(`  [调试] 重试后仍失败: ${err.message}`)),
)

Effect.runPromiseExit(program5).then((exit) => {
  if (exit._tag === "Failure") {
    console.log("\n最终失败原因:")
    console.log(Cause.pretty(exit.cause))
  } else {
    console.log("\n最终成功:", exit.value)
  }
})

console.log("\n✅ 04-debugging.ts 运行完成")
