/**
 * 04-stream-tuning.ts — Stream 调优：chunk 大小、buffer 大小、吞吐量
 *
 * 性能分析要点：
 * - Stream chunk 大小影响吞吐量：太小→过多操作，太大→内存压力
 * - buffer 大小控制生产-消费速度差异时的内存使用
 * - grouped 批量处理减少下游操作次数
 * - 与普通 Effect.forEach 对比：Stream 更适合无限/大数据流
 *
 * 运行: bun run src/04-stream-tuning.ts
 */
import { Effect, Stream, Chunk, Console, Schedule } from "effect"

// ============================================================
// 工具函数：测量 Stream 处理时间
// ============================================================

const measureStream = (label: string, stream: Stream.Stream<unknown>) =>
  Effect.gen(function* () {
    const start = performance.now()
    const result = yield* Stream.runCollect(stream)
    const elapsed = (performance.now() - start).toFixed(3)
    const count = Chunk.size(result)
    Console.log(`  ${label}: ${elapsed}ms（${count} 个元素）`)
    return result
  })

// ============================================================
// 1. chunk 大小对吞吐量的影响
// ============================================================

const demoSingleItem = Effect.gen(function* () {
  Console.log("=== 1. 逐元素 Stream vs Effect.forEach（100 个 I/O 元素，各 5ms）===")

  const ITEMS = 100
  const data = Array.from({ length: ITEMS }, (_, i) => i)

  // Stream 方式：逐元素处理
  yield* measureStream(
    "Stream 逐元素",
    Stream.fromIterable(data).pipe(
      Stream.mapEffect((id) =>
        Effect.gen(function* () {
          yield* Effect.sleep("5 millis")
          return id * 2
        }),
      ),
    ),
  )

  // Effect.forEach 方式（默认并发）
  const start = performance.now()
  const results = yield* Effect.forEach(data, (id) =>
    Effect.gen(function* () {
      yield* Effect.sleep("5 millis")
      return id * 2
    }),
  )
  Console.log(`  Effect.forEach 并发: ${(performance.now() - start).toFixed(3)}ms（${results.length} 个元素）`)
})

// ============================================================
// 2. Stream grouped — 批量处理减少下游开销
// ============================================================

const demoGrouped = Effect.gen(function* () {
  Console.log("\n=== 2. grouped 批量处理 — 不同 batch 大小对比（100 个元素）===")

  const ITEMS = 100
  const data = Array.from({ length: ITEMS }, (_, i) => i)

  // batch = 1（不批量）
  let batchCount = 0
  yield* measureStream(
    "batch=1（不批量）",
    Stream.fromIterable(data).pipe(
      Stream.mapEffect((id) =>
        Effect.gen(function* () {
          batchCount++
          return id
        }),
      ),
    ),
  )
  Console.log(`    下游执行次数: ${batchCount}`)

  // batch = 10
  let batch10Count = 0
  yield* measureStream(
    "batch=10",
    Stream.fromIterable(data).pipe(
      Stream.grouped(10),
      Stream.mapEffect((chunk) =>
        Effect.gen(function* () {
          batch10Count++
          // 批量处理 Chunk
          return Chunk.map(chunk, (n) => n * 2)
        }),
      ),
      Stream.mapConcat((chunk) => chunk),
    ),
  )
  Console.log(`    下游执行次数: ${batch10Count}（预期 10）`)
})

// ============================================================
// 3. buffer 大小 — 背压控制
// ============================================================

const demoBufferSize = Effect.gen(function* () {
  Console.log("\n=== 3. buffer 大小对吞吐量的影响（100 个元素，生产者快于消费者）===")

  const ITEMS = 100

  const makeStream = (bufferSize: number) =>
    Stream.fromIterable(Array.from({ length: ITEMS }, (_, i) => i)).pipe(
      // 生产者很快（无延迟）
      // 消费者较慢（每元素 2ms）
      Stream.bufferChunks({ capacity: bufferSize }),
      Stream.mapEffect((id) =>
        Effect.gen(function* () {
          yield* Effect.sleep("2 millis")
          return id * 2
        }),
      ),
    )

  yield* measureStream("buffer=1（最小缓冲）", makeStream(1))
  yield* measureStream("buffer=10", makeStream(10))
  yield* measureStream("buffer=100（最大缓冲）", makeStream(100))
})

// ============================================================
// 4. 并发 Stream — mapEffect 并发度
// ============================================================

const demoStreamConcurrency = Effect.gen(function* () {
  Console.log("\n=== 4. Stream 并发度对比（50 个 I/O 元素，各 30ms）===")

  const ITEMS = 50
  const data = Array.from({ length: ITEMS }, (_, i) => i)

  // 顺序
  yield* measureStream(
    "顺序（并发=1）",
    Stream.fromIterable(data).pipe(
      Stream.mapEffect((id) =>
        Effect.gen(function* () {
          yield* Effect.sleep("30 millis")
          return id * 2
        }),
      ),
    ),
  )

  // 并发 5
  yield* measureStream(
    "并发=5",
    Stream.fromIterable(data).pipe(
      Stream.mapEffect(
        (id) =>
          Effect.gen(function* () {
            yield* Effect.sleep("30 millis")
            return id * 2
          }),
        { concurrency: 5 },
      ),
    ),
  )

  // 无限制并发
  yield* measureStream(
    "无限制并发",
    Stream.fromIterable(data).pipe(
      Stream.mapEffect(
        (id) =>
          Effect.gen(function* () {
            yield* Effect.sleep("30 millis")
            return id * 2
          }),
        { concurrency: "unbounded" },
      ),
    ),
  )
})

// ============================================================
// 5. Stream vs 批量 Effect — 大数据集场景
// ============================================================

const demoStreamVsBatch = Effect.gen(function* () {
  Console.log("\n=== 5. Stream vs 批量 Effect（10,000 个元素，纯计算）===")

  const ITEMS = 10_000
  const data = Array.from({ length: ITEMS }, (_, i) => i)

  // Stream 方式
  yield* measureStream(
    "Stream 方式",
    Stream.fromIterable(data).pipe(
      Stream.map((n) => n * 2),
      Stream.filter((n) => n % 3 === 0),
    ),
  )

  // Array 方式
  const start = performance.now()
  const result = data.map((n) => n * 2).filter((n) => n % 3 === 0)
  Console.log(`  Array 方式: ${(performance.now() - start).toFixed(3)}ms（${result.length} 个元素）`)
  Console.log(`  结论: 纯计算场景 Array 更快；Stream 优势在 I/O 和无限流`)
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoSingleItem
  yield* demoGrouped
  yield* demoBufferSize
  yield* demoStreamConcurrency
  yield* demoStreamVsBatch
  Console.log("\n✅ 04-stream-tuning.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()
