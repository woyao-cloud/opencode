/**
 * 05-pubsub.ts — PubSub：发布-订阅消息系统
 *
 * PubSub 是异步的消息总线，支持多对多通信。多个发布者可以
 * publish 消息，多个订阅者通过 subscribe 接收消息。支持
 * bounded/unbounded/sliding/dropping 四种策略和消息回放。
 *
 * 核心操作：make/bounded/unbounded / publish / subscribe / take
 *
 * 运行: bun run src/05-pubsub.ts
 */
import { Effect, PubSub, Fiber, Console, Scope } from "effect"

// ============================================================
// 1. bounded + publish + subscribe + take — 基础用法
// ============================================================

const demoBasic = Effect.gen(function* () {
  Console.log("=== 1. bounded / publish / subscribe / take — 基础 ===")

  // PubSub.bounded<A>(capacity) — 创建有界 PubSub
  const pubsub = yield* PubSub.bounded<string>(10)

  // publish — 发布消息
  yield* PubSub.publish(pubsub, "Hello")
  yield* PubSub.publish(pubsub, "World")

  // subscribe — 创建订阅（需要 Scope 上下文）
  yield* Effect.scoped(
    Effect.gen(function* () {
      const sub = yield* PubSub.subscribe(pubsub)

      // take — 获取一条消息
      const msg1 = yield* PubSub.take(sub)
      const msg2 = yield* PubSub.take(sub)

      Console.log(`  收到: "${msg1}", "${msg2}"`)
    }),
  )
})

// ============================================================
// 2. 多订阅者 — 广播模式
// ============================================================

const demoBroadcast = Effect.gen(function* () {
  Console.log("\n=== 2. 多订阅者 — 广播模式 ===")

  const pubsub = yield* PubSub.bounded<string>(10)

  yield* Effect.scoped(
    Effect.gen(function* () {
      // 创建 3 个订阅者
      const sub1 = yield* PubSub.subscribe(pubsub)
      const sub2 = yield* PubSub.subscribe(pubsub)
      const sub3 = yield* PubSub.subscribe(pubsub)

      // 发布消息
      yield* PubSub.publish(pubsub, "广播消息")

      // 每个订阅者都能收到
      const m1 = yield* PubSub.take(sub1)
      const m2 = yield* PubSub.take(sub2)
      const m3 = yield* PubSub.take(sub3)

      Console.log(`  sub1: "${m1}", sub2: "${m2}", sub3: "${m3}"`)
    }),
  )
})

// ============================================================
// 3. 并发发布与消费
// ============================================================

const demoConcurrent = Effect.gen(function* () {
  Console.log("\n=== 3. 并发发布与消费 ===")

  const pubsub = yield* PubSub.bounded<number>(100)

  yield* Effect.scoped(
    Effect.gen(function* () {
      const sub = yield* PubSub.subscribe(pubsub)

      // 并发发布 10 条消息
      const publishers = yield* Effect.all(
        Array.from({ length: 10 }, (_, i) =>
          Effect.forkDetach(
            PubSub.publish(pubsub, i + 1),
          ),
        ),
      )

      // 等待发布完成
      yield* Effect.all(publishers.map((f) => Fiber.join(f)))

      // 消费所有消息
      const messages = yield* PubSub.takeUpTo(sub, 10)
      Console.log(`  收到的消息: [${messages.sort((a, b) => a - b)}]`)
    }),
  )
})

// ============================================================
// 4. 不同策略: bounded / unbounded / sliding / dropping
// ============================================================

const demoStrategies = Effect.gen(function* () {
  Console.log("\n=== 4. 四种策略对比 ===")

  // unbounded — 无界，永不阻塞
  const unboundedPubsub = yield* PubSub.unbounded<string>()
  Console.log("  unbounded 创建成功")

  // sliding — 满时丢弃最旧消息
  const slidingPubsub = yield* PubSub.sliding<string>(2)
  yield* PubSub.publish(slidingPubsub, "old-1")
  yield* PubSub.publish(slidingPubsub, "old-2")
  yield* PubSub.publish(slidingPubsub, "new-1") // "old-1" 被丢弃
  yield* PubSub.publish(slidingPubsub, "new-2") // "old-2" 被丢弃

  yield* Effect.scoped(
    Effect.gen(function* () {
      const sub = yield* PubSub.subscribe(slidingPubsub)
      const msgs = yield* PubSub.takeAll(sub)
      Console.log(`  sliding (容量2) 收到: [${msgs}]（旧消息被丢弃）`)
    }),
  )

  // dropping — 满时丢弃新消息
  const droppingPubsub = yield* PubSub.dropping<string>(2)
  yield* PubSub.publish(droppingPubsub, "keep-1")
  yield* PubSub.publish(droppingPubsub, "keep-2")
  const dropped = yield* PubSub.publish(droppingPubsub, "dropped")
  Console.log(`  dropping: publish 第3条返回 ${dropped}（被丢弃）`)

  yield* Effect.scoped(
    Effect.gen(function* () {
      const sub = yield* PubSub.subscribe(droppingPubsub)
      const msgs = yield* PubSub.takeAll(sub)
      Console.log(`  dropping (容量2) 收到: [${msgs}]（新消息被丢弃）`)
    }),
  )
})

// ============================================================
// 5. takeAll / takeUpTo / takeBetween — 批量消费
// ============================================================

const demoBatchConsume = Effect.gen(function* () {
  Console.log("\n=== 5. 批量消费: takeAll / takeUpTo / takeBetween ===")

  const pubsub = yield* PubSub.bounded<string>(50)

  // 发布多条消息
  yield* PubSub.publishAll(pubsub, ["a", "b", "c", "d", "e", "f", "g", "h"])

  yield* Effect.scoped(
    Effect.gen(function* () {
      const sub = yield* PubSub.subscribe(pubsub)

      // takeUpTo — 最多取 N 条，不阻塞
      const upTo3 = yield* PubSub.takeUpTo(sub, 3)
      Console.log(`  takeUpTo(3): [${upTo3}]`)

      // takeBetween — 取 min~max 条，不够 min 则阻塞
      const between = yield* PubSub.takeBetween(sub, 2, 3)
      Console.log(`  takeBetween(2, 3): [${between}]`)

      // takeAll — 取所有可用的（至少 1 条）
      const remaining = yield* PubSub.takeAll(sub)
      Console.log(`  takeAll: [${remaining}]`)
    }),
  )
})

// ============================================================
// 6. capacity / size / isFull / isEmpty — 状态查询
// ============================================================

const demoQuery = Effect.gen(function* () {
  Console.log("\n=== 6. 状态查询 ===")

  const pubsub = yield* PubSub.bounded<string>(5)

  const cap = PubSub.capacity(pubsub)
  Console.log(`  capacity: ${cap}`)

  const empty = yield* PubSub.isEmpty(pubsub)
  Console.log(`  isEmpty: ${empty}`)

  yield* PubSub.publish(pubsub, "msg1")
  yield* PubSub.publish(pubsub, "msg2")

  const sz = yield* PubSub.size(pubsub)
  Console.log(`  size: ${sz}`)

  const full = yield* PubSub.isFull(pubsub)
  Console.log(`  isFull: ${full}`)
})

// ============================================================
// 7. 实战: 事件总线
// ============================================================

const demoEventBus = Effect.gen(function* () {
  Console.log("\n=== 7. 实战: 事件总线 ===")

  // 创建事件总线
  const events = yield* PubSub.bounded<string>(100)

  yield* Effect.scoped(
    Effect.gen(function* () {
      // 两个事件监听器
      const listener1 = yield* Effect.forkDetach(
        Effect.scoped(
          Effect.gen(function* () {
            const sub = yield* PubSub.subscribe(events)
            // 接收 3 个事件
            const evts = yield* PubSub.takeBetween(sub, 3, 3)
            Console.log(`  [listener-1] 收到事件: [${evts}]`)
          }),
        ),
      )

      const listener2 = yield* Effect.forkDetach(
        Effect.scoped(
          Effect.gen(function* () {
            const sub = yield* PubSub.subscribe(events)
            const evts = yield* PubSub.takeBetween(sub, 3, 3)
            Console.log(`  [listener-2] 收到事件: [${evts}]`)
          }),
        ),
      )

      // 发布事件
      yield* PubSub.publish(events, "user.login")
      yield* PubSub.publish(events, "order.created")
      yield* PubSub.publish(events, "payment.success")

      // 等待监听器处理完成
      yield* Fiber.join(listener1)
      yield* Fiber.join(listener2)
    }),
  )
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoBasic
  yield* demoBroadcast
  yield* demoConcurrent
  yield* demoStrategies
  yield* demoBatchConsume
  yield* demoQuery
  yield* demoEventBus
  Console.log("\n✅ 05-pubsub.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()
