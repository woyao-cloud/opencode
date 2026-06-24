/**
 * 01-queue-types.ts — Queue 类型：bounded / unbounded / sliding / dropping
 *
 * Effect-TS 提供了四种 Queue 类型，每种有不同的背压策略：
 * - bounded: 有界队列，满时生产者挂起（suspend）
 * - unbounded: 无界队列，永不阻塞生产者
 * - sliding: 滑动队列，满时丢弃最旧元素
 * - dropping: 丢弃队列，满时丢弃新元素，offer 返回 false
 *
 * 运行: bun run src/01-queue-types.ts
 */
import { Effect, Queue, Console } from "effect"

// ============================================================
// 1. bounded — 有界队列（背压策略）
// ============================================================

const demoBounded = Effect.gen(function* () {
  Console.log("=== 1. bounded — 有界队列（容量 3）===")

  // Queue.bounded<A>(capacity) — 创建有界队列
  const queue = yield* Queue.bounded<number>(3)

  // 前 3 个 offer 立即成功
  const r1 = yield* Queue.offer(queue, 1)
  const r2 = yield* Queue.offer(queue, 2)
  const r3 = yield* Queue.offer(queue, 3)
  Console.log(`offer 1, 2, 3: ${r1}, ${r2}, ${r3}`)

  const size = yield* Queue.size(queue)
  Console.log(`当前大小: ${size}`)

  const isFull = yield* Queue.isFull(queue)
  Console.log(`队列已满: ${isFull}`)

  // 取出元素释放空间
  const taken = yield* Queue.takeAll(queue)
  Console.log(`取出所有元素: [${taken}]`)
})

// ============================================================
// 2. unbounded — 无界队列（永不阻塞）
// ============================================================

const demoUnbounded = Effect.gen(function* () {
  Console.log("\n=== 2. unbounded — 无界队列 ===")

  // Queue.unbounded<A>() — 创建无界队列
  const queue = yield* Queue.unbounded<string>()

  // 可以无限添加，永不阻塞
  yield* Queue.offerAll(queue, ["a", "b", "c", "d", "e", "f", "g", "h"])

  const size = yield* Queue.size(queue)
  Console.log(`添加 8 个元素后大小: ${size}`)

  const isFull = yield* Queue.isFull(queue)
  Console.log(`无界队列永远不满: ${isFull}`)

  const all = yield* Queue.takeAll(queue)
  Console.log(`取出所有元素: [${all}]`)
})

// ============================================================
// 3. sliding — 滑动队列（满时丢弃最旧元素）
// ============================================================

const demoSliding = Effect.gen(function* () {
  Console.log("\n=== 3. sliding — 滑动队列（容量 3）===")

  // Queue.sliding<A>(capacity) — 创建滑动队列
  const queue = yield* Queue.sliding<number>(3)

  // 填满队列
  yield* Queue.offerAll(queue, [1, 2, 3])
  Console.log("填满队列: [1, 2, 3]")

  // 再添加 4 — 最旧的 1 被丢弃，2, 3 保留
  const success = yield* Queue.offer(queue, 4)
  Console.log(`offer(4) 成功: ${success}`)

  const all = yield* Queue.takeAll(queue)
  Console.log(`取出所有元素: [${all}]（预期 [2, 3, 4]）`)
})

// ============================================================
// 4. dropping — 丢弃队列（满时丢弃新元素）
// ============================================================

const demoDropping = Effect.gen(function* () {
  Console.log("\n=== 4. dropping — 丢弃队列（容量 2）===")

  // Queue.dropping<A>(capacity) — 创建丢弃队列
  const queue = yield* Queue.dropping<number>(2)

  // 填满队列
  const s1 = yield* Queue.offer(queue, 1)
  const s2 = yield* Queue.offer(queue, 2)
  Console.log(`offer(1): ${s1}, offer(2): ${s2}`)

  // 队列已满，新元素被丢弃，offer 返回 false
  const s3 = yield* Queue.offer(queue, 3)
  Console.log(`offer(3): ${s3}（预期 false — 元素被丢弃）`)

  const all = yield* Queue.takeAll(queue)
  Console.log(`取出所有元素: [${all}]（预期 [1, 2] — 3 被丢弃）`)
})

// ============================================================
// 5. Queue.make — 通用构造器
// ============================================================

const demoMake = Effect.gen(function* () {
  Console.log("\n=== 5. Queue.make — 通用构造器 ===")

  // Queue.make 通过 options 指定 capacity 和 strategy
  const suspendQueue = yield* Queue.make<number>({
    capacity: 5,
    strategy: "suspend",
  })
  Console.log(`suspend 队列容量: ${suspendQueue.capacity}`)

  const slidingQueue = yield* Queue.make<number>({
    capacity: 3,
    strategy: "sliding",
  })
  Console.log(`sliding 队列容量: ${slidingQueue.capacity}`)

  const droppingQueue = yield* Queue.make<number>({
    capacity: 3,
    strategy: "dropping",
  })
  Console.log(`dropping 队列容量: ${droppingQueue.capacity}`)

  // 不指定 capacity 时为无界队列
  const unboundedQueue = yield* Queue.make<number>()
  Console.log(`无界队列容量: ${unboundedQueue.capacity}`)
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoBounded
  yield* demoUnbounded
  yield* demoSliding
  yield* demoDropping
  yield* demoMake
  Console.log("\n✅ 01-queue-types.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()
