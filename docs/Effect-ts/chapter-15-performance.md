# 第 15 章：性能分析与优化

## 一、本章概述

Effect-TS 提供了类型安全和可组合的并发模型，但任何抽象都有其性能特征。理解这些特征——哪些操作开销小、哪些场景需要优化、如何测量和验证——是构建高性能应用的关键。

本章涵盖五个核心主题：

1. **Effect 创建与执行开销** — succeed/sync/fail 的创建成本、flatMap 链 vs Effect.gen、Effect.all 并发 vs 顺序
2. **Fiber 调度** — fork 开销、调度公平性、大规模并发、Scope 管理
3. **Cache 缓存策略** — cached 永久缓存、cachedWithTTL 带过期缓存、命中率、LRU 驱逐
4. **Stream 调优** — chunk 大小、buffer 大小、并发度、grouped 批量处理
5. **微基准测试** — performance.now() 基准、预热消除 JIT 影响、多次平均减少噪音

### 前置知识

- 第 2 章 Effect 基础：理解 `Effect`、`Effect.gen`、`pipe`/`flow`
- 第 10 章 Effect 模式：理解 `Effect.forEach`、`Effect.all`、`flatMap` 链
- 第 11 章 Fiber：理解 `Effect.fork`、`Fiber.join`、`Fiber.joinAll`
- 第 12 章 Stream：理解 `Stream.fromIterable`、`Stream.runCollect`、`Stream.mapEffect`

### 示例代码

所有示例位于 `docs/Effect-ts/demos/ch15-performance/src/`，可直接运行：

```bash
cd docs/Effect-ts/demos/ch15-performance
bun install
bun run demo:overhead    # Effect 创建开销
bun run demo:fiber       # Fiber 调度
bun run demo:cache       # Cache 策略
bun run demo:stream      # Stream 调优
bun run demo:benchmark   # 微基准测试
```

---

## 二、核心概念

### 2.1 性能分析层次

Effect-TS 程序的性能可以从三个层次分析：

```
┌──────────────────────────────────────────────────────────────┐
│                     性能分析层次                              │
│                                                              │
│  层次 1: 创建开销                                            │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ Effect.succeed / sync / fail / gen 的创建成本         │     │
│  │ 典型: < 1μs/op，几乎可以忽略                          │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  层次 2: 执行开销                                            │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ runSync / runPromise 的调度和执行成本                 │     │
│  │ runSync: ~1-5μs, runPromise: ~5-15μs                │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  层次 3: 架构开销                                            │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ 并发模式选择: all vs 顺序, Fiber vs Promise,          │     │
│  │ Cache 命中率, Stream buffer 配置                     │     │
│  │ 影响: 毫秒到秒级                                      │     │
│  └─────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 关键 API

**Cache API:**

| API | 说明 |
|-----|------|
| `Cache.cached(fn)` | 包装函数为缓存版本（永久缓存） |
| `Cache.make({ capacity, timeToLive, lookup })` | 创建带配置的缓存 |
| `cache.get(key)` | 获取或计算缓存值 |
| `cache.refresh(key)` | 强制刷新缓存值 |
| `cache.invalidate(key)` | 使缓存失效 |

**性能分析相关 API:**

| API | 说明 |
|-----|------|
| `Effect.yieldNow()` | 主动让出执行权（测试公平性） |
| `Effect.sleep(duration)` | 模拟 I/O 延迟 |
| `Fiber.joinAll(fibers)` | 等待所有 Fiber 完成 |
| `Stream.grouped(n)` | 按 n 个元素分组 |
| `Stream.bufferChunks({ capacity })` | 设置缓冲区大小 |
| `Stream.mapEffect(fn, { concurrency })` | 设置并发度 |

---

## 三、Effect 创建与执行开销

### 3.1 创建开销

Effect 是轻量级的不可变值。创建 Effect 的成本极低——通常在亚微秒级别：

```
Effect.succeed(value)     ~0.05 μs/op   (最轻量)
Effect.sync(() => value)  ~0.10 μs/op   (多一层函数包装)
Effect.fail(error)        ~0.08 μs/op
Effect.gen(function*(){}) ~0.50 μs/op   (generator 开销)
```

**关键结论：** 在大多数应用中，Effect 创建开销完全可以忽略。瓶颈通常在实际执行（I/O、计算）而非 Effect 构造。

### 3.2 flatMap 链 vs Effect.gen

`flatMap` 链和 `Effect.gen` 在执行开销上有细微差异：

```typescript
// flatMap 链 — 直接组合，无 generator 开销
const chain = Effect.succeed(init).pipe(
  Effect.flatMap(fn1),
  Effect.flatMap(fn2),
  Effect.flatMap(fn3),
)

// Effect.gen — 有 generator 开销，但可读性更好
const gen = Effect.gen(function* () {
  const a = yield* fn1(init)
  const b = yield* fn2(a)
  return yield* fn3(b)
})
```

**选择指南：**

| 场景 | 推荐 | 原因 |
|------|------|------|
| 简单的 2-3 步管道 | flatMap 链 | 无 generator 开销 |
| 复杂逻辑（条件、循环） | Effect.gen | 可读性远大于微小的性能差异 |
| 高频热路径 | flatMap 链 | 每次调用节省 ~0.5μs |
| 日常业务逻辑 | Effect.gen | 维护性优先 |

### 3.3 Effect.all（并发）vs 顺序 yield*

这是性能影响最大的选择之一。以 3 个各 50ms 的 I/O 任务为例：

```typescript
// 顺序执行 — 总时间 ≈ 150ms
const results = yield* Effect.gen(function* () {
  const r1 = yield* task1  // 50ms
  const r2 = yield* task2  // 50ms
  const r3 = yield* task3  // 50ms
  return [r1, r2, r3]
})

// 并发执行 — 总时间 ≈ 50ms
const results = yield* Effect.all([task1, task2, task3])
```

**规则：** 如果任务之间没有数据依赖，使用 `Effect.all` 并发执行。

### 3.4 Effect.forEach 并发度

`Effect.forEach` 默认无限制并发。对于大量 I/O 任务，控制并发度可以平衡吞吐量和资源消耗：

```typescript
// 无限制并发 — 100 个请求同时发出（可能压垮服务端）
yield* Effect.forEach(items, processItem)

// 限制并发度为 5 — 最多 5 个请求同时进行
yield* Effect.forEach(items, processItem, { concurrency: 5 })

// 顺序执行 — 一个接一个
yield* Effect.forEach(items, processItem, { concurrency: 1 })
```

### 3.5 避免不必要的 Effect 包装

```typescript
// 错误：纯计算用 tryPromise 包装 — 每次创建不必要的 Promise
const bad = Effect.tryPromise(() => Promise.resolve(i * 2))

// 正确：纯计算用 sync
const good = Effect.sync(() => i * 2)
```

`tryPromise` 每次调用都会创建一个 Promise 对象，开销远大于 `sync`。对于纯同步计算，始终使用 `sync` 或 `succeed`。

---

## 四、Fiber 调度

### 4.1 Fiber 的轻量特性

Fiber 是 Effect-TS 的并发单元，比操作系统线程轻量几个数量级：

```
OS 线程创建:  ~1ms, ~1MB 栈内存
Fiber 创建:   ~0.01ms, ~几 KB 内存
```

这意味着你可以安全地创建数千个 Fiber 而不会耗尽系统资源。

### 4.2 调度公平性

Effect-TS 的调度器是公平的——每个 Fiber 轮流获得执行时间。对于纯 CPU 计算，可以使用 `Effect.yieldNow()` 主动让出执行权，防止单个 Fiber 长时间占用：

```typescript
const fiber = Effect.gen(function* () {
  for (let i = 0; i < 100_000; i++) {
    doWork(i)
    if (i % 100 === 0) {
      yield* Effect.yieldNow() // 让出执行权
    }
  }
})
```

### 4.3 大规模并发

创建 1,000 个 Fiber 的开销：

```
fork 1,000 Fiber:  ~5-10ms
join 1,000 Fiber:  ~2-5ms
```

如果每个 Fiber 执行 10ms 的 I/O，1,000 个并发 Fiber 的总时间仍约 10ms（并发执行），而非 10,000ms。

### 4.4 Scope 管理

使用 `Effect.scoped` 自动管理 Fiber 生命周期，避免 Fiber 泄漏：

```typescript
const result = yield* Effect.scoped(
  Effect.gen(function* () {
    // 在 Scope 内 fork 的 Fiber 会在 Scope 关闭时自动中断
    const fiber = yield* Effect.fork(longRunningTask)
    const value = yield* Fiber.join(fiber)
    return value
  }),
)
// Scope 关闭后，未完成的 Fiber 被自动中断
```

### 4.5 forkDaemon vs fork

| 特性 | fork | forkDaemon |
|------|------|------------|
| Scope 关闭时 | 等待完成 | 不等待（立即中断） |
| 适用场景 | 需要结果的任务 | 后台日志、监控上报 |
| 内存安全 | 可能阻止 Scope 关闭 | 不会阻止 |

---

## 五、Cache 缓存策略

### 5.1 为什么需要缓存

重复计算是性能浪费的主要来源。对于以下场景，缓存可以显著提升性能：

- **数据库查询** — 相同 SQL 多次执行
- **API 调用** — 相同参数多次请求
- **CPU 密集计算** — 相同输入产生相同输出

Effect-TS 的 `Cache` 模块提供了类型安全的缓存抽象。

### 5.2 cached — 永久缓存

```typescript
import { Effect, Cache } from "effect"

const expensiveFn = (input: number): Effect.Effect<number> =>
  Effect.gen(function* () {
    yield* Effect.sleep("100 millis") // 模拟计算
    return input * input
  })

// 包装为缓存版本
const cachedFn = yield* Cache.cached(expensiveFn)

// 第一次调用：执行计算
const r1 = yield* cachedFn(5) // 100ms

// 第二次调用：命中缓存
const r2 = yield* cachedFn(5) // ~0ms
```

### 5.3 cachedWithTTL — 带过期时间的缓存

```typescript
const cache = yield* Cache.make({
  capacity: 100,
  timeToLive: Duration.seconds(60),
  lookup: expensiveFn,
})

// 在 TTL 内重复调用命中缓存
const r1 = yield* cache.get(key) // 计算
const r2 = yield* cache.get(key) // 缓存命中

// TTL 过期后重新计算
yield* Effect.sleep("61 seconds")
const r3 = yield* cache.get(key) // 重新计算
```

### 5.4 缓存容量与 LRU 驱逐

`capacity` 参数控制缓存最多保存多少条目。当缓存满时，使用 LRU（Least Recently Used）策略驱逐最久未使用的条目：

```typescript
const cache = yield* Cache.make({
  capacity: 3, // 只保存 3 个条目
  timeToLive: Duration.seconds(60),
  lookup: expensiveFn,
})

// 添加 5 个不同的 key
for (const key of [1, 2, 3, 4, 5]) {
  yield* cache.get(key)
}
// key 1, 2 被 LRU 驱逐，key 3, 4, 5 保留
```

### 5.5 命中率优化

缓存命中率取决于访问模式。在典型的 Web 应用中，80% 的请求集中在 20% 的数据上（Zipf 分布）。合理设置缓存容量和 TTL 可以显著提升命中率：

| 容量策略 | 适用场景 |
|---------|---------|
| 小容量（10-100） | 热点数据少，内存敏感 |
| 中容量（100-1000） | 一般业务缓存 |
| 大容量（1000+） | 数据种类多，内存充裕 |
| 无容量限制 | 谨慎使用，可能导致内存溢出 |

---

## 六、Stream 调优

### 6.1 chunk 大小对吞吐量的影响

Stream 以 Chunk 为单位传递数据。chunk 大小影响吞吐量：

```
chunk 太小 → 更多函数调用开销 → 吞吐量下降
chunk 太大 → 更多内存占用 → GC 压力增大
```

默认的 chunk 大小适合大多数场景。对于高频小数据（如传感器读数），增大 chunk 可以提高吞吐量。

### 6.2 buffer 大小 — 背压控制

当生产者快于消费者时，buffer 大小决定内存使用和延迟之间的权衡：

```typescript
Stream.fromIterable(fastProducer).pipe(
  Stream.bufferChunks({ capacity: 100 }), // 缓冲 100 个 chunk
  Stream.mapEffect(slowConsumer),
)
```

| buffer 大小 | 优点 | 缺点 |
|-------------|------|------|
| 小（1-10） | 低内存、低延迟 | 生产者可能频繁阻塞 |
| 中（10-100） | 平衡 | 一般场景推荐 |
| 大（100+） | 高吞吐 | 高内存、高延迟 |

### 6.3 grouped — 批量处理

`Stream.grouped(n)` 将 n 个元素合并为一个 Chunk，减少下游操作次数：

```typescript
Stream.fromIterable(data).pipe(
  Stream.grouped(10), // 每 10 个元素打包
  Stream.mapEffect((chunk) => batchInsert(chunk)), // 批量插入
)
```

批量处理可以将 100 次数据库插入减少为 10 次批量操作，显著降低网络往返开销。

### 6.4 并发度

`Stream.mapEffect` 支持 `concurrency` 参数控制并发度：

```typescript
Stream.fromIterable(data).pipe(
  Stream.mapEffect(processItem, { concurrency: 5 }),
)
```

与 `Effect.forEach` 的并发控制类似，适用于 I/O 密集的流处理。

### 6.5 Stream vs Array — 选择指南

| 场景 | 推荐 | 原因 |
|------|------|------|
| 纯计算、有限数据集 | Array (map/filter) | 无 Stream 开销 |
| I/O 密集、有限数据集 | Effect.forEach | 类型安全 + 并发控制 |
| 无限流、大数据集 | Stream | 惰性求值、背压控制 |
| 事件流、WebSocket | Stream | 天然的流式模型 |

---

## 七、微基准测试

### 7.1 基准测试原则

编写可靠的微基准测试需要遵循三个原则：

1. **预热（Warmup）** — 消除 JIT 编译影响。先运行几轮测试让 JIT 优化生效，然后再开始计时。
2. **多次迭代取平均** — 单次测量受系统噪音影响大。至少 5 轮，每轮数千次迭代。
3. **关注标准差** — 标准差大说明结果不稳定，需要更多迭代或排查环境噪音。

### 7.2 基准测试框架

一个最小但可靠的基准测试框架：

```typescript
const benchmark = (
  name: string,
  fn: () => void,
  iterations: number = 10_000,
  warmupRounds: number = 3,
) => {
  // 1. 预热
  for (let i = 0; i < warmupRounds; i++) {
    for (let j = 0; j < iterations / 10; j++) fn()
  }

  // 2. 正式测试 — 5 轮取平均
  const rounds = 5
  const times: number[] = []
  for (let round = 0; round < rounds; round++) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) fn()
    times.push(performance.now() - start)
  }

  const avgMs = times.reduce((a, b) => a + b, 0) / rounds
  const avgUs = (avgMs / iterations) * 1000
  return { avgUs, avgMs, iterations }
}
```

### 7.3 典型基准结果

以下是在典型开发机器上的相对性能参考（绝对值因硬件而异，关注相对比例）：

```
Effect.succeed(value)      ~0.05 μs/op   (基线)
Effect.sync(() => value)   ~0.10 μs/op   (2x)
Effect.fail(error)         ~0.08 μs/op   (1.6x)
Effect.gen (最小)           ~0.50 μs/op   (10x)
pipe + Effect.map           ~0.15 μs/op   (3x)

runSync(预构造 Effect)      ~1.0  μs/op
runSync(succeed(42))        ~2.0  μs/op   (创建+执行)
runSync(gen, 2×yield*)      ~5.0  μs/op   (gen + 2 yield*)

runPromise × 1,000          ~5-15 μs/op
原生 Promise.resolve        ~2-5  μs/op
开销比: runPromise / Promise ≈ 2-5x
```

### 7.4 先测量再优化

最重要的性能原则：**不要过早优化。**

```
1. 编写清晰、正确的代码
2. 测量（profile）找到真正的瓶颈
3. 只在瓶颈处优化
4. 重新测量验证优化效果
```

大多数情况下，Effect-TS 的类型安全和可组合性带来的开发效率提升，远大于微小的运行时开销。只有在确认性能瓶颈后，才考虑本章讨论的优化策略。

---

## 八、小结

### 核心要点

1. **Effect 创建开销极低**（< 1μs），日常开发无需担心
2. **flatMap vs gen** — 热路径用 flatMap，一般代码用 gen（可读性优先）
3. **Effect.all 并发** — I/O 密集场景最重要的优化，效果可达 N 倍提升
4. **Fiber 极轻量** — 可以安全创建数千个 Fiber
5. **Cache 避免重复计算** — 适用于数据库查询、API 调用、CPU 密集计算
6. **Stream 调优** — grouped 批量处理、buffer 控制背压、concurrency 控制并发
7. **先测量再优化** — 使用预热 + 多次平均的微基准测试方法

### 最佳实践

- I/O 任务无依赖时使用 `Effect.all` 并发执行
- 使用 `Effect.forEach` 的 `concurrency` 参数限制并发数
- 对重复计算使用 `Cache` 模块
- 使用 `Stream.grouped` 批量处理减少下游开销
- 大规模 fork 时使用 `Effect.scoped` 管理 Fiber 生命周期
- 编写基准测试时包含预热和多次平均
- 不要过早优化 — 先测量，找到瓶颈，再优化

### 下一章

第 16 章将介绍 Effect-TS 的内存管理，包括 Effect 对象的生命周期、Scope 与资源清理、以及避免内存泄漏的最佳实践。

---

## 参考

- [Effect-TS Cache 文档](https://effect.website/docs/io/cache)
- [Effect-TS Fiber 文档](https://effect.website/docs/concurrency/fiber)
- [Effect-TS Stream 文档](https://effect.website/docs/streaming/stream)
- [Effect-TS Effect 模块](https://effect.website/docs/io/effect)
