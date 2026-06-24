/**
 * 01-long-running-task.ts — 长任务超时、中断与检查点模式
 *
 * 演示 Effect-TS 处理长时间运行任务的三种模式：
 * - Effect.timeout — 超时控制，防止任务无限执行
 * - Effect.onInterrupt — 中断时的清理回调
 * - 检查点模式 — 在长任务中插入检查点，支持安全中断和进度保存
 *
 * 运行: bun run src/01-long-running-task.ts
 */

import { Effect, Duration, Console, Fiber } from "effect"

// ============================================================
// 1. Effect.timeout — 超时控制
// ============================================================

console.log("=== 1. Effect.timeout — 超时控制 ===\n")

// 模拟一个可能无限执行的任务
const infiniteTask = Effect.gen(function* () {
  let count = 0
  while (true) {
    count++
    yield* Console.log(`  任务运行中... 第 ${count} 秒`)
    yield* Effect.sleep(Duration.seconds(1))
  }
})

// 超时 3 秒后自动中断
const program1 = infiniteTask.pipe(
  Effect.timeout(Duration.seconds(3)),
)

Effect.runPromise(program1).then(
  (result) => console.log("结果:", result),
  (err) => console.log("超时中断:", err.message),
)

// ============================================================
// 2. Effect.onInterrupt — 中断时的清理回调
// ============================================================

console.log("\n=== 2. Effect.onInterrupt — 中断时的清理回调 ===\n")

// 模拟一个需要清理资源的任务（如关闭文件句柄、释放连接）
const taskWithCleanup = Effect.gen(function* () {
  yield* Console.log("  [资源] 打开数据库连接...")
  yield* Console.log("  [资源] 开始事务...")

  // 模拟长时间操作
  let progress = 0
  while (progress < 10) {
    progress++
    yield* Console.log(`  [处理] 进度 ${progress}/10`)
    yield* Effect.sleep(Duration.millis(500))
  }

  yield* Console.log("  [资源] 提交事务...")
  return "任务完成"
}).pipe(
  // onInterrupt: 当任务被中断时执行清理
  Effect.onInterrupt(() =>
    Effect.gen(function* () {
      yield* Console.log("  [清理] 回滚事务...")
      yield* Console.log("  [清理] 关闭数据库连接...")
      yield* Console.log("  [清理] 完成")
    })
  ),
)

// 2 秒后中断任务
const program2 = Effect.gen(function* () {
  const fiber = yield* Effect.forkChild(taskWithCleanup)
  yield* Effect.sleep(Duration.seconds(2))
  yield* Console.log("  [主] 超时，中断任务...")
  yield* Fiber.interrupt(fiber)
  return "已中断"
})

Effect.runPromise(program2).then((result) =>
  console.log("结果:", result),
)

// ============================================================
// 3. 检查点模式 — 支持安全中断和进度保存
// ============================================================

console.log("\n=== 3. 检查点模式 — 支持安全中断和进度保存 ===\n")

// 检查点函数：在长任务的关键步骤插入
// 使用 Effect.interruptible 使检查点区域可被中断
// 当 Fiber 被中断时，interruptible 区域会抛出 Interrupt
const withCheckpoint = <A, E, R>(
  task: Effect.Effect<A, E, R>,
  label: string,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    yield* Console.log(`  [检查点] ${label}`)
    // 使任务可中断，这样 Fiber 中断时可以在此处退出
    const result = yield* task.pipe(Effect.interruptible)
    return result
  })

// 模拟一个带检查点的长任务
const longTaskWithCheckpoints = Effect.gen(function* () {
  yield* Console.log("  [任务] 开始大数据处理")

  // 阶段 1: 数据加载
  yield* withCheckpoint(
    Effect.gen(function* () {
      yield* Console.log("  [阶段1] 加载 10000 条记录...")
      yield* Effect.sleep(Duration.millis(800))
      yield* Console.log("  [阶段1] 加载完成")
    }),
    "数据加载完成",
  )

  // 阶段 2: 数据转换
  yield* withCheckpoint(
    Effect.gen(function* () {
      yield* Console.log("  [阶段2] 转换数据格式...")
      yield* Effect.sleep(Duration.millis(800))
      yield* Console.log("  [阶段2] 转换完成")
    }),
    "数据转换完成",
  )

  // 阶段 3: 数据聚合
  yield* withCheckpoint(
    Effect.gen(function* () {
      yield* Console.log("  [阶段3] 聚合计算...")
      yield* Effect.sleep(Duration.millis(800))
      yield* Console.log("  [阶段3] 聚合完成")
    }),
    "数据聚合完成",
  )

  // 阶段 4: 数据导出
  yield* withCheckpoint(
    Effect.gen(function* () {
      yield* Console.log("  [阶段4] 导出结果...")
      yield* Effect.sleep(Duration.millis(800))
      yield* Console.log("  [阶段4] 导出完成")
    }),
    "数据导出完成",
  )

  return "大数据处理完成"
}).pipe(
  Effect.onInterrupt(() =>
    Console.log("  [清理] 保存已完成的阶段进度到持久存储")
  ),
)

// 在阶段 2 完成后中断任务
const program3 = Effect.gen(function* () {
  const fiber = yield* Effect.forkChild(longTaskWithCheckpoints)
  yield* Effect.sleep(Duration.millis(1500)) // 在阶段 2 完成后中断
  yield* Console.log("  [主] 用户取消操作，请求中断...")
  yield* Fiber.interrupt(fiber)
  return "任务已取消，进度已保存"
})

Effect.runPromise(program3).then((result) =>
  console.log("结果:", result),
)

console.log("\n✅ 01-long-running-task.ts 运行完成")
