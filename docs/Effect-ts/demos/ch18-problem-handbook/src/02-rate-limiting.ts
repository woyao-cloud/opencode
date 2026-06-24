/**
 * 02-rate-limiting.ts — 限流与并发控制
 *
 * 演示 Effect-TS 的限流和并发控制模式：
 * - Schedule.spaced — 固定间隔执行
 * - 令牌桶算法 — 自定义限流器
 * - Effect.forEach + concurrency — 控制并发度
 * - Effect.all + concurrency — 批量并发控制
 *
 * 运行: bun run src/02-rate-limiting.ts
 */

import { Effect, Schedule, Duration, Console, Queue, Ref, Random } from "effect"

// ============================================================
// 1. Schedule.spaced — 固定间隔执行
// ============================================================

console.log("=== 1. Schedule.spaced — 固定间隔执行 ===\n")

// 模拟 API 调用，限制每秒最多 2 次
let apiCallCount = 0

const apiCall = (id: number): Effect.Effect<string> =>
  Effect.gen(function* () {
    apiCallCount++
    yield* Console.log(`  [API] 请求 #${id} (第 ${apiCallCount} 次调用)`)
    return `响应-${id}`
  })

// 使用 Schedule.spaced 限制调用频率：每 500ms 执行一次
const program1 = Effect.gen(function* () {
  const results: Array<string> = []
  for (let i = 1; i <= 5; i++) {
    const result = yield* apiCall(i)
    results.push(result)
    // 每次调用后等待 500ms（最后一次不需要等待）
    if (i < 5) {
      yield* Effect.sleep(Duration.millis(500))
    }
  }
  return results
})

const start1 = Date.now()
Effect.runPromise(program1).then((results) => {
  const elapsed = Date.now() - start1
  console.log(`\n结果: ${results.join(", ")}`)
  console.log(`耗时: ${elapsed}ms（5 次调用，间隔 500ms）`)
})

// ============================================================
// 2. 令牌桶算法 — 自定义限流器
// ============================================================

console.log("\n=== 2. 令牌桶算法 — 自定义限流器 ===\n")

// 令牌桶限流器
// - capacity: 桶容量（最大突发量）
// - intervalMs: 令牌补充间隔（毫秒）
class TokenBucket {
  private tokens: Ref.Ref<number>
  private capacity: number
  private intervalMs: number
  private lastRefill: Ref.Ref<number>

  constructor(capacity: number, intervalMs: number) {
    this.capacity = capacity
    this.intervalMs = intervalMs
    this.tokens = Ref.makeUnsafe(capacity)
    this.lastRefill = Ref.makeUnsafe(Date.now())
  }

  // 尝试获取一个令牌（自动补充）
  acquire(): Effect.Effect<boolean> {
    const self = this
    return Effect.gen(function* () {
      // 先尝试补充令牌
      const now = Date.now()
      const last = yield* Ref.get(self.lastRefill)
      const elapsed = now - last
      if (elapsed >= self.intervalMs) {
        const current = yield* Ref.get(self.tokens)
        const toAdd = Math.min(
          self.capacity - current,
          Math.floor(elapsed / self.intervalMs),
        )
        if (toAdd > 0) {
          yield* Ref.set(self.tokens, current + toAdd)
          yield* Ref.set(self.lastRefill, now)
        }
      }

      // 尝试获取令牌
      const current = yield* Ref.get(self.tokens)
      if (current > 0) {
        yield* Ref.update(self.tokens, (n) => n - 1)
        return true
      }
      return false
    })
  }

  // 限流执行：获取令牌，如果失败则等待后重试
  execute<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
    const self = this
    const tryExecute = Effect.gen(function* () {
      const ok = yield* self.acquire()
      if (!ok) {
        return yield* Effect.fail("rate-limited")
      }
      return yield* effect
    })

    return tryExecute.pipe(
      Effect.retry(
        Schedule.spaced(Duration.millis(100)).pipe(
          Schedule.andThen(Schedule.recurs(20)),
        ),
      ),
    )
  }
}

// 使用令牌桶限流
const bucket = new TokenBucket(3, 1000) // 容量 3，每秒补充 1 个

const program2 = Effect.gen(function* () {
  // 发起 6 个请求（桶容量只有 3，前 3 个立即通过，后 3 个等待补充）
  const results: Array<string> = []
  for (const i of [1, 2, 3, 4, 5, 6]) {
    const result = yield* bucket.execute(
      Effect.gen(function* () {
        yield* Console.log(`  [令牌桶] 请求 #${i} 通过`)
        return `结果-${i}`
      }),
    )
    results.push(result)
  }
  return results
})

const start2 = Date.now()
Effect.runPromise(program2).then((results) => {
  const elapsed = Date.now() - start2
  console.log(`\n令牌桶结果: ${results.join(", ")}`)
  console.log(`耗时: ${elapsed}ms（容量 3，每秒补充 1 个）`)
})

// ============================================================
// 3. Effect.forEach + concurrency — 控制并发度
// ============================================================

console.log("\n=== 3. Effect.forEach + concurrency — 控制并发度 ===\n")

// 模拟一个耗时的外部 API 调用
const externalApi = (id: number): Effect.Effect<string> =>
  Effect.gen(function* () {
    const delay = yield* Random.nextIntBetween(100, 300)
    yield* Effect.sleep(Duration.millis(delay))
    yield* Console.log(`  [外部API] 请求 #${id} 完成（耗时 ${delay}ms）`)
    return `数据-${id}`
  })

const items = [1, 2, 3, 4, 5, 6, 7, 8]

// 限制并发度为 3
const program3 = Effect.forEach(items, (id) => externalApi(id), {
  concurrency: 3,
})

const start3 = Date.now()
Effect.runPromise(program3).then((results) => {
  const elapsed = Date.now() - start3
  console.log(`\n并发控制结果: ${results.join(", ")}`)
  console.log(`耗时: ${elapsed}ms（8 个任务，并发度 3）`)
})

// ============================================================
// 4. 实用模式: 限流队列
// ============================================================

console.log("\n=== 4. 实用模式: 限流队列 ===\n")

// 使用 Queue + Schedule 实现生产者-消费者限流
const program4 = Effect.gen(function* () {
  const queue = yield* Queue.bounded<string>(100)

  // 生产者：快速生产
  const producer = Effect.gen(function* () {
    for (let i = 1; i <= 10; i++) {
      yield* Queue.offer(queue, `消息-${i}`)
      yield* Console.log(`  [生产者] 发送 消息-${i}`)
    }
  })

  // 消费者：限速消费（每 300ms 处理一条）
  const consumer = Effect.gen(function* () {
    for (let i = 1; i <= 10; i++) {
      const msg = yield* Queue.take(queue)
      yield* Console.log(`  [消费者] 处理 ${msg}`)
      if (i < 10) {
        yield* Effect.sleep(Duration.millis(300))
      }
    }
  })

  // 同时启动生产者和消费者
  yield* Effect.forkChild(producer)
  yield* consumer
})

Effect.runPromise(program4).then(() =>
  console.log("\n限流队列处理完成"),
)

console.log("\n✅ 02-rate-limiting.ts 运行完成")
