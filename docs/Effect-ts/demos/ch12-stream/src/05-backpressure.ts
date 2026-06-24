/**
 * 05-backpressure.ts — Stream 背压机制
 *
 * 演示 Stream 的背压（backpressure）机制：
 * - pull-based 模型：消费者驱动，按需拉取
 * - buffer: 缓冲策略，允许生产者超前
 * - throttle: 限流，控制发射速率
 * - 生产者 vs 消费者速率：展示背压如何自然协调
 *
 * 运行: bun run src/05-backpressure.ts
 */
import { Effect, Queue, Stream } from "effect"

const log = (...args: ReadonlyArray<any>) => Effect.sync(() => console.log(...args))

// ============================================================
// 1. pull-based 模型 — 消费者驱动
// ============================================================

const demoPullBased = Effect.gen(function* () {
  yield* log("=== 1. pull-based 模型 — 消费者驱动 ===")

  // 创建一个有副作用的流，每次拉取时打印日志
  let counter = 0
  const stream = Stream.fromIterable(
    (function* () {
      for (let i = 1; i <= 5; i++) {
        counter++
        console.log(`  生产者生成: ${i}`)
        yield i
      }
    })(),
  )

  // 消费者只取前 3 个 — 生产者不会生成多余元素
  const result = yield* Stream.runCollect(stream.pipe(Stream.take(3)))
  yield* log(`  消费者收到: [${result}]（只消费 3 个，生成器只生成到 3）`)
  yield* log(`  生成器被调用了 ${counter} 次`)
})

// ============================================================
// 2. Stream.buffer — 缓冲策略
// ============================================================

const demoBuffer = Effect.gen(function* () {
  yield* log("\n=== 2. Stream.buffer — 缓冲策略 ===")

  // 创建一个快速生产者流
  const fastProducer = Stream.range(1, 20).pipe(
    Stream.tap((n) => log(`  生产者: ${n}`)),
  )

  // 添加 buffer，允许生产者超前消费者
  const buffered = fastProducer.pipe(
    Stream.buffer({ capacity: 5 }),
    Stream.tap((n) => Effect.sleep("50 millis")), // 慢消费者
    Stream.take(8),
  )

  const result = yield* Stream.runCollect(buffered)
  yield* log(`  消费者收到: [${result}]（buffer 允许生产者超前）`)
})

// ============================================================
// 3. Stream.throttle — 限流
// ============================================================

const demoThrottle = Effect.gen(function* () {
  yield* log("\n=== 3. Stream.throttle — 限流 ===")

  // 创建一个快速流，但用 throttle 限制发射速率
  const stream = Stream.range(1, 10).pipe(
    Stream.throttle({
      cost: (arr: Array<number>) => arr.length,
      units: 1,
      duration: "200 millis",
      burst: 2,
      strategy: "shape",
    }),
    Stream.tap((n) => log(`  限流发射: ${n}`)),
  )

  const result = yield* Stream.runCollect(stream)
  yield* log(`  限流后收集: [${result}]`)
})

// ============================================================
// 4. 生产者 vs 消费者速率 — 背压自然协调
// ============================================================

const demoRateMismatch = Effect.gen(function* () {
  yield* log("\n=== 4. 生产者 vs 消费者速率 — 背压协调 ===")

  // 创建队列，展示背压效果
  const queue = yield* Queue.bounded<number>(3)

  // 快速生产者 Fiber
  yield* Effect.forkScoped(
    Effect.gen(function* () {
      for (let i = 1; i <= 10; i++) {
        yield* log(`  生产者 offer: ${i}`)
        yield* Queue.offer(queue, i)
        // 生产者很快，没有延迟
      }
      yield* log("  生产者完成")
      yield* Queue.end(queue)
    }),
  )

  // 慢消费者 — 从 Queue 创建 Stream
  const stream = Stream.fromQueue(queue).pipe(
    Stream.tap((n) => Effect.sleep("200 millis")), // 慢消费
    Stream.tap((n) => log(`  消费者 take: ${n}`)),
  )

  yield* Stream.runDrain(stream)
  yield* log("  消费者完成 — 背压自然协调了速率差异")
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.scoped(
  Effect.gen(function* () {
    yield* demoPullBased
    yield* demoBuffer
    yield* demoThrottle
    yield* demoRateMismatch
    yield* log("\n✅ 05-backpressure.ts 运行完成")
  }),
)

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()
