# 第 13 章：Queue 与 Deferred 异步协调

## 一、本章概述

在并发编程中，Fiber 之间需要安全地传递数据和协调执行顺序。Effect-TS 提供了两个核心原语：

1. **Queue** — 异步队列，用于 Fiber 之间的数据传递，支持多种背压策略
2. **Deferred** — 一次性异步信号，用于 Fiber 之间的执行协调

本章将介绍 Queue 的四种类型、丰富的读写操作、以及 Deferred 的完整用法。最后通过生产者-消费者模式，展示 Queue + Fiber + Deferred 组合构建并发管道的实战技巧。

### 前置知识

- 第 2 章 Effect 基础：理解 `Effect`、`Effect.gen`、`Effect.runPromise`
- 第 11 章 Fiber：理解 `Effect.forkDetach`、`Fiber.join`、结构化并发
- 第 12 章 Stream：理解 `fromQueue`（Queue 与 Stream 的桥接）

### 示例代码

所有示例位于 `docs/Effect-ts/demos/ch13-queue-deferred/src/`，可直接运行：

```bash
cd docs/Effect-ts/demos/ch13-queue-deferred
bun install
bun run demo:types       # Queue 类型
bun run demo:ops         # Queue 操作
bun run demo:deferred    # Deferred 用法
bun run demo:producer    # 生产者-消费者实战
```

---

## 二、核心概念

### 2.1 为什么需要 Queue 和 Deferred

在 Fiber 模型中，Fiber 是独立的执行单元，它们不能直接共享内存变量。如果两个 Fiber 需要传递数据，需要一种线程安全的通信机制。

**Queue** 解决了"数据传递"问题：
- 一个 Fiber 通过 `offer` 写入数据
- 另一个 Fiber 通过 `take` 读取数据
- Queue 作为中间的缓冲区，自动处理并发安全

**Deferred** 解决了"执行协调"问题：
- 一个 Fiber 通过 `await` 等待某个条件满足
- 另一个 Fiber 通过 `succeed` 或 `fail` 设置结果
- Deferred 只能设置一次，保证语义清晰

### 2.2 Queue 的四种策略

```
┌──────────────────────────────────────────────────────────────┐
│                      Queue 背压策略                           │
│                                                              │
│  bounded (容量=N)    满时生产者挂起，等待空间释放              │
│  ┌────┬────┬────┐                                            │
│  │ 1  │ 2  │ 3  │ ← offer(4) → 阻塞直到 take() 腾出空间     │
│  └────┴────┴────┘                                            │
│                                                              │
│  unbounded (容量=∞)  永不阻塞，但可能无限增长                  │
│  ┌────┬────┬────┬────┬────┬ ... ─────────────────┐           │
│  │ 1  │ 2  │ 3  │ 4  │ 5  │ ...  │               │           │
│  └────┴────┴────┴────┴────┴ ... ─────────────────┘           │
│                                                              │
│  sliding (容量=N)    满时丢弃最旧元素                          │
│  ┌────┬────┬────┐     ┌────┬────┬────┐                       │
│  │ 1  │ 2  │ 3  │ →→→ │ 2  │ 3  │ 4  │ ← 1 被丢弃           │
│  └────┴────┴────┘     └────┴────┴────┘                       │
│                                                              │
│  dropping (容量=N)   满时丢弃新元素，offer 返回 false          │
│  ┌────┬────┐                                                 │
│  │ 1  │ 2  │ ← offer(3) → 丢弃 3，返回 false                │
│  └────┴────┘                                                 │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 Deferred 的工作模型

```
┌──────────────────────────────────────────┐
│         Deferred<A, E> 生命周期           │
│                                          │
│  创建                                     │
│  │  Deferred.make<A, E>()                │
│  │                                       │
│  ├─ 等待者 Fiber 1 ─→ await() ─→ 阻塞    │
│  ├─ 等待者 Fiber 2 ─→ await() ─→ 阻塞    │
│  ├─ 等待者 Fiber 3 ─→ await() ─→ 阻塞    │
│  │                                       │
│  ├─ 设置者 Fiber ─→ succeed(value)       │
│  │                 → fail(error)          │
│  │                 → die(defect)          │
│  │                 → interrupt()          │
│  │                                       │
│  └─ 所有等待者同时收到结果                  │
│     (只能设置一次，后续设置返回 false)       │
└──────────────────────────────────────────┘
```

### 2.4 关键 API

**Queue API:**

| API | 类型签名 | 说明 |
|-----|---------|------|
| `Queue.bounded` | `(capacity) => Effect<Queue<A, E>>` | 有界队列，满时挂起生产者 |
| `Queue.unbounded` | `() => Effect<Queue<A, E>>` | 无界队列，永不阻塞 |
| `Queue.sliding` | `(capacity) => Effect<Queue<A, E>>` | 滑动队列，满时丢弃最旧元素 |
| `Queue.dropping` | `(capacity) => Effect<Queue<A, E>>` | 丢弃队列，满时丢弃新元素 |
| `Queue.offer` | `(queue, msg) => Effect<boolean>` | 添加元素 |
| `Queue.offerAll` | `(queue, msgs) => Effect<Array<A>>` | 批量添加 |
| `Queue.take` | `(queue) => Effect<A, E>` | 取出一个元素（阻塞） |
| `Queue.takeAll` | `(queue) => Effect<NonEmptyArray<A>, E>` | 取出所有元素 |
| `Queue.poll` | `(queue) => Effect<Option<A>>` | 非阻塞取出 |
| `Queue.size` | `(queue) => Effect<number>` | 查询大小 |
| `Queue.end` | `(queue) => Effect<boolean>` | 标记完成 |
| `Queue.asEnqueue` | `(queue) => Enqueue<A, E>` | 获取只写接口 |
| `Queue.asDequeue` | `(queue) => Dequeue<A, E>` | 获取只读接口 |

**Deferred API:**

| API | 类型签名 | 说明 |
|-----|---------|------|
| `Deferred.make` | `<A, E>() => Effect<Deferred<A, E>>` | 创建 Deferred |
| `Deferred.succeed` | `(d, value) => Effect<boolean>` | 设置成功值 |
| `Deferred.fail` | `(d, error) => Effect<boolean>` | 设置失败值 |
| `Deferred.await` | `(d) => Effect<A, E>` | 阻塞等待结果 |
| `Deferred.poll` | `(d) => Effect<Option<Effect<A, E>>>` | 非阻塞检查 |
| `Deferred.isDone` | `(d) => Effect<boolean>` | 是否已完成 |
| `Deferred.complete` | `(d, effect) => Effect<boolean>` | 用 Effect 结果完成 |
| `Deferred.die` | `(d, defect) => Effect<boolean>` | 用缺陷完成 |

---

## 三、Queue 类型详解

### 3.1 bounded — 有界队列（背压策略）

有界队列是最常用的队列类型。当队列满时，`offer` 操作会挂起（suspend），直到有消费者取出元素腾出空间。

```typescript
import { Effect, Queue } from "effect"

const program = Effect.gen(function* () {
  // 创建容量为 3 的有界队列
  const queue = yield* Queue.bounded<number>(3)

  // 前 3 个 offer 立即成功
  yield* Queue.offer(queue, 1) // true
  yield* Queue.offer(queue, 2) // true
  yield* Queue.offer(queue, 3) // true

  // 第 4 个 offer 会挂起，直到有消费者 take
  // 如果永远没有消费者，这个 Fiber 会永远阻塞
  yield* Queue.offer(queue, 4) // 挂起等待...
})
```

**使用场景：** 需要控制内存使用，确保生产者不会过快。适用于任务队列、请求缓冲。

### 3.2 unbounded — 无界队列

无界队列永不阻塞生产者，元素可以无限添加。适合生产者速率可控、或需要确保不丢失任何消息的场景。

```typescript
const queue = yield* Queue.unbounded<string>()

// 可以无限添加，永不阻塞
yield* Queue.offerAll(queue, ["a", "b", "c", /* ... */])
```

**注意：** 如果生产者速率持续高于消费者，无界队列可能导致内存溢出。

### 3.3 sliding — 滑动队列

滑动队列在满时丢弃最旧的元素，保留最新的。适合"只关心最新数据"的场景，如实时价格、传感器读数。

```typescript
const queue = yield* Queue.sliding<number>(3)

yield* Queue.offerAll(queue, [1, 2, 3])
yield* Queue.offer(queue, 4) // 1 被丢弃

const all = yield* Queue.takeAll(queue)
// [2, 3, 4] — 1 已被滑动丢弃
```

### 3.4 dropping — 丢弃队列

丢弃队列在满时拒绝新元素，`offer` 返回 `false`。适合"宁愿丢弃新数据也不丢弃旧数据"的场景。

```typescript
const queue = yield* Queue.dropping<number>(2)

yield* Queue.offer(queue, 1) // true
yield* Queue.offer(queue, 2) // true
const result = yield* Queue.offer(queue, 3) // false — 3 被丢弃

const all = yield* Queue.takeAll(queue)
// [1, 2] — 旧数据保留
```

### 3.5 Queue.make — 通用构造器

`Queue.make` 通过配置对象创建队列，提供更灵活的控制：

```typescript
// 等效于 Queue.bounded(5)
const q1 = yield* Queue.make<number>({ capacity: 5, strategy: "suspend" })

// 等效于 Queue.sliding(3)
const q2 = yield* Queue.make<number>({ capacity: 3, strategy: "sliding" })

// 等效于 Queue.unbounded()
const q3 = yield* Queue.make<number>()
```

### 3.6 策略选择指南

| 场景 | 推荐策略 | 原因 |
|------|---------|------|
| 任务队列，不允许丢失 | bounded | 背压保护内存 |
| 实时数据流，只关心最新 | sliding | 自动丢弃旧数据 |
| 尽力而为，允许丢新 | dropping | 保留已有数据 |
| 生产者可控，速率稳定 | unbounded | 简单，无阻塞 |

---

## 四、Queue 操作详解

### 4.1 写入操作：offer / offerAll

```typescript
// offer: 单个元素
const ok = yield* Queue.offer(queue, message) // 返回 boolean

// offerAll: 批量添加，返回未能添加的剩余元素
const remaining = yield* Queue.offerAll(queue, [msg1, msg2, msg3])
// remaining 为空数组表示全部添加成功
```

### 4.2 读取操作：take / takeAll / takeN / takeBetween

```typescript
// take: 取一个（阻塞等待）
const item = yield* Queue.take(queue)

// takeAll: 取所有可用元素
const all = yield* Queue.takeAll(queue) // NonEmptyArray<A>

// takeN: 取 N 个（不足时等待）
const batch = yield* Queue.takeN(queue, 5)

// takeBetween: 取 min..max 个
const flexBatch = yield* Queue.takeBetween(queue, 2, 10)
```

### 4.3 非阻塞操作：poll / peek

```typescript
// poll: 尝试取一个，空时返回 Option.none
const maybe = yield* Queue.poll(queue) // Option<A>

// peek: 查看第一个元素但不移除
const first = yield* Queue.peek(queue)
```

### 4.4 生命周期：end / fail / shutdown

```typescript
// end: 优雅关闭 — 不再接受新 offer，但仍可消费已有元素
yield* Queue.end(queue)

// fail: 以错误关闭 — 通知消费者队列失败
yield* Queue.fail(queue, "处理失败")

// shutdown: 强制关闭 — 取消所有挂起操作
yield* Queue.shutdown(queue)
```

消费者可以通过 `Effect.exit` 捕获队列关闭信号：

```typescript
const result = yield* Effect.exit(Queue.take(queue))
if (result._tag === "Failure") {
  console.log("队列已关闭")
}
```

### 4.5 Enqueue / Dequeue — 读写接口分离

Effect-TS 的 Queue 支持分离为只读和只写接口，增强类型安全：

```typescript
const queue = yield* Queue.bounded<number>(10)

// 只写接口 — 不能 take
const writer: Queue.Enqueue<number> = Queue.asEnqueue(queue)

// 只读接口 — 不能 offer
const reader: Queue.Dequeue<number> = Queue.asDequeue(queue)

// 类型守卫
Queue.isQueue(queue)     // true
Queue.isEnqueue(writer)  // true
Queue.isDequeue(reader)  // true
```

这种分离允许你将只写接口传给生产者、只读接口传给消费者，防止误用。

---

## 五、Deferred 延迟承诺

### 5.1 什么是 Deferred

Deferred 是一个"一次性异步变量"——它可以被设置一次，之后所有等待它的 Fiber 都会同时收到结果。它类似于 JavaScript 的 `Promise`，但有以下关键区别：

| 特性 | Promise | Deferred |
|------|---------|----------|
| 类型安全 | `Promise<T>` — 无法表示错误类型 | `Deferred<A, E>` — 成功和错误类型都明确 |
| Fiber 集成 | 不是 Effect，需要包装 | 原生 Effect，可直接 `yield*` |
| 取消支持 | 无 | 支持 `interrupt` |
| 完成方式 | resolve/reject | succeed/fail/die/interrupt/complete |

### 5.2 基本用法

```typescript
import { Effect, Deferred } from "effect"

const program = Effect.gen(function* () {
  // 创建 Deferred
  const deferred = yield* Deferred.make<string>()

  // 设置值
  yield* Deferred.succeed(deferred, "Hello")

  // 等待值
  const value = yield* Deferred.await(deferred)
  console.log(value) // "Hello"
})
```

### 5.3 单次赋值保证

Deferred 只能被完成一次。后续的 `succeed`/`fail` 调用会返回 `false`：

```typescript
const deferred = yield* Deferred.make<number>()

const first = yield* Deferred.succeed(deferred, 100)  // true
const second = yield* Deferred.succeed(deferred, 200) // false

const value = yield* Deferred.await(deferred) // 100 — 仍是第一次的值
```

### 5.4 错误处理

```typescript
const deferred = yield* Deferred.make<number, string>()

// fail: 以错误完成
yield* Deferred.fail(deferred, "操作超时")

// await 会传播错误
const result = yield* Effect.exit(Deferred.await(deferred))
// result._tag === "Failure"
```

### 5.5 多种完成方式

```typescript
// succeed — 成功值
yield* Deferred.succeed(deferred, value)

// fail — 预期错误
yield* Deferred.fail(deferred, error)

// die — 未预期缺陷
yield* Deferred.die(deferred, new Error("致命错误"))

// interrupt — 中断
yield* Deferred.interrupt(deferred)

// done — 通过 Exit 完成
yield* Deferred.done(deferred, Exit.succeed(value))

// complete — 用 Effect 结果完成
yield* Deferred.complete(deferred, someEffect)
```

### 5.6 状态查询

```typescript
// isDone: 是否已设置
const done = yield* Deferred.isDone(deferred) // boolean

// poll: 非阻塞获取（Option<Effect<A, E>>）
const result = yield* Deferred.poll(deferred)
if (Option.isSome(result)) {
  // Deferred 已完成，可以 await
}
```

### 5.7 Fiber 间通信

Deferred 最常见的用途是在 Fiber 之间传递信号：

```typescript
const deferred = yield* Deferred.make<string>()

// 等待者 Fiber
const waiter = yield* Effect.forkDetach(
  Effect.gen(function* () {
    const value = yield* Deferred.await(deferred)
    console.log(`收到: ${value}`)
  }),
)

// 设置者 Fiber — 延时后设置值
const setter = yield* Effect.forkDetach(
  Effect.gen(function* () {
    yield* Effect.sleep("1 second")
    yield* Deferred.succeed(deferred, "Hello from Fiber!")
  }),
)

yield* Fiber.join(waiter)
yield* Fiber.join(setter)
```

### 5.8 多等待者模式

多个 Fiber 可以同时等待同一个 Deferred，它们会在 Deferred 完成时同时收到结果：

```typescript
const deferred = yield* Deferred.make<number>()

// 3 个等待者
const waiters = yield* Effect.all(
  [0, 1, 2].map((i) =>
    Effect.forkDetach(Effect.gen(function* () {
      const value = yield* Deferred.await(deferred)
      console.log(`等待者 ${i}: ${value}`)
    })),
  ),
)

yield* Deferred.succeed(deferred, 42)
// 三个等待者同时输出: 等待者 0: 42, 等待者 1: 42, 等待者 2: 42
```

---

## 六、生产者-消费者模式实战

### 6.1 基础模式：单生产者 + 单消费者

```typescript
const queue = yield* Queue.bounded<number>(5)

// 生产者
const producer = yield* Effect.forkDetach(
  Effect.gen(function* () {
    for (let i = 1; i <= 10; i++) {
      yield* Queue.offer(queue, i)
    }
    yield* Queue.end(queue) // 生产完毕，关闭队列
  }),
)

// 消费者
const consumer = yield* Effect.forkDetach(
  Effect.gen(function* () {
    while (true) {
      const result = yield* Effect.exit(Queue.take(queue))
      if (Exit.isFailure(result)) break // 队列关闭，退出
      console.log(`消费: ${result.value}`)
    }
  }),
)

yield* Fiber.join(producer)
yield* Fiber.join(consumer)
```

### 6.2 工作池模式：多消费者

多个消费者从同一个队列竞争消费，形成工作池：

```typescript
// 3 个 worker 竞争消费
const workers = yield* Effect.all(
  [0, 1, 2].map((id) =>
    Effect.forkDetach(Effect.gen(function* () {
      while (true) {
        const result = yield* Effect.exit(Queue.take(queue))
        if (Exit.isFailure(result)) break
        yield* processItem(id, result.value)
      }
    })),
  ),
)
```

工作池模式自动实现负载均衡——处理速度快的 worker 会自然消费更多任务。

### 6.3 管道模式：Queue 链

多个 Queue 串联形成处理管道，每个阶段可以有不同的并发度和处理逻辑：

```
[生产者] → Queue₁ → [转换器] → Queue₂ → [消费者]
```

```typescript
const rawQueue = yield* Queue.bounded<number>(10)
const processedQueue = yield* Queue.bounded<string>(10)

// 阶段 1: 生产者 → rawQueue
// 阶段 2: 转换器 → rawQueue.take → 处理 → processedQueue.offer
// 阶段 3: 消费者 → processedQueue.take → 最终处理
```

### 6.4 优雅关闭：Deferred 信号

使用 Deferred 作为停止信号，实现优雅关闭：

```typescript
const shutdownSignal = yield* Deferred.make<void>()

const producer = yield* Effect.forkDetach(
  Effect.gen(function* () {
    while (true) {
      const isShutdown = yield* Deferred.isDone(shutdownSignal)
      if (isShutdown) {
        yield* Queue.end(queue) // 关闭队列，让消费者自然退出
        break
      }
      yield* Queue.offer(queue, nextItem())
    }
  }),
)

// 外部触发关闭
yield* Deferred.succeed(shutdownSignal, undefined)
```

### 6.5 与 OpenCode 的联系

OpenCode 使用简化的 `AsyncQueue`（基于 Promise 的手动实现）处理 MCP 事件流：

```typescript
// OpenCode 的 AsyncQueue 模式（简化版）
class AsyncQueue<T> {
  push(item: T) { /* ... */ }
  async next(): Promise<T> { /* ... */ }
}
```

Effect-TS 的 Queue 在此基础上提供了更多能力：
- **类型安全的错误通道**：`Queue<A, E>` 的 E 类型参数
- **多种背压策略**：bounded/sliding/dropping/unbounded
- **与 Fiber/Scope 集成**：生命周期自动管理
- **Enqueue/Dequeue 分离**：编译期防止误用

---

## 七、小结

### 核心要点

1. **Queue 是 Fiber 间的数据通道**：通过 offer/take 实现线程安全的数据传递
2. **四种背压策略覆盖不同场景**：bounded 控制内存、unbounded 保证不丢、sliding 保留最新、dropping 拒绝新数据
3. **Deferred 是一次性异步信号**：单次赋值，多等待者同时通知
4. **Queue + Fiber 构建生产者-消费者模式**：基础模式、工作池、管道链
5. **Deferred 用于协调信号**：停止信号、完成通知、Fiber 间同步
6. **Enqueue/Dequeue 接口分离**：编译期保证读写分离

### 最佳实践

- 优先使用 `bounded` 队列，防止内存无限增长
- 生产者完成后调用 `Queue.end` 通知消费者退出
- 消费者使用 `Effect.exit` + `Queue.take` 捕获关闭信号
- 使用 `Deferred` 进行一次性事件通知，而不是用 Queue 传递单个信号
- 工作池模式中，消费者数量应与 CPU 核心数或 I/O 并发度匹配
- 管道模式中，每阶段的队列容量应根据上下游速率差设置

### 下一章

第 14 章将介绍更高级的并发原语，包括 `SynchronizedRef`（并发安全的可变状态）、`Latch`（并发门闩）、`FiberMap`（命名 Fiber 集合）和 `PubSub`（发布订阅模式）。

---

## 参考

- [Effect-TS Queue 文档](https://effect.website/docs/concurrency/queue)
- [Effect-TS Deferred 文档](https://effect.website/docs/concurrency/deferred)
- [Effect-TS Fiber 文档](https://effect.website/docs/concurrency/fiber)
- OpenCode 项目: `packages/opencode/src/util/queue.ts` — AsyncQueue 实现
- OpenCode 项目: `packages/opencode/src/mcp/index.ts` — MCP 事件流 Queue 模式
