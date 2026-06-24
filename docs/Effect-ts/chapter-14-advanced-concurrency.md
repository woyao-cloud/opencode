# 第 14 章：高级并发原语

## 一、本章概述

在第 11 章（Fiber）中，我们学习了如何创建和管理并发执行单元。第 13 章（Queue & Deferred）介绍了异步数据传递和一次性信号协调。本章将深入 Effect-TS 中更加高级的并发原语：

1. **SynchronizedRef** — 并发安全的可变引用，基于 Semaphore 实现原子操作
2. **Latch** — 一次性并发门闩，用于 Fiber 间的启动/停止协调
3. **FiberMap** — 键值索引的 Fiber 集合，自动管理 Fiber 生命周期
4. **ScopedCache** — 带作用域的异步缓存，支持 TTL 过期和容量限制
5. **PubSub** — 发布-订阅消息系统，支持多种背压策略

### 前置知识

- 第 2 章 Effect 基础：理解 `Effect`、`Effect.gen`、`Effect.runPromise`
- 第 6 章 Scope：理解 `Scope`、`Effect.scoped`、资源生命周期管理
- 第 11 章 Fiber：理解 `Effect.forkDetach`、`Fiber.join`、结构化并发
- 第 13 章 Queue & Deferred：理解 Queue 背压策略、Deferred 信号机制

### 示例代码

所有示例位于 `docs/Effect-ts/demos/ch14-advanced-concurrency/src/`，可直接运行：

```bash
cd docs/Effect-ts/demos/ch14-advanced-concurrency
bun install
bun run demo:syncref    # SynchronizedRef
bun run demo:latch      # Latch
bun run demo:fibermap   # FiberMap
bun run demo:cache      # ScopedCache
bun run demo:pubsub     # PubSub
```

---

## 二、SynchronizedRef — 并发安全的可变引用

### 2.1 为什么需要 SynchronizedRef

普通的 `Ref` 不保证并发安全。当多个 Fiber 同时读写同一个 `Ref` 时，会出现竞态条件：

```
┌──────────────────────────────────────────────────────────┐
│                    Ref 的并发问题                          │
│                                                          │
│  Fiber A: get(ref) → 0                                   │
│  Fiber B: get(ref) → 0                                   │
│  Fiber A: set(ref, 1)                                    │
│  Fiber B: set(ref, 1)                                    │
│                                                          │
│  期望: 递增两次 → 2                                       │
│  实际: 两次都读到 0，都设为 1 → 结果 = 1（丢失一次更新）    │
└──────────────────────────────────────────────────────────┘
```

`SynchronizedRef` 内部使用 `Semaphore` 保证所有操作的原子性。每次读写操作都会先获取信号量，完成后释放，保证同一时间只有一个 Fiber 在操作该引用。

### 2.2 基本操作

```typescript
import { Effect, SynchronizedRef, Console } from "effect"

const program = Effect.gen(function* () {
  // make — 创建受保护的引用
  const ref = yield* SynchronizedRef.make(0)

  // get — 读取当前值
  const value = yield* SynchronizedRef.get(ref)

  // set — 设置新值
  yield* SynchronizedRef.set(ref, 42)
})
```

### 2.3 原子更新操作

SynchronizedRef 提供了一套完整的原子更新操作族，每种都有 `_Effect` 变体（允许在更新函数中执行副作用）：

| 操作 | 说明 | 返回值 |
|------|------|--------|
| `update` | 原子地应用纯函数 | `void` |
| `updateAndGet` | 更新并返回新值 | 新值 |
| `getAndUpdate` | 返回旧值并更新 | 旧值 |
| `modify` | 原子地修改并返回任意类型 | 自定义结果 |

```typescript
const ref = yield* SynchronizedRef.make(10)

// update — 原子更新，不返回旧值
yield* SynchronizedRef.update(ref, (n) => n + 5)

// updateAndGet — 更新并返回新值
const newVal = yield* SynchronizedRef.updateAndGet(ref, (n) => n * 2)

// getAndUpdate — 返回旧值再更新
const oldVal = yield* SynchronizedRef.getAndUpdate(ref, (n) => n + 100)

// modify — 原子修改并返回自定义结果
const result = yield* SynchronizedRef.modify(ref, (n) => {
  const doubled = n * 2
  return [`n=${n}, doubled=${doubled}`, n + 1]
})
```

### 2.4 多 Fiber 并发安全

```typescript
const ref = yield* SynchronizedRef.make(0)

// 10 个 Fiber 同时递增 100 次
const increment = (id: number) =>
  Effect.forEach(
    Array.from({ length: 100 }),
    () => SynchronizedRef.update(ref, (n) => n + 1),
  )

const fibers = yield* Effect.all(
  Array.from({ length: 10 }, (_, i) => Effect.forkDetach(increment(i))),
)

// 等待所有 Fiber 完成
yield* Effect.all(fibers.map((f) => Fiber.join(f)))

const final = yield* SynchronizedRef.get(ref)
// 输出: 1000（原子操作保证结果正确）
```

### 2.5 modifyEffect — 带副作用的原子操作

```typescript
const ref = yield* SynchronizedRef.make<number[]>([])

// modifyEffect 允许在原子操作中执行 Effect
const result = yield* SynchronizedRef.modifyEffect(ref, (arr) =>
  Effect.gen(function* () {
    const newItem = arr.length + 1
    yield* Console.log(`添加元素: ${newItem}`)
    return [`已添加 ${newItem}`, [...arr, newItem]]
  }),
)
```

---

## 三、Latch — 并发门闩

### 3.1 概念

Latch 是一个可以开关的"门"，用于协调多个 Fiber 的执行时机：

```
┌──────────────────────────────────────────┐
│              Latch 工作模型                │
│                                          │
│  ┌────┐  await  ┌────┐  await  ┌────┐   │
│  │ F1 │ ──────→ │    │ ←────── │ F2 │   │
│  └────┘         │ 🚪 │         └────┘   │
│                  │    │                  │
│  ┌────┐  await  │    │         ┌────┐   │
│  │ F3 │ ──────→ │    │  open   │ F4 │   │
│  └────┘         └────┘ ←────── └────┘   │
│                                          │
│  所有等待者阻塞 → open → 全部释放         │
└──────────────────────────────────────────┘
```

### 3.2 核心操作

```typescript
import { Effect, Latch } from "effect"

const program = Effect.gen(function* () {
  // make(open?) — 创建门闩，默认关闭
  const latch = yield* Latch.make(false)

  // await — 等待门打开（如果门已打开则立即返回）
  yield* Latch.await(latch)

  // open — 打开门，释放所有等待者
  yield* Latch.open(latch)

  // close — 关闭门
  yield* Latch.close(latch)

  // release — 释放等待者但保持门的状态
  yield* Latch.release(latch)
})
```

### 3.3 多等待者广播

```typescript
const latch = yield* Latch.make(false)

// 创建 5 个等待者
const waiters = yield* Effect.all(
  Array.from({ length: 5 }, (_, i) =>
    Effect.forkDetach(
      Effect.gen(function* () {
        yield* Latch.await(latch)
        Console.log(`worker-${i} 收到信号！`)
      }),
    ),
  ),
)

// 一次 open，释放所有等待者
yield* Latch.open(latch)
yield* Effect.all(waiters.map((f) => Fiber.join(f)))
```

### 3.4 whenOpen — 条件执行

```typescript
const latch = yield* Latch.make(false)

// whenOpen — 仅在门打开时执行 Effect
const action = Latch.whenOpen(
  latch,
  Effect.succeed("只有在门打开时我才执行"),
)

// 门关闭时 action 会阻塞，门打开后才执行
```

### 3.5 实用模式：优雅关闭

```typescript
const shutdownLatch = yield* Latch.make(false)

// 后台服务循环
const server = Effect.gen(function* () {
  while (true) {
    // 检查是否收到关闭信号
    const signal = yield* Latch.await(shutdownLatch).pipe(
      Effect.timeoutOption("50 millis"),
    )
    if (Option.isSome(signal)) {
      // 执行清理逻辑
      break
    }
    // 正常业务逻辑...
  }
})

// 外部触发关闭
yield* Latch.open(shutdownLatch)
```

---

## 四、FiberMap — 可索引的 Fiber 集合

### 4.1 概念

FiberMap 是一个键值索引的 Fiber 集合。当关联的 Scope 关闭时，所有 Fiber 会被自动中断。Fiber 完成后自动从集合中移除。

```
┌──────────────────────────────────────────────┐
│                 FiberMap<K>                   │
│                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
│  │ key: a  │  │ key: b  │  │ key: c  │      │
│  │ Fiber A │  │ Fiber B │  │ Fiber C │      │
│  └────┬────┘  └────┬────┘  └────┬────┘      │
│       │            │            │            │
│       ▼            ▼            ▼            │
│  Scope 关闭 → 所有 Fiber 被中断              │
│  Fiber 完成 → 自动从集合移除                 │
└──────────────────────────────────────────────┘
```

**OpenCode 参考：** `packages/opencode/src/control-plane/workspace.ts` 使用 FiberMap 管理每个 workspace 的同步 Fiber：

```typescript
// OpenCode 中的实际使用
const syncFibers = yield* FiberMap.make<WorkspaceID, void, SyncLoopError>()
```

### 4.2 基本操作

```typescript
import { Effect, FiberMap, Fiber } from "effect"

const program = Effect.gen(function* () {
  // make<K>() — 创建键值索引的 Fiber 集合（需要 Scope）
  const map = yield* FiberMap.make<string>()

  // run — 启动 Effect 并将 Fiber 加入集合
  const fiber1 = yield* FiberMap.run(map, "task-1", Effect.succeed("Hello"))
  const fiber2 = yield* FiberMap.run(map, "task-2", Effect.succeed("World"))

  // 等待结果
  const r1 = yield* Fiber.join(fiber1)
  const r2 = yield* Fiber.join(fiber2)
})
```

### 4.3 手动管理 Fiber

```typescript
// set — 将已有 Fiber 加入集合
const fiber = yield* Effect.forkDetach(someEffect)
yield* FiberMap.set(map, "manual-task", fiber)

// get — 查询指定 key 的 Fiber（返回 Option）
const found = yield* FiberMap.get(map, "manual-task")

// remove — 移除并中断指定 Fiber
yield* FiberMap.remove(map, "manual-task")

// clear — 移除并中断所有 Fiber
yield* FiberMap.clear(map)

// size — 获取集合中的 Fiber 数量
const count = yield* FiberMap.size(map)
```

### 4.4 等待完成

```typescript
// awaitEmpty — 等待集合变为空（所有 Fiber 完成）
yield* FiberMap.awaitEmpty(map)

// join — 等待所有 Fiber 完成，遇到失败则传播错误
yield* FiberMap.join(map)
```

### 4.5 Scope 自动清理

```typescript
// FiberMap 与 Scope 绑定，Scope 关闭时自动中断所有 Fiber
yield* Effect.scoped(
  Effect.gen(function* () {
    const map = yield* FiberMap.make<string>()

    // 启动永不结束的 Fiber
    yield* FiberMap.run(map, "infinite", Effect.never)

    // Scope 退出时，所有 Fiber 自动被中断
  }),
)
```

### 4.6 makeRuntime — 运行时执行函数

```typescript
// makeRuntime 返回一个函数，可以直接用 key 启动 Effect
const run = yield* FiberMap.makeRuntime<never, string>()

// 使用返回的函数启动任务，返回 Fiber
const fiber1 = run("job-a", Effect.succeed("result-a"))
const fiber2 = run("job-b", Effect.succeed("result-b"))

const r1 = yield* Fiber.join(fiber1)
const r2 = yield* Fiber.join(fiber2)
```

---

## 五、ScopedCache — 带作用域的异步缓存

### 5.1 概念

ScopedCache 是一个绑定到 Scope 的异步缓存，提供以下能力：

- **自动获取**：通过 `lookup` 函数自动获取未缓存的值
- **TTL 过期**：支持基于时间的自动过期
- **容量限制**：防止无限增长
- **手动管理**：支持 invalidate / refresh 操作
- **Scope 清理**：Scope 关闭时所有缓存条目被清理

### 5.2 基本用法

```typescript
import { Effect, ScopedCache } from "effect"

const program = Effect.gen(function* () {
  const cache = yield* ScopedCache.make<number, string>({
    // lookup — 缓存未命中时调用的获取函数
    lookup: (key: number) =>
      Effect.succeed(`value-for-${key}`),
    // capacity — 最大缓存条目数
    capacity: 100,
    // timeToLive — TTL 过期时间（可选）
    timeToLive: "5 minutes",
  })

  // get — 获取值（自动触发 lookup）
  const value = yield* ScopedCache.get(cache, 42)
})
```

### 5.3 手动管理缓存

```typescript
// set — 手动设置值（跳过 lookup）
yield* ScopedCache.set(cache, 1, "手动设置的值")

// has — 检查 key 是否存在
const exists = yield* ScopedCache.has(cache, 1)

// refresh — 强制重新调用 lookup 获取新值
const fresh = yield* ScopedCache.refresh(cache, 1)

// invalidate — 使单个 key 失效
yield* ScopedCache.invalidate(cache, 2)

// invalidateAll — 使所有缓存失效
yield* ScopedCache.invalidateAll(cache)
```

### 5.4 遍历缓存

```typescript
// keys — 获取所有有效 key
const keys = yield* ScopedCache.keys(cache)

// values — 获取所有有效值
const values = yield* ScopedCache.values(cache)

// entries — 获取所有键值对
const entries = yield* ScopedCache.entries(cache)

// size — 获取当前条目数
const count = yield* ScopedCache.size(cache)
```

### 5.5 TTL 时间过期

```typescript
const cache = yield* ScopedCache.make<number, string>({
  lookup: (key) => Effect.succeed(`value-${key}`),
  capacity: 100,
  timeToLive: "200 millis", // 200ms 后过期
})

// 第一次获取 — 触发 lookup
const v1 = yield* ScopedCache.get(cache, 1)

// 立即再获取 — 命中缓存
const v2 = yield* ScopedCache.get(cache, 1)

// 等待 TTL 过期
yield* Effect.sleep("250 millis")

// 过期后再获取 — 触发 lookup
const v3 = yield* ScopedCache.get(cache, 1)
```

### 5.6 实战模式：API 响应缓存

```typescript
const cache = yield* ScopedCache.make<string, string>({
  lookup: (url: string) =>
    Effect.gen(function* () {
      yield* Effect.sleep("50 millis") // 模拟网络延迟
      return `Response from ${url}`
    }),
  capacity: 1000,
  timeToLive: "5 minutes",
})

// 第一次请求 — 触发 API 调用
const r1 = yield* ScopedCache.get(cache, "/api/users")

// 第二次请求 — 命中缓存，无网络开销
const r2 = yield* ScopedCache.get(cache, "/api/users")

// 主动刷新 — 强制更新
const r3 = yield* ScopedCache.refresh(cache, "/api/users")
```

---

## 六、PubSub — 发布-订阅消息系统

### 6.1 概念

PubSub 是一个异步消息总线，支持多对多通信模式：

```
┌──────────────────────────────────────────────────────┐
│                     PubSub<A>                         │
│                                                      │
│  ┌──────────┐                    ┌──────────────┐    │
│  │ Publisher │ ── publish(msg) ─→│              │    │
│  └──────────┘                    │              │    │
│  ┌──────────┐                    │   Message    │    │
│  │ Publisher │ ── publish(msg) ─→│    Hub       │    │
│  └──────────┘                    │              │    │
│                                  │              │    │
│                    subscribe ──→ │              │    │
│                    ←── take() ── │              │    │
│                                  └──────────────┘    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │ Subscriber │  │ Subscriber │  │ Subscriber │     │
│  └────────────┘  └────────────┘  └────────────┘     │
│                                                      │
│  每个订阅者都能收到所有发布的消息（广播模式）          │
└──────────────────────────────────────────────────────┘
```

### 6.2 基本用法

```typescript
import { Effect, PubSub } from "effect"

const program = Effect.gen(function* () {
  // bounded — 创建有界 PubSub
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
    }),
  )
})
```

### 6.3 四种策略

PubSub 支持与 Queue 相同的四种背压策略：

| 策略 | 构造器 | 满时行为 |
|------|--------|----------|
| Bounded (背压) | `PubSub.bounded(n)` | 发布者挂起，等待空间 |
| Unbounded (无界) | `PubSub.unbounded()` | 永不阻塞，可能无限增长 |
| Sliding (滑动) | `PubSub.sliding(n)` | 丢弃最旧消息 |
| Dropping (丢弃) | `PubSub.dropping(n)` | 丢弃新消息，publish 返回 false |

```typescript
// sliding — 丢弃旧消息，保留最新的
const slidingPubsub = yield* PubSub.sliding<string>(2)
yield* PubSub.publish(slidingPubsub, "old-1")
yield* PubSub.publish(slidingPubsub, "old-2")
yield* PubSub.publish(slidingPubsub, "new-1") // "old-1" 被丢弃

// dropping — 丢弃新消息
const droppingPubsub = yield* PubSub.dropping<string>(2)
yield* PubSub.publish(droppingPubsub, "keep-1")
yield* PubSub.publish(droppingPubsub, "keep-2")
const dropped = yield* PubSub.publish(droppingPubsub, "dropped")
// dropped === false
```

### 6.4 批量消费

```typescript
// takeAll — 获取所有可用消息（至少 1 条，否则阻塞）
const all = yield* PubSub.takeAll(sub)

// takeUpTo — 最多获取 N 条（不阻塞）
const upTo3 = yield* PubSub.takeUpTo(sub, 3)

// takeBetween — 获取 min~max 条（不够 min 则阻塞）
const between = yield* PubSub.takeBetween(sub, 2, 5)
```

### 6.5 状态查询

```typescript
// capacity — 获取容量
const cap = PubSub.capacity(pubsub)

// size — 当前消息数
const sz = yield* PubSub.size(pubsub)

// isEmpty / isFull — 空/满检查
const empty = yield* PubSub.isEmpty(pubsub)
const full = yield* PubSub.isFull(pubsub)
```

### 6.6 多订阅者广播

```typescript
const pubsub = yield* PubSub.bounded<string>(10)

// 3 个订阅者
const sub1 = yield* PubSub.subscribe(pubsub)
const sub2 = yield* PubSub.subscribe(pubsub)
const sub3 = yield* PubSub.subscribe(pubsub)

// 发布一条消息
yield* PubSub.publish(pubsub, "广播消息")

// 每个订阅者都能收到
const m1 = yield* PubSub.take(sub1) // "广播消息"
const m2 = yield* PubSub.take(sub2) // "广播消息"
const m3 = yield* PubSub.take(sub3) // "广播消息"
```

---

## 七、原语对比与选择

### 7.1 功能对比

| 原语 | 用途 | Scope 绑定 | 并发安全 | 适用场景 |
|------|------|-----------|----------|----------|
| SynchronizedRef | 原子可变状态 | 否 | 是 | 计数器、共享状态 |
| Latch | 一次性协调 | 否 | 是 | 启动同步、优雅关闭 |
| FiberMap | Fiber 集合管理 | 是 | 是 | 任务追踪、批量管理 |
| ScopedCache | 异步缓存 | 是 | 是 | API 缓存、资源缓存 |
| PubSub | 消息广播 | 否 | 是 | 事件总线、消息分发 |

### 7.2 选择指南

```
需要原子地修改共享状态？
├── 是 → SynchronizedRef
│   ├── 只需读/写 → Ref（不需要并发安全时）
│   └── 多 Fiber 并发读写 → SynchronizedRef
│
需要协调多个 Fiber 的启动/停止？
├── 是 → Latch
│   ├── 一次性信号 → Deferred（第 13 章）
│   └── 可重复开关 → Latch
│
需要管理一组 Fiber 的生命周期？
├── 是 → FiberMap
│   ├── 无索引 → FiberSet（未在本章介绍）
│   └── 键值索引 → FiberMap
│
需要缓存异步计算结果？
├── 是 → ScopedCache
│   ├── 简单缓存 → 手动 Map + Ref
│   └── TTL + 容量 + Scope → ScopedCache
│
需要多对多消息通信？
├── 是 → PubSub
│   ├── 点对点 → Queue（第 13 章）
│   └── 广播 → PubSub
```

---

## 八、与 OpenCode 的关联

### 8.1 FiberMap + Stream（workspace.ts）

OpenCode 在 `packages/opencode/src/control-plane/workspace.ts` 中使用 FiberMap 管理每个 workspace 的同步 Fiber：

```typescript
import { Effect, FiberMap, Stream } from "effect"

// 创建 FiberMap 用于管理同步 Fiber
const syncFibers = yield* FiberMap.make<WorkspaceID, void, SyncLoopError>()

// 每个 workspace 一个同步循环
FiberMap.run(syncFibers, workspaceID, syncLoop)
```

这种模式确保：
- 每个 workspace 的同步循环独立运行
- workspace 删除时对应的 Fiber 自动中断
- 应用关闭时（Scope 关闭）所有同步 Fiber 统一清理

### 8.2 PubSub 事件总线

OpenCode 内部使用 PubSub 类似模式进行事件分发（`BusEvent`），实现了模块间解耦的消息通信。

---

## 九、小结

本章介绍了 Effect-TS 中五个高级并发原语：

1. **SynchronizedRef** — 用 Semaphore 保证原子性的可变引用，解决多 Fiber 竞态问题
2. **Latch** — 可开关的并发门闩，适合启动同步和优雅关闭场景
3. **FiberMap** — Scope 绑定的键值 Fiber 集合，自动管理 Fiber 生命周期
4. **ScopedCache** — 带 TTL 和容量限制的异步缓存，自动管理资源清理
5. **PubSub** — 支持多策略的多对多消息广播系统

这些原语构建在 Fiber、Queue、Deferred 之上，形成了 Effect-TS 并发编程的完整工具体系。
