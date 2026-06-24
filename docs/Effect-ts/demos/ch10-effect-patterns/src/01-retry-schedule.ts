/**
 * 01-retry-schedule.ts — 重试与调度策略
 *
 * 演示 Effect-TS 的重试机制和 Schedule 组合器：
 * - Effect.retry({times: n}) — 简单重试指定次数
 * - Effect.retry + Schedule.recurs — 显式调度重试
 * - Schedule.recurs(1) — 只重试一次
 * - Schedule.exponential — 指数退避
 * - Schedule.spaced — 固定间隔
 * - Schedule.jittered — 抖动（在间隔上添加随机偏移）
 *
 * 运行: bun run src/01-retry-schedule.ts
 */

import { Effect, Schedule, Duration } from "effect"

// ============================================================
// 1. Effect.retry({times: n}) — 简单重试指定次数
// ============================================================

console.log("=== 1. Effect.retry({times: n}) — 简单重试 ===\n")

let attempt1 = 0

const unstable1 = Effect.gen(function* () {
  attempt1++
  if (attempt1 < 3) {
    return yield* Effect.fail(new Error(`第 ${attempt1} 次失败`))
  }
  return `第 ${attempt1} 次成功`
})

// retry({times: 5}) 是最简洁的重试方式：最多重试 5 次
const program1 = unstable1.pipe(
  Effect.retry({ times: 5 }),
)

Effect.runPromise(program1).then(
  (result) => console.log("retry({times:5}) 结果:", result),
  (err) => console.log("retry({times:5}) 失败:", err.message),
)

// ============================================================
// 2. Effect.retry + Schedule.recurs — 显式调度重试
// ============================================================

console.log("\n=== 2. Effect.retry + Schedule.recurs — 显式调度 ===\n")

let attempt2 = 0

const unstable2 = Effect.gen(function* () {
  attempt2++
  if (attempt2 < 4) {
    return yield* Effect.fail(new Error(`第 ${attempt2} 次失败`))
  }
  return `第 ${attempt2} 次成功`
})

// Schedule.recurs(3) 创建一个最多重试 3 次的计划
const program2 = unstable2.pipe(
  Effect.retry(Schedule.recurs(3)),
)

Effect.runPromise(program2).then(
  (result) => console.log("Schedule.recurs(3) 结果:", result),
  (err) => console.log("Schedule.recurs(3) 失败:", err.message),
)

// ============================================================
// 3. Schedule.recurs(1) — 只重试一次
// ============================================================

console.log("\n=== 3. Schedule.recurs(1) — 只重试一次 ===\n")

let attempt3 = 0

const unstable3 = Effect.gen(function* () {
  attempt3++
  if (attempt3 < 2) {
    return yield* Effect.fail(new Error(`第 ${attempt3} 次失败`))
  }
  return `第 ${attempt3} 次成功`
})

// recurs(1) 等价于"只重试一次"
const program3 = unstable3.pipe(
  Effect.retry(Schedule.recurs(1)),
)

Effect.runPromise(program3).then(
  (result) => console.log("Schedule.recurs(1) 结果:", result),
  (err) => console.log("Schedule.recurs(1) 失败:", err.message),
)

// ============================================================
// 4. Schedule.exponential — 指数退避
// ============================================================

console.log("\n=== 4. Schedule.exponential — 指数退避 ===\n")

let attempt4 = 0

const unstable4 = Effect.gen(function* () {
  attempt4++
  if (attempt4 < 4) {
    return yield* Effect.fail(new Error(`第 ${attempt4} 次失败`))
  }
  return `第 ${attempt4} 次成功`
})

// exponential(100ms): 第 1 次重试等 100ms, 第 2 次 200ms, 第 3 次 400ms...
// andThen(recurs(3)): 限制最多 3 次重试
const program4 = unstable4.pipe(
  Effect.retry(
    Schedule.exponential(Duration.millis(100)).pipe(
      Schedule.andThen(Schedule.recurs(3)),
    ),
  ),
)

const start4 = Date.now()
Effect.runPromise(program4).then((result) => {
  const elapsed = Date.now() - start4
  console.log("指数退避结果:", result)
  console.log(`耗时: ${elapsed}ms（含退避等待）`)
})

// ============================================================
// 5. Schedule.spaced — 固定间隔重试
// ============================================================

console.log("\n=== 5. Schedule.spaced — 固定间隔重试 ===\n")

let attempt5 = 0

const unstable5 = Effect.gen(function* () {
  attempt5++
  if (attempt5 < 3) {
    return yield* Effect.fail(new Error(`第 ${attempt5} 次失败`))
  }
  return `第 ${attempt5} 次成功`
})

// spaced(50ms): 每次重试之间固定等待 50ms
const program5 = unstable5.pipe(
  Effect.retry(
    Schedule.spaced(Duration.millis(50)).pipe(
      Schedule.andThen(Schedule.recurs(3)),
    ),
  ),
)

const start5 = Date.now()
Effect.runPromise(program5).then((result) => {
  const elapsed = Date.now() - start5
  console.log("固定间隔结果:", result)
  console.log(`耗时: ${elapsed}ms（含固定间隔等待）`)
})

// ============================================================
// 6. Schedule.jittered — 抖动（在间隔上添加随机偏移）
// ============================================================

console.log("\n=== 6. Schedule.jittered — 抖动 ===\n")

let attempt6 = 0

const unstable6 = Effect.gen(function* () {
  attempt6++
  if (attempt6 < 3) {
    return yield* Effect.fail(new Error(`第 ${attempt6} 次失败`))
  }
  return `第 ${attempt6} 次成功`
})

// jittered: 在指数退避的基础上添加随机抖动，避免"惊群效应"
const program6 = unstable6.pipe(
  Effect.retry(
    Schedule.exponential(Duration.millis(50)).pipe(
      Schedule.jittered,
      Schedule.andThen(Schedule.recurs(3)),
    ),
  ),
)

const start6 = Date.now()
Effect.runPromise(program6).then((result) => {
  const elapsed = Date.now() - start6
  console.log("抖动退避结果:", result)
  console.log(`耗时: ${elapsed}ms（含抖动退避等待）`)
})

// ============================================================
// 7. 组合调度策略 — 指数退避 + 抖动 + 最大重试次数
// ============================================================

console.log("\n=== 7. 组合调度策略 ===\n")

let attempt7 = 0

const unstable7 = Effect.gen(function* () {
  attempt7++
  if (attempt7 < 5) {
    return yield* Effect.fail(new Error(`第 ${attempt7} 次失败`))
  }
  return `第 ${attempt7} 次成功`
})

// 组合: 指数退避(10ms) + 抖动 + 最多 5 次
const program7 = unstable7.pipe(
  Effect.retry(
    Schedule.exponential(Duration.millis(10)).pipe(
      Schedule.jittered,
      Schedule.andThen(Schedule.recurs(5)),
    ),
  ),
)

const start7 = Date.now()
Effect.runPromise(program7).then((result) => {
  const elapsed = Date.now() - start7
  console.log("组合调度结果:", result)
  console.log(`耗时: ${elapsed}ms`)
})

console.log("\n✅ 01-retry-schedule.ts 运行完成")
