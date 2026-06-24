/**
 * 04-producer-consumer.ts — 生产者-消费者模式（Queue + Fiber + Deferred）
 *
 * 生产者-消费者模式是并发编程的经典模式：
 * - 生产者通过 Queue.offer 向队列写入数据
 * - 消费者通过 Queue.take 从队列读取数据
 * - Queue 作为缓冲区解耦生产和消费速度
 * - Deferred 用于信号传递（如停止信号）
 *
 * 运行: bun run src/04-producer-consumer.ts
 */
import { Effect, Queue, Fiber, Console, Deferred, Scope } from "effect"

// ============================================================
// 1. 基础生产者-消费者 — 单生产者 + 单消费者
// ============================================================

const demoBasic = Effect.gen(function* () {
  Console.log("=== 1. 基础生产者-消费者 ===")

  // 创建有界队列（容量 5）
  const queue = yield* Queue.bounded<number>(5)

  // 生产者 Fiber：生成 1..10
  const producer = yield* Effect.forkDetach(
    Effect.gen(function* () {
      for (let i = 1; i <= 10; i++) {
        yield* Effect.sleep("50 millis")
        const ok = yield* Queue.offer(queue, i)
        Console.log(`[生产者] 生产: ${i} (${ok ? "成功" : "失败"})`)
      }
      // 生产完毕，关闭队列
      yield* Queue.end(queue)
      Console.log("[生产者] 生产完毕，队列已关闭")
    }),
  )

  // 消费者 Fiber：逐条消费
  const consumer = yield* Effect.forkDetach(
    Effect.gen(function* () {
      let count = 0
      while (true) {
        // 使用 Effect.exit 捕获 Done 信号
        const result = yield* Effect.exit(Queue.take(queue))
        if (result._tag === "Failure") {
          Console.log(`[消费者] 队列已关闭，共消费 ${count} 条`)
          break
        }
        count++
        Console.log(`[消费者] 消费: ${result.value}`)
        yield* Effect.sleep("100 millis") // 模拟处理耗时
      }
      return count
    }),
  )

  // 等待两者完成
  yield* Fiber.join(producer)
  const count = yield* Fiber.join(consumer)
  Console.log(`共消费 ${count} 条消息`)
})

// ============================================================
// 2. 多生产者 + 单消费者
// ============================================================

const demoMultiProducers = Effect.gen(function* () {
  Console.log("\n=== 2. 多生产者 + 单消费者 ===")

  const queue = yield* Queue.bounded<string>(10)

  // 3 个生产者，各自生产不同的消息
  const producers = yield* Effect.all(
    ["A", "B", "C"].map((id) =>
      Effect.forkDetach(
        Effect.gen(function* () {
          for (let i = 1; i <= 3; i++) {
            yield* Effect.sleep(`${20 + Math.random() * 30} millis`)
            const msg = `[生产者-${id}] 消息 #${i}`
            yield* Queue.offer(queue, msg)
            Console.log(msg)
          }
        }),
      ),
    ),
  )

  // 等待所有生产者完成
  yield* Effect.all(producers.map((f) => Fiber.join(f)))

  // 生产者全部完成后关闭队列
  yield* Queue.end(queue)
  Console.log("[主线程] 所有生产者完成，队列已关闭")

  // 消费者：取出所有消息
  const consumer = yield* Effect.forkDetach(
    Effect.gen(function* () {
      let count = 0
      while (true) {
        const result = yield* Effect.exit(Queue.take(queue))
        if (result._tag === "Failure") {
          Console.log(`[消费者] 共消费 ${count} 条消息`)
          break
        }
        count++
        Console.log(`  [消费者] 消费: ${result.value}`)
      }
      return count
    }),
  )

  const total = yield* Fiber.join(consumer)
  Console.log(`多生产者模式共消费 ${total} 条消息`)
})

// ============================================================
// 3. 单生产者 + 多消费者（工作池模式）
// ============================================================

const demoWorkerPool = Effect.gen(function* () {
  Console.log("\n=== 3. 工作池模式 — 多消费者 ===")

  const queue = yield* Queue.bounded<number>(20)

  // 3 个消费者组成工作池
  const workers = yield* Effect.all(
    [0, 1, 2].map((id) =>
      Effect.forkDetach(
        Effect.gen(function* () {
          while (true) {
            const result = yield* Effect.exit(Queue.take(queue))
            if (result._tag === "Failure") break

            const item = result.value
            Console.log(`  [worker-${id}] 处理: ${item}`)
            // 模拟不同处理速度
            yield* Effect.sleep(`${50 + (item % 3) * 30} millis`)
          }
          Console.log(`  [worker-${id}] 退出`)
        }),
      ),
    ),
  )

  // 生产者：快速生产 9 个任务
  const producer = yield* Effect.forkDetach(
    Effect.gen(function* () {
      for (let i = 1; i <= 9; i++) {
        yield* Queue.offer(queue, i)
        Console.log(`[生产者] 提交任务 #${i}`)
        yield* Effect.sleep("30 millis")
      }
      yield* Queue.end(queue)
      Console.log("[生产者] 所有任务已提交，队列关闭")
    }),
  )

  yield* Fiber.join(producer)
  yield* Effect.all(workers.map((f) => Fiber.join(f)))
  Console.log("工作池处理完毕")
})

// ============================================================
// 4. 管道模式 — Queue 链式传递（Queue → Queue → Consumer）
// ============================================================

const demoPipeline = Effect.gen(function* () {
  Console.log("\n=== 4. 管道模式 — Queue 链 ===")

  // 两个队列形成管道：raw → processed
  const rawQueue = yield* Queue.bounded<number>(10)
  const processedQueue = yield* Queue.bounded<string>(10)

  // 阶段 1: 生产者 → rawQueue
  const stage1 = yield* Effect.forkDetach(
    Effect.gen(function* () {
      for (let i = 1; i <= 5; i++) {
        yield* Queue.offer(rawQueue, i)
        Console.log(`[阶段1] 原始数据: ${i}`)
      }
      yield* Queue.end(rawQueue)
      Console.log("[阶段1] 原始数据生产完毕")
    }),
  )

  // 阶段 2: rawQueue → 转换 → processedQueue
  const stage2 = yield* Effect.forkDetach(
    Effect.gen(function* () {
      while (true) {
        const result = yield* Effect.exit(Queue.take(rawQueue))
        if (result._tag === "Failure") break
        const transformed = `处理结果: ${result.value * 10}`
        yield* Queue.offer(processedQueue, transformed)
        Console.log(`  [阶段2] 转换: ${result.value} → ${transformed}`)
        yield* Effect.sleep("30 millis")
      }
      yield* Queue.end(processedQueue)
      Console.log("  [阶段2] 转换完成，管道关闭")
    }),
  )

  // 阶段 3: processedQueue → 最终消费者
  const stage3 = yield* Effect.forkDetach(
    Effect.gen(function* () {
      while (true) {
        const result = yield* Effect.exit(Queue.take(processedQueue))
        if (result._tag === "Failure") break
        Console.log(`    [阶段3] 最终消费: ${result.value}`)
      }
      Console.log("    [阶段3] 消费完毕")
    }),
  )

  yield* Fiber.join(stage1)
  yield* Fiber.join(stage2)
  yield* Fiber.join(stage3)
  Console.log("管道处理完毕")
})

// ============================================================
// 5. 优雅关闭 — 使用 Deferred 信号协调
// ============================================================

const demoGracefulShutdown = Effect.gen(function* () {
  Console.log("\n=== 5. 优雅关闭 — Deferred 信号 ===")

  const queue = yield* Queue.bounded<number>(10)

  // Deferred 作为停止信号
  const shutdownSignal = yield* Deferred.make<void>()

  // 生产者：持续生产直到收到停止信号
  const producer = yield* Effect.forkDetach(
    Effect.gen(function* () {
      let i = 1
      while (true) {
        // 轮询检查停止信号
        const isShutdown = yield* Deferred.isDone(shutdownSignal)
        if (isShutdown) {
          Console.log("[生产者] 收到停止信号，停止生产")
          yield* Queue.end(queue)
          break
        }
        const ok = yield* Queue.offer(queue, i)
        Console.log(`[生产者] 生产: ${i}`)
        i++
        yield* Effect.sleep("50 millis")
      }
    }),
  )

  // 消费者：消费直到队列关闭
  const consumer = yield* Effect.forkDetach(
    Effect.gen(function* () {
      let count = 0
      while (true) {
        const result = yield* Effect.exit(Queue.take(queue))
        if (result._tag === "Failure") {
          Console.log(`[消费者] 队列关闭，共消费 ${count} 条`)
          break
        }
        count++
        Console.log(`  [消费者] 消费: ${result.value}`)
        yield* Effect.sleep("80 millis")
      }
      return count
    }),
  )

  // 运行 500ms 后发送停止信号
  yield* Effect.sleep("500 millis")
  Console.log("[主线程] 发送停止信号...")
  yield* Deferred.succeed(shutdownSignal, undefined)

  yield* Fiber.join(producer)
  const count = yield* Fiber.join(consumer)
  Console.log(`优雅关闭完成，共消费 ${count} 条消息`)
})

// ============================================================
// 6. 与 OpenCode 的 Queue 模式对比
// ============================================================

const demoOpenCodePattern = Effect.gen(function* () {
  Console.log("\n=== 6. OpenCode AsyncQueue 模式参考 ===")

  // OpenCode 使用简化的 AsyncQueue（基于 Promise）
  // Effect-TS Queue 提供更丰富的功能：
  // - 背压策略（bounded/sliding/dropping）
  // - 类型安全的错误通道（E 类型参数）
  // - 与 Fiber/Scope 深度集成
  // - 生命周期管理（end/fail/shutdown）

  const queue = yield* Queue.bounded<string, string>(5)

  // 模拟事件流处理（类似 OpenCode MCP 事件流）
  const eventProducer = yield* Effect.forkDetach(
    Effect.gen(function* () {
      const events = [
        "MCP:connect",
        "MCP:tools/list",
        "MCP:resources/read",
        "MCP:disconnect",
      ]
      for (const event of events) {
        yield* Queue.offer(queue, event)
        Console.log(`[事件源] 发送: ${event}`)
        yield* Effect.sleep("40 millis")
      }
      yield* Queue.end(queue)
    }),
  )

  // 事件消费者（类似 OpenCode 的 TUI 事件处理）
  const eventConsumer = yield* Effect.forkDetach(
    Effect.gen(function* () {
      while (true) {
        const result = yield* Effect.exit(Queue.take(queue))
        if (result._tag === "Failure") break
        const event = result.value
        Console.log(`  [事件处理] 处理: ${event}`)
        yield* Effect.sleep("60 millis")
      }
      Console.log("  [事件处理] 事件流结束")
    }),
  )

  yield* Fiber.join(eventProducer)
  yield* Fiber.join(eventConsumer)
  Console.log("OpenCode 模式演示完毕")
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoBasic
  yield* demoMultiProducers
  yield* demoWorkerPool
  yield* demoPipeline
  yield* demoGracefulShutdown
  yield* demoOpenCodePattern
  Console.log("\n✅ 04-producer-consumer.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()
