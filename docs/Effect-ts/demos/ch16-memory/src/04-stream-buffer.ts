/**
 * 04-stream-buffer.ts — Stream 缓冲内存控制
 *
 * 内存管理要点：
 * - bufferChunks 容量决定内存使用上限（capacity 参数）
 * - grouped 批量大小影响每批内存占用
 * - 背压（backpressure）机制防止生产者溢出消费者
 * - Stream 结束时自动释放内部缓冲区
 * - 使用 Stream.runForEach 在消费完数据后自动清理
 *
 * 运行: bun run src/04-stream-buffer.ts
 */
import { Effect, Console, Stream, Schedule } from "effect"

// ============================================================
// 工具：模拟数据处理与内存追踪
// ============================================================

let allocatedChunks = 0
let releasedChunks = 0

const trackAllocation = Effect.sync(() => {
  allocatedChunks++
})

const trackRelease = Effect.sync(() => {
  releasedChunks++
})

const reportMemory = (label: string) =>
  Effect.sync(() =>
    Console.log(
      `  ${label}: 分配=${allocatedChunks}, 释放=${releasedChunks}, 存活=${allocatedChunks - releasedChunks}`,
    ),
  )

// ============================================================
// 1. bufferChunks 容量对内存的影响
// ============================================================

/**
 * bufferChunks 设置内部缓冲区大小。
 * 容量越大，可缓存的元素越多，内存占用越大。
 * 容量越小，生产者更容易被阻塞。
 */
const demoBufferCapacity = Effect.gen(function* () {
  Console.log("=== 1. bufferChunks 容量对比 ===")

  // 小缓冲区：capacity = 2
  allocatedChunks = 0
  releasedChunks = 0

  const smallStart = performance.now()
  yield* Stream.fromIterable(
    Array.from({ length: 50 }, (_, i) => i),
  ).pipe(
    Stream.bufferChunks({ capacity: 2 }),
    Stream.mapEffect(
      (n) =>
        Effect.gen(function* () {
          yield* trackAllocation
          yield* Effect.sleep("2 millis") // 模拟慢消费
          yield* trackRelease
          return n
        }),
      { concurrency: 1 },
    ),
    Stream.runCollect,
  )
  const smallTime = (performance.now() - smallStart).toFixed(1)

  Console.log(`  小缓冲区 (capacity=2): ${smallTime}ms`)

  // 大缓冲区：capacity = 100
  allocatedChunks = 0
  releasedChunks = 0

  const largeStart = performance.now()
  yield* Stream.fromIterable(
    Array.from({ length: 50 }, (_, i) => i),
  ).pipe(
    Stream.bufferChunks({ capacity: 100 }),
    Stream.mapEffect(
      (n) =>
        Effect.gen(function* () {
          yield* trackAllocation
          yield* Effect.sleep("2 millis")
          yield* trackRelease
          return n
        }),
      { concurrency: 1 },
    ),
    Stream.runCollect,
  )
  const largeTime = (performance.now() - largeStart).toFixed(1)

  Console.log(`  大缓冲区 (capacity=100): ${largeTime}ms`)
  Console.log("  说明: 小缓冲区控制内存但可能降低吞吐，大缓冲区反之")
})

// ============================================================
// 2. grouped 批量大小与内存
// ============================================================

/**
 * Stream.grouped(n) 将 n 个元素合并为一个 Chunk。
 * 批量越大，单次处理的内存占用越大，但函数调用次数越少。
 */
const demoGroupedBatch = Effect.gen(function* () {
  Console.log("\n=== 2. grouped 批量大小 ===")

  const totalElements = 100

  // 小批量：grouped(5)
  const smallBatchStart = performance.now()
  const smallResult = yield* Stream.fromIterable(
    Array.from({ length: totalElements }, (_, i) => i),
  ).pipe(
    Stream.grouped(5),
    Stream.mapEffect(
      (chunk) =>
        Effect.gen(function* () {
          // chunk 是 Chunk<number>，大小约 5
          yield* Effect.sleep("1 milli")
          return chunk
        }),
      { concurrency: 1 },
    ),
    Stream.runCollect,
  )
  const smallTime = (performance.now() - smallBatchStart).toFixed(1)

  // 大批量：grouped(50)
  const largeBatchStart = performance.now()
  const largeResult = yield* Stream.fromIterable(
    Array.from({ length: totalElements }, (_, i) => i),
  ).pipe(
    Stream.grouped(50),
    Stream.mapEffect(
      (chunk) =>
        Effect.gen(function* () {
          yield* Effect.sleep("1 milli")
          return chunk
        }),
      { concurrency: 1 },
    ),
    Stream.runCollect,
  )
  const largeTime = (performance.now() - largeBatchStart).toFixed(1)

  Console.log(`  grouped(5)  × ${totalElements} 元素: ${smallTime}ms, 批次数=${smallResult.length}`)
  Console.log(`  grouped(50) × ${totalElements} 元素: ${largeTime}ms, 批次数=${largeResult.length}`)
  Console.log("  说明: 大批量减少函数调用但增加单批内存占用")
})

// ============================================================
// 3. 背压（Backpressure）内存控制
// ============================================================

/**
 * 当生产者快于消费者时，Stream 的背压机制限制缓冲区增长。
 * 没有背压控制的话，缓冲区可能无限增长导致 OOM。
 */
const demoBackpressure = Effect.gen(function* () {
  Console.log("\n=== 3. 背压内存控制 ===")

  // 模拟快速生产 + 慢速消费
  const fastProducer = Stream.fromIterable(
    Array.from({ length: 30 }, (_, i) => i),
  )

  const start = performance.now()
  yield* fastProducer.pipe(
    // 限制缓冲区为 5 个元素
    Stream.bufferChunks({ capacity: 5 }),
    Stream.mapEffect(
      (n) =>
        Effect.gen(function* () {
          Console.log(`  处理元素 ${n}（缓冲区最多 5 个待处理）`)
          yield* Effect.sleep("3 millis") // 慢消费
          return n
        }),
      { concurrency: 1 },
    ),
    Stream.runForEach((n) => Effect.sync(() => {})),
  )
  const elapsed = (performance.now() - start).toFixed(1)

  Console.log(`  总耗时: ${elapsed}ms`)
  Console.log("  说明: bufferChunks 限制内存，背压确保生产者不溢出")
})

// ============================================================
// 4. Stream 生命周期 — 自动释放
// ============================================================

/**
 * Stream.runCollect / runForEach 完成后自动清理内部缓冲区。
 * 不需要手动释放内存。
 */
const demoStreamLifecycle = Effect.gen(function* () {
  Console.log("\n=== 4. Stream 生命周期自动释放 ===")
  allocatedChunks = 0
  releasedChunks = 0

  // 模拟带资源的 Stream
  const stream = Stream.fromIterable([1, 2, 3, 4, 5]).pipe(
    Stream.mapEffect((n) =>
      Effect.gen(function* () {
        yield* trackAllocation
        yield* Effect.sleep("1 milli")
        yield* trackRelease
        return n * 10
      }),
    ),
  )

  yield* reportMemory("Stream 创建后（未消费）")

  // 消费 Stream
  const results = yield* stream.pipe(Stream.runCollect)

  yield* reportMemory("Stream 消费完成后")

  Console.log(`  结果: ${Array.from(results).join(", ")}`)
  Console.log("  说明: Stream 消费完成后内部缓冲区自动释放")
})

// ============================================================
// 5. 大容量 Stream 的分批处理策略
// ============================================================

/**
 * 对于大数据集，使用 Stream + grouped + concurrency 的组合策略。
 * 通过控制并发度和批量大小，平衡吞吐量和内存。
 */
const demoBatchStrategy = Effect.gen(function* () {
  Console.log("\n=== 5. 大容量 Stream 分批处理策略 ===")

  const datasetSize = 50
  const dataset = Array.from({ length: datasetSize }, (_, i) => i)

  // 策略 A：逐元素、无限并发 — 内存可能爆炸
  const startA = performance.now()
  yield* Stream.fromIterable(dataset).pipe(
    Stream.mapEffect(
      (n) =>
        Effect.gen(function* () {
          yield* Effect.sleep("2 millis")
          return n * 2
        }),
      { concurrency: "unbounded" },
    ),
    Stream.runCollect,
  )
  const timeA = (performance.now() - startA).toFixed(1)

  // 策略 B：分批、限制并发 — 内存可控
  const startB = performance.now()
  yield* Stream.fromIterable(dataset).pipe(
    Stream.grouped(10), // 每批 10 个
    Stream.mapEffect(
      (chunk) =>
        Effect.gen(function* () {
          yield* Effect.sleep("2 millis")
          return chunk
        }),
      { concurrency: 3 }, // 最多 3 批并发
    ),
    Stream.runCollect,
  )
  const timeB = (performance.now() - startB).toFixed(1)

  Console.log(`  策略 A (逐元素, 无限制并发): ${timeA}ms`)
  Console.log(`  策略 B (grouped=10, concurrency=3): ${timeB}ms`)
  Console.log(`  内存对比: A 最多 ${datasetSize} 个并发, B 最多 ${10 * 3} = 30 个元素在内存`)
  Console.log("  说明: 分批 + 限制并发可在保持吞吐的同时控制内存")
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoBufferCapacity
  yield* demoGroupedBatch
  yield* demoBackpressure
  yield* demoStreamLifecycle
  yield* demoBatchStrategy
  Console.log("\n✅ 04-stream-buffer.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()
