/**
 * 03-consume.ts — 消费 Stream 的六种方式
 *
 * 演示 Stream 的终端操作（消费方式）：
 * - runCollect: 收集所有元素到数组
 * - runForEach: 对每个元素执行副作用
 * - runFold: 折叠归约
 * - runHead: 取第一个元素
 * - runCount: 计数
 * - runDrain: 只执行副作用，丢弃结果
 *
 * 运行: bun run src/03-consume.ts
 */
import { Effect, Option, Stream } from "effect"

const log = (...args: ReadonlyArray<any>) => Effect.sync(() => console.log(...args))

// ============================================================
// 1. Stream.runCollect — 收集所有元素
// ============================================================

const demoRunCollect = Effect.gen(function* () {
  yield* log("=== 1. Stream.runCollect — 收集所有元素 ===")

  const stream = Stream.range(1, 5)
  const collected = yield* Stream.runCollect(stream)

  yield* log(`  runCollect: [${collected}]`)
})

// ============================================================
// 2. Stream.runForEach — 对每个元素执行副作用
// ============================================================

const demoRunForEach = Effect.gen(function* () {
  yield* log("\n=== 2. Stream.runForEach — 对每个元素执行副作用 ===")

  const stream = Stream.fromIterable(["A", "B", "C"])

  yield* Stream.runForEach(stream, (letter) =>
    log(`  处理元素: ${letter}`),
  )
})

// ============================================================
// 3. Stream.runFold — 折叠归约
// ============================================================

const demoRunFold = Effect.gen(function* () {
  yield* log("\n=== 3. Stream.runFold — 折叠归约 ===")

  const stream = Stream.fromIterable([1, 2, 3, 4, 5])

  // 从初始值 0 开始，依次累加
  const sum = yield* Stream.runFold(stream, () => 0, (acc, n) => acc + n)
  yield* log(`  runFold(0, acc + n): sum = ${sum}`)
})

// ============================================================
// 4. Stream.runHead — 取第一个元素
// ============================================================

const demoRunHead = Effect.gen(function* () {
  yield* log("\n=== 4. Stream.runHead — 取第一个元素 ===")

  const stream = Stream.fromIterable([100, 200, 300])

  const head = yield* Stream.runHead(stream)
  if (Option.isSome(head)) {
    yield* log(`  runHead: ${head.value}`)
  }
})

// ============================================================
// 5. Stream.runCount — 计数
// ============================================================

const demoRunCount = Effect.gen(function* () {
  yield* log("\n=== 5. Stream.runCount — 计数 ===")

  const stream = Stream.fromIterable(["x", "y", "z", "w"])

  const count = yield* Stream.runCount(stream)
  yield* log(`  runCount: ${count}`)
})

// ============================================================
// 6. Stream.runDrain — 只执行副作用，丢弃结果
// ============================================================

const demoRunDrain = Effect.gen(function* () {
  yield* log("\n=== 6. Stream.runDrain — 只执行副作用 ===")

  const stream = Stream.fromIterable([1, 2, 3]).pipe(
    Stream.tap((n) => log(`  处理 ${n}（结果被丢弃）`)),
  )

  // runDrain 执行所有副作用但丢弃元素值
  yield* Stream.runDrain(stream)
  yield* log("  runDrain 完成 — 所有副作用已执行")
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoRunCollect
  yield* demoRunForEach
  yield* demoRunFold
  yield* demoRunHead
  yield* demoRunCount
  yield* demoRunDrain
  yield* log("\n✅ 03-consume.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()
