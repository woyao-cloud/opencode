/**
 * 02-transform.ts — Stream 转换操作
 *
 * 演示 Stream 的核心转换操作：
 * - map: 同步映射
 * - filter: 过滤
 * - tap: 副作用窥视
 * - mapEffect: 异步映射
 * - take: 取前 N 个
 * - drop: 丢弃前 N 个
 * - changes: 去重连续重复
 *
 * 运行: bun run src/02-transform.ts
 */
import { Effect, Stream } from "effect"

const log = (...args: ReadonlyArray<any>) => Effect.sync(() => console.log(...args))

// ============================================================
// 1. Stream.map — 同步映射
// ============================================================

const demoMap = Effect.gen(function* () {
  yield* log("=== 1. Stream.map — 同步映射 ===")

  const stream = Stream.fromIterable([1, 2, 3, 4, 5]).pipe(
    Stream.map((n) => n * 10),
  )

  const result = yield* Stream.runCollect(stream)
  yield* log(`  map(n => n * 10): [${result}]`)
})

// ============================================================
// 2. Stream.filter — 过滤
// ============================================================

const demoFilter = Effect.gen(function* () {
  yield* log("\n=== 2. Stream.filter — 过滤 ===")

  const stream = Stream.fromIterable([1, 2, 3, 4, 5, 6]).pipe(
    Stream.filter((n) => n % 2 === 0),
  )

  const result = yield* Stream.runCollect(stream)
  yield* log(`  filter(偶数): [${result}]`)
})

// ============================================================
// 3. Stream.tap — 副作用窥视（不改变元素）
// ============================================================

const demoTap = Effect.gen(function* () {
  yield* log("\n=== 3. Stream.tap — 副作用窥视 ===")

  const stream = Stream.fromIterable(["a", "b", "c"]).pipe(
    Stream.tap((s) => log(`  tap 窥视: 处理元素 "${s}"`)),
    Stream.map((s) => s.toUpperCase()),
  )

  const result = yield* Stream.runCollect(stream)
  yield* log(`  map 后结果: [${result}]`)
})

// ============================================================
// 4. Stream.mapEffect — 异步映射
// ============================================================

const demoMapEffect = Effect.gen(function* () {
  yield* log("\n=== 4. Stream.mapEffect — 异步映射 ===")

  // 模拟异步操作
  const asyncDouble = (n: number) => Effect.succeed(n * 2).pipe(Effect.delay("50 millis"))

  const stream = Stream.fromIterable([1, 2, 3]).pipe(
    Stream.mapEffect(asyncDouble),
  )

  const result = yield* Stream.runCollect(stream)
  yield* log(`  mapEffect(asyncDouble): [${result}]`)
})

// ============================================================
// 5. Stream.take — 取前 N 个元素
// ============================================================

const demoTake = Effect.gen(function* () {
  yield* log("\n=== 5. Stream.take — 取前 N 个 ===")

  const stream = Stream.fromIterable([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).pipe(
    Stream.take(4),
  )

  const result = yield* Stream.runCollect(stream)
  yield* log(`  take(4): [${result}]`)
})

// ============================================================
// 6. Stream.drop — 丢弃前 N 个元素
// ============================================================

const demoDrop = Effect.gen(function* () {
  yield* log("\n=== 6. Stream.drop — 丢弃前 N 个 ===")

  const stream = Stream.fromIterable([1, 2, 3, 4, 5]).pipe(
    Stream.drop(2),
  )

  const result = yield* Stream.runCollect(stream)
  yield* log(`  drop(2): [${result}]`)
})

// ============================================================
// 7. Stream.changes — 去重连续重复
// ============================================================

const demoChanges = Effect.gen(function* () {
  yield* log("\n=== 7. Stream.changes — 去重连续重复 ===")

  // 连续重复的元素会被过滤，只保留变化
  const stream = Stream.fromIterable([1, 1, 2, 2, 2, 3, 1, 1, 4]).pipe(
    Stream.changes,
  )

  const result = yield* Stream.runCollect(stream)
  yield* log(`  changes: [${result}]（预期 [1, 2, 3, 1, 4]）`)
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoMap
  yield* demoFilter
  yield* demoTap
  yield* demoMapEffect
  yield* demoTake
  yield* demoDrop
  yield* demoChanges
  yield* log("\n✅ 02-transform.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()
