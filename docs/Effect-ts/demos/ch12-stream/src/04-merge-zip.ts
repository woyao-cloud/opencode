/**
 * 04-merge-zip.ts — Stream 合并与分流
 *
 * 演示 Stream 的组合操作：
 * - merge: 合并两个流（交错发射）
 * - zip: 按位置配对
 * - concat: 串联两个流
 * - broadcast: 广播到多个消费者
 * - groupBy: 按键分组
 *
 * 运行: bun run src/04-merge-zip.ts
 */
import { Effect, Fiber, Stream } from "effect"

const log = (...args: ReadonlyArray<any>) => Effect.sync(() => console.log(...args))

// ============================================================
// 1. Stream.merge — 合并两个流（交错发射）
// ============================================================

const demoMerge = Effect.gen(function* () {
  yield* log("=== 1. Stream.merge — 合并两个流 ===")

  const stream1 = Stream.fromIterable([1, 2, 3]).pipe(
    Stream.tap((n) => Effect.sleep(`${n * 50} millis`)),
  )
  const stream2 = Stream.fromIterable([10, 20, 30]).pipe(
    Stream.tap((n) => Effect.sleep(`${n * 10} millis`)),
  )

  // merge 将两个流交错合并为一个流
  const merged = Stream.merge(stream1, stream2)

  const result = yield* Stream.runCollect(merged)
  yield* log(`  merge: [${result}]`)
})

// ============================================================
// 2. Stream.zip — 按位置配对
// ============================================================

const demoZip = Effect.gen(function* () {
  yield* log("\n=== 2. Stream.zip — 按位置配对 ===")

  const stream1 = Stream.fromIterable(["a", "b", "c"])
  const stream2 = Stream.fromIterable([1, 2, 3])

  // zip 将两个流按位置配对，任一结束则结束
  const zipped = Stream.zip(stream1, stream2)

  const result = yield* Stream.runCollect(zipped)
  yield* log(`  zip: [${result}]`)
})

// ============================================================
// 3. Stream.concat — 串联两个流
// ============================================================

const demoConcat = Effect.gen(function* () {
  yield* log("\n=== 3. Stream.concat — 串联两个流 ===")

  const first = Stream.fromIterable([1, 2, 3])
  const second = Stream.fromIterable([4, 5, 6])

  // concat 先发射第一个流的所有元素，再发射第二个流
  const concatenated = Stream.concat(first, second)

  const result = yield* Stream.runCollect(concatenated)
  yield* log(`  concat: [${result}]（预期 [1, 2, 3, 4, 5, 6]）`)
})

// ============================================================
// 4. Stream.broadcast — 广播到多个消费者
// ============================================================

const demoBroadcast = Effect.gen(function* () {
  yield* log("\n=== 4. Stream.broadcast — 广播 ===")

  // broadcast 返回一个 scoped Stream，所有订阅者都收到相同元素
  const broadcasted = yield* Stream.broadcast(
    Stream.fromArray([1, 2, 3]),
    { capacity: 8, replay: 3 },
  )

  // 两个消费者分别收集
  const c1 = yield* Effect.forkScoped(
    Stream.runCollect(broadcasted.pipe(Stream.map((n) => n * 10))),
  )
  const c2 = yield* Effect.forkScoped(
    Stream.runCollect(broadcasted.pipe(Stream.map((n) => n * 100))),
  )

  const [r1, r2] = yield* Effect.all([Fiber.join(c1), Fiber.join(c2)])
  yield* log(`  消费者 1 (n*10): [${r1}]`)
  yield* log(`  消费者 2 (n*100): [${r2}]`)
})

// ============================================================
// 5. Stream.groupBy — 按键分组
// ============================================================

const demoGroupBy = Effect.gen(function* () {
  yield* log("\n=== 5. Stream.groupBy — 按键分组 ===")

  const grouped = yield* Stream.fromIterable([1, 2, 3, 4, 5, 6]).pipe(
    Stream.groupBy((n) =>
      Effect.succeed([n % 2 === 0 ? "even" : "odd", n] as const)
    ),
    Stream.mapEffect(
      (entry) =>
        Effect.gen(function* () {
          const [key, stream] = entry
          const values = yield* Stream.runCollect(stream)
          return { key, values } as const
        }),
      { concurrency: "unbounded" },
    ),
    Stream.runCollect,
  )

  for (const { key, values } of grouped) {
    yield* log(`  groupBy("${key}"): [${values}]`)
  }
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.scoped(
  Effect.gen(function* () {
    yield* demoMerge
    yield* demoZip
    yield* demoConcat
    yield* demoBroadcast
    yield* demoGroupBy
    yield* log("\n✅ 04-merge-zip.ts 运行完成")
  }),
)

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()
