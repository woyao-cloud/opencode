/**
 * 01-create-stream.ts — 创建 Stream 的五种方式
 *
 * Stream 是 Effect-TS 中处理多值异步数据流的核心抽象。
 * 本示例演示五种创建 Stream 的方法：
 * - fromIterable: 从可迭代对象创建
 * - fromEffect: 从 Effect 创建（单值）
 * - fromQueue: 从 Queue 创建（流式数据）
 * - make + repeat: 重复发射固定值
 * - range: 整数范围
 *
 * 运行: bun run src/01-create-stream.ts
 */
import { Effect, Queue, Schedule, Stream } from "effect"

const log = (...args: ReadonlyArray<any>) => Effect.sync(() => console.log(...args))

// ============================================================
// 1. Stream.fromIterable — 从可迭代对象创建
// ============================================================

const demoFromIterable = Effect.gen(function* () {
  yield* log("=== 1. Stream.fromIterable — 从数组创建 ===")

  // 从数组创建 Stream，逐个发射元素
  const stream = Stream.fromIterable([10, 20, 30, 40, 50])

  // 消费 Stream：对每个元素执行副作用
  yield* Stream.runForEach(stream, (n) => log(`  fromIterable: ${n}`))
})

// ============================================================
// 2. Stream.fromEffect — 从 Effect 创建（单值流）
// ============================================================

const demoFromEffect = Effect.gen(function* () {
  yield* log("\n=== 2. Stream.fromEffect — 从 Effect 创建 ===")

  // 从 Effect 创建 Stream，发射 Effect 的返回值
  const stream = Stream.fromEffect(Effect.succeed("Hello from Effect!"))

  yield* Stream.runForEach(stream, (msg) => log(`  ${msg}`))
})

// ============================================================
// 3. Stream.fromQueue — 从 Queue 创建（流式数据）
// ============================================================

const demoFromQueue = Effect.gen(function* () {
  yield* log("\n=== 3. Stream.fromQueue — 从 Queue 创建 ===")

  // 创建有界队列
  const queue = yield* Queue.bounded<number>(5)

  // 启动 Fiber 向队列写入数据
  yield* Effect.forkScoped(
    Effect.gen(function* () {
      for (const n of [1, 2, 3, 4, 5]) {
        yield* Queue.offer(queue, n)
        yield* Effect.sleep("100 millis")
      }
      // 标记队列结束
      yield* Queue.end(queue)
    }),
  )

  // 从 Queue 创建 Stream，自动消费队列数据
  const stream = Stream.fromQueue(queue)

  // 收集所有元素
  const collected = yield* Stream.runCollect(stream)
  yield* log(`  fromQueue 收集: [${collected}]`)
})

// ============================================================
// 4. Stream.make + Stream.repeat — 重复发射固定值
// ============================================================

const demoRepeat = Effect.gen(function* () {
  yield* log("\n=== 4. Stream.make + Stream.repeat — 重复发射 ===")

  // make 创建单值流，repeat 按 Schedule 重复
  const stream = Stream.make("tick").pipe(
    Stream.repeat(Schedule.spaced("200 millis")),
    Stream.take(3), // 只取前 3 个
  )

  yield* Stream.runForEach(stream, (msg) => log(`  ${msg}`))
})

// ============================================================
// 5. Stream.range — 整数范围
// ============================================================

const demoRange = Effect.gen(function* () {
  yield* log("\n=== 5. Stream.range — 整数范围 ===")

  // range(min, max) 发射 [min, max] 闭区间内的整数
  const stream = Stream.range(1, 8)

  const collected = yield* Stream.runCollect(stream)
  yield* log(`  range(1, 8): [${collected}]`)
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.scoped(
  Effect.gen(function* () {
    yield* demoFromIterable
    yield* demoFromEffect
    yield* demoFromQueue
    yield* demoRepeat
    yield* demoRange
    yield* log("\n✅ 01-create-stream.ts 运行完成")
  }),
)

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()
