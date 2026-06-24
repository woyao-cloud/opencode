/**
 * 02-queue-ops.ts — Queue 操作：offer / take / takeAll / poll / capacity / size
 *
 * Queue 提供丰富的读写操作：
 * - offer / offerAll: 向队列添加元素
 * - take / takeAll / takeN / takeBetween: 从队列取出元素
 * - poll: 非阻塞尝试取出
 * - peek: 查看但不移除
 * - size / isFull: 状态查询
 * - end / fail / shutdown: 队列生命周期
 *
 * 运行: bun run src/02-queue-ops.ts
 */
import { Effect, Queue, Console, Option, Cause } from "effect"

// ============================================================
// 1. offer / offerAll — 添加元素
// ============================================================

const demoOffering = Effect.gen(function* () {
  Console.log("=== 1. offer / offerAll ===")

  const queue = yield* Queue.bounded<number>(5)

  // offer: 添加单个元素，返回 boolean
  const ok1 = yield* Queue.offer(queue, 100)
  const ok2 = yield* Queue.offer(queue, 200)
  Console.log(`offer(100): ${ok1}, offer(200): ${ok2}`)

  // offerAll: 批量添加，返回未能添加的剩余元素
  const remaining = yield* Queue.offerAll(queue, [300, 400, 500, 600, 700])
  Console.log(`offerAll([300..700]) 剩余: [${remaining}]（容量 5，只能放 3 个）`)

  const size = yield* Queue.size(queue)
  Console.log(`当前大小: ${size}`)
})

// ============================================================
// 2. take / takeAll / takeN / takeBetween — 取出元素
// ============================================================

const demoTaking = Effect.gen(function* () {
  Console.log("\n=== 2. take / takeAll / takeN / takeBetween ===")

  const queue = yield* Queue.bounded<number>(10)
  yield* Queue.offerAll(queue, [10, 20, 30, 40, 50, 60, 70])

  // take: 取出单个元素（阻塞等待）
  const item = yield* Queue.take(queue)
  Console.log(`take: ${item}（预期 10）`)

  // takeN: 取出 N 个元素
  const batch = yield* Queue.takeN(queue, 3)
  Console.log(`takeN(3): [${batch}]（预期 [20, 30, 40]）`)

  // takeBetween: 取出 min..max 个元素
  const between = yield* Queue.takeBetween(queue, 2, 5)
  Console.log(`takeBetween(2, 5): [${between}]（预期 [50, 60, 70]）`)

  // takeAll: 取出所有剩余元素
  const remaining = yield* Queue.takeAll(queue)
  Console.log(`takeAll: [${remaining}]（预期 [] — 已空）`)
})

// ============================================================
// 3. poll — 非阻塞尝试取出
// ============================================================

const demoPoll = Effect.gen(function* () {
  Console.log("\n=== 3. poll — 非阻塞取出 ===")

  const queue = yield* Queue.bounded<number>(10)

  // 空队列 poll 返回 Option.none
  const empty = yield* Queue.poll(queue)
  Console.log(`空队列 poll: ${Option.isNone(empty) ? "None" : `Some(${Option.getOrNull(empty)})`}`)

  // 添加元素后 poll 返回 Option.some
  yield* Queue.offer(queue, 42)
  const some = yield* Queue.poll(queue)
  Console.log(`添加后 poll: ${Option.isSome(some) ? `Some(${Option.getOrNull(some)})` : "None"}`)

  // 取出后再次 poll 返回 None
  const emptyAgain = yield* Queue.poll(queue)
  Console.log(`再次 poll: ${Option.isNone(emptyAgain) ? "None" : "Some"}`)
})

// ============================================================
// 4. peek — 查看但不移除
// ============================================================

const demoPeek = Effect.gen(function* () {
  Console.log("\n=== 4. peek — 查看但不移除 ===")

  const queue = yield* Queue.bounded<number>(10)
  yield* Queue.offer(queue, 99)

  const peeked = yield* Queue.peek(queue)
  Console.log(`peek: ${peeked}（预期 99）`)

  // peek 不移除元素
  const size = yield* Queue.size(queue)
  Console.log(`peek 后大小: ${size}（预期 1 — 元素仍在）`)

  const taken = yield* Queue.take(queue)
  Console.log(`take: ${taken}`)
})

// ============================================================
// 5. capacity / size / isFull — 状态查询
// ============================================================

const demoState = Effect.gen(function* () {
  Console.log("\n=== 5. capacity / size / isFull ===")

  const queue = yield* Queue.bounded<number>(3)

  Console.log(`容量: ${queue.capacity}`)
  Console.log(`初始大小: ${yield* Queue.size(queue)}`)
  Console.log(`初始 isFull: ${yield* Queue.isFull(queue)}`)

  yield* Queue.offerAll(queue, [1, 2, 3])
  Console.log(`填满后大小: ${yield* Queue.size(queue)}`)
  Console.log(`填满后 isFull: ${yield* Queue.isFull(queue)}`)
})

// ============================================================
// 6. end — 优雅关闭队列
// ============================================================

const demoEnd = Effect.gen(function* () {
  Console.log("\n=== 6. end — 优雅关闭队列 ===")

  const queue = yield* Queue.bounded<number, Cause.Done>(5)

  yield* Queue.offerAll(queue, [1, 2, 3])

  // end: 标记队列完成，不再接受新元素
  const ended = yield* Queue.end(queue)
  Console.log(`end: ${ended}`)

  // 关闭后 offer 返回 false
  const offerResult = yield* Queue.offer(queue, 4)
  Console.log(`关闭后 offer: ${offerResult}（预期 false）`)

  // 但仍可取出现有元素
  const messages = yield* Queue.takeAll(queue)
  Console.log(`关闭后 takeAll: [${messages}]（预期 [1, 2, 3]）`)
})

// ============================================================
// 7. clear — 清空队列
// ============================================================

const demoClear = Effect.gen(function* () {
  Console.log("\n=== 7. clear — 清空队列 ===")

  const queue = yield* Queue.bounded<number>(10)
  yield* Queue.offerAll(queue, [1, 2, 3, 4, 5])

  const cleared = yield* Queue.clear(queue)
  Console.log(`clear: [${cleared}]（预期 [1, 2, 3, 4, 5]）`)

  const size = yield* Queue.size(queue)
  Console.log(`清空后大小: ${size}（预期 0）`)
})

// ============================================================
// 8. Enqueue / Dequeue — 读写接口分离
// ============================================================

const demoEnqueueDequeue = Effect.gen(function* () {
  Console.log("\n=== 8. Enqueue / Dequeue — 读写接口分离 ===")

  const queue = yield* Queue.bounded<number>(10)

  // Queue.asEnqueue: 获取只写接口
  const enqueue: Queue.Enqueue<number> = Queue.asEnqueue(queue)
  // Queue.asDequeue: 获取只读接口
  const dequeue: Queue.Dequeue<number> = Queue.asDequeue(queue)

  // 通过 Enqueue 写入
  yield* Queue.offer(enqueue, 100)
  yield* Queue.offer(enqueue, 200)

  // 通过 Dequeue 读取
  const item = yield* Queue.take(dequeue)
  Console.log(`通过 Dequeue 读取: ${item}（预期 100）`)

  const size = yield* Queue.size(dequeue)
  Console.log(`Dequeue 大小: ${size}（预期 1）`)

  // isQueue / isEnqueue / isDequeue 类型守卫
  Console.log(`isQueue(queue): ${Queue.isQueue(queue)}`)
  Console.log(`isEnqueue(enqueue): ${Queue.isEnqueue(enqueue)}`)
  Console.log(`isDequeue(dequeue): ${Queue.isDequeue(dequeue)}`)
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoOffering
  yield* demoTaking
  yield* demoPoll
  yield* demoPeek
  yield* demoState
  yield* demoEnd
  yield* demoClear
  yield* demoEnqueueDequeue
  Console.log("\n✅ 02-queue-ops.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()
