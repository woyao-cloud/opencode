# 第 10 章: Effect 模式集锦

## 1. 本章目标

完成本章学习后，你将能够：

- 使用 `Effect.retry` 和 `Schedule` 组合器实现各种重试策略（固定间隔、指数退避、抖动）
- 使用 `Effect.timeout` 和 `Effect.timeoutOrElse` 控制操作超时
- 使用 `Effect.race`、`Effect.raceAll`、`Effect.raceFirst` 实现竞态模式
- 使用 `Effect.forEach`、`Effect.all`、`Effect.partition` 处理批量操作
- 使用 `Effect.cached`、`Effect.cachedWithTTL` 实现缓存，使用 `Ref` 实现一次性操作

## 2. 前置知识

阅读本章前，你需要掌握：

- **第 2 章 (Effect 基础):** 理解 `Effect.gen`、`Effect.pipe`、`Effect.succeed`、`Effect.fail`、`Effect.sleep` 等基础操作
- **第 5 章 (错误处理):** 理解 `Effect.retry` 的基本用法和 `Schedule` 的概念

本章不要求了解 Schema、Layer、Stream 等高级概念。

## 3. 概念讲解

### 3.1 重试与调度 (Retry & Schedule)

在实际应用中，操作可能因为网络抖动、服务暂时不可用等原因而失败。Effect-TS 提供了 `Effect.retry` 和 `Schedule` 来处理这种情况。

#### Effect.retry 的两种形式

`Effect.retry` 有两种调用形式：

**形式一: 简单重试次数**

```typescript
Effect.retry({ times: 5 })
```

这是最简洁的形式，指定最多重试次数。每次重试之间没有等待间隔。

**形式二: 使用 Schedule 控制重试策略**

```typescript
Effect.retry(Schedule.recurs(5))
```

`Schedule` 是一个强大的调度描述符，它定义了"何时重试"以及"重试之间等待多久"。`Schedule.recurs(n)` 创建一个最多重试 n 次的计划。

#### Schedule 组合器

`Schedule` 是可组合的 — 你可以通过 `pipe` 将多个调度策略叠加：

| 组合器 | 行为 | 示例 |
|--------|------|------|
| `Schedule.recurs(1)` | 只重试一次 | `Effect.retry(Schedule.recurs(1))` |
| `Schedule.recurs(n)` | 最多重试 n 次 | `Effect.retry(Schedule.recurs(3))` |
| `Schedule.spaced(d)` | 固定间隔重试 | `Schedule.spaced(Duration.millis(100))` |
| `Schedule.exponential(d)` | 指数退避（每次翻倍） | `Schedule.exponential(Duration.millis(100))` |
| `Schedule.jittered` | 在间隔上添加随机偏移 | `Schedule.exponential(d).pipe(Schedule.jittered)` |
| `Schedule.andThen(s)` | 组合两个调度策略 | `Schedule.exponential(d).pipe(Schedule.andThen(Schedule.recurs(3)))` |

**指数退避 (Exponential Backoff):** 每次重试的等待时间呈指数增长。例如 `exponential(100ms)` 产生 100ms、200ms、400ms、800ms... 的等待序列。这是处理服务过载的推荐策略。

**抖动 (Jitter):** 在退避间隔上添加随机偏移，避免多个客户端同时重试造成"惊群效应"（thundering herd problem）。

### 3.2 超时与竞态 (Timeout & Race)

#### 超时控制

`Effect.timeout` 为 Effect 设置一个时间上限。如果操作在指定时间内未完成，Effect 会失败：

```typescript
Effect.timeout(Duration.millis(100))
```

`Effect.timeoutOrElse` 在超时时不直接失败，而是执行一个降级 Effect：

```typescript
Effect.timeoutOrElse({
  duration: Duration.millis(100),
  orElse: () => Effect.succeed("降级数据"),
})
```

#### 竞态模式

竞态模式用于从多个 Effect 中取最快的结果：

| 函数 | 行为 | 适用场景 |
|------|------|----------|
| `Effect.race(a, b)` | 取第一个**成功**的结果；如果第一个失败，等待第二个 | 主备切换 |
| `Effect.raceAll([a, b, c])` | 从多个 Effect 中取第一个成功的结果 | 多数据源 |
| `Effect.raceFirst(a, b)` | 取第一个**完成**的结果（无论成功或失败） | 最快响应 |

**race vs raceFirst 的关键区别:**

- `race`: 如果第一个完成的 Effect 失败了，它会等待下一个成功的 Effect。只有所有 Effect 都失败时，race 才失败。
- `raceFirst`: 第一个完成的 Effect 决定了结果 — 如果它失败了，raceFirst 立即失败，不会等待其他 Effect。

### 3.3 批量操作 (Batch Operations)

Effect-TS 提供了多种批量处理模式，适用于不同的场景：

#### Effect.forEach — 遍历执行

`Effect.forEach` 对数组中的每个元素执行一个 Effect，并收集所有结果：

```typescript
Effect.forEach(items, (item) => processItem(item))
```

通过 `{ concurrency: "unbounded" }` 或 `{ concurrency: 3 }` 控制并发度。

#### Effect.all — 并行执行

`Effect.all` 将多个 Effect 组合为一个，并行执行：

```typescript
// 数组形式
Effect.all([e1, e2, e3])

// 对象形式（保留字段名）
Effect.all({ user: fetchUser(), age: fetchAge() })
```

#### 部分失败容忍

| 函数 | 行为 | 结果类型 |
|------|------|----------|
| `Effect.partition(items, fn)` | 分离失败和成功 | `[Array<E>, Array<A>]` |

`partition` 是最灵活的部分失败处理方式 — 它返回一个元组 `[失败数组, 成功数组]`，让你可以分别处理成功和失败的情况。

### 3.4 缓存与一次性操作 (Cache & Once)

#### Effect.cached — 永久缓存

`Effect.cached` 将 Effect 包装为缓存版本。注意它返回 `Effect<Effect<A>>`（嵌套 Effect）— 外层 Effect 创建缓存基础设施，内层 Effect 是实际的缓存计算。需要先运行外层获取内层，然后多次运行内层：

```typescript
const cachedOuter = expensiveEffect.pipe(Effect.cached)
// cachedOuter: Effect<Effect<A>>

// 先运行外层获取内层
const cachedInner = Effect.runSync(cachedOuter)
// 然后多次运行内层
Effect.runPromise(cachedInner) // 第一次: 实际计算
Effect.runPromise(cachedInner) // 后续: 返回缓存
```

#### Effect.cachedWithTTL — 带过期时间的缓存

`Effect.cachedWithTTL` 在缓存上添加了过期时间。TTL 过期后，下一次调用会重新执行计算。同样返回嵌套 Effect：

```typescript
const cachedOuter = expensiveEffect.pipe(
  Effect.cachedWithTTL(Duration.seconds(60))
)
// 先运行外层获取内层，然后多次运行内层
```

#### 使用 Ref 实现"只执行一次"

`Effect.once` 在 4.0.0-beta.65 中不可用。可以使用 `Ref` 手动实现"只执行一次"语义：

```typescript
import { Effect, Ref } from "effect"

const ref = Effect.runSync(Ref.make(false))

const safeInit = Ref.getAndSet(ref, true).pipe(
  Effect.flatMap((already) => {
    if (already) {
      return Effect.succeed("已初始化（跳过）")
    }
    return doInit
  }),
)
```

## 4. 代码示例

### 4.1 重试与调度策略

```typescript
import { Effect, Schedule, Duration } from "effect"

// 简单重试: 最多重试 5 次
const program1 = unstableService.pipe(
  Effect.retry({ times: 5 }),
)

// 指数退避: 100ms → 200ms → 400ms，最多 3 次
const program2 = unstableService.pipe(
  Effect.retry(
    Schedule.exponential(Duration.millis(100)).pipe(
      Schedule.andThen(Schedule.recurs(3)),
    ),
  ),
)

// 抖动退避: 指数退避 + 随机偏移
const program3 = unstableService.pipe(
  Effect.retry(
    Schedule.exponential(Duration.millis(50)).pipe(
      Schedule.jittered,
      Schedule.andThen(Schedule.recurs(3)),
    ),
  ),
)
```

### 4.2 超时与竞态

```typescript
import { Effect, Duration } from "effect"

// 超时控制
const withTimeout = slowOp.pipe(
  Effect.timeout(Duration.millis(100)),
)

// 超时降级
const withFallback = slowOp.pipe(
  Effect.timeoutOrElse({
    duration: Duration.millis(100),
    orElse: () => Effect.succeed("使用缓存"),
  }),
)

// 两个 Effect 竞态
const winner = Effect.race(fastOp, slowOp)

// 多个 Effect 竞态
const fastest = Effect.raceAll([sourceA, sourceB, sourceC])

// 取第一个完成的
const first = Effect.raceFirst(failFast, succeedSlow)
```

### 4.3 批量操作

```typescript
import { Effect } from "effect"

// 遍历执行
const results = Effect.forEach(items, (n) => process(n))

// 并发遍历
const concurrent = Effect.forEach(items, (n) => process(n), {
  concurrency: "unbounded",
})

// 并行执行多个 Effect
const all = Effect.all([e1, e2, e3])

// 控制并发度
const limited = Effect.all(tasks, { concurrency: 3 })

// 分离失败和成功（partition 返回 [failures, successes]）
const [errors, oks] = Effect.partition(items, validate, {
  concurrency: "unbounded",
})
```

### 4.4 缓存与一次性操作

```typescript
import { Effect, Duration, Ref } from "effect"

// 永久缓存（返回嵌套 Effect，需先获取内层）
const cachedOuter = expensiveCompute.pipe(Effect.cached)
const cachedInner = Effect.runSync(cachedOuter)
// 然后多次运行 cachedInner

// 带 TTL 的缓存
const ttlOuter = expensiveCompute.pipe(
  Effect.cachedWithTTL(Duration.seconds(60)),
)
const ttlInner = Effect.runSync(ttlOuter)

// 使用 Ref 实现只执行一次
const ref = Effect.runSync(Ref.make(false))
const safeInit = Ref.getAndSet(ref, true).pipe(
  Effect.flatMap((already) => {
    if (already) return Effect.succeed("已初始化（跳过）")
    return doInit
  }),
)
```

## 5. 常见陷阱

### 5.1 重试陷阱

**陷阱 1: 忘记限制重试次数**

```typescript
// 错误: 无限重试（除非 Schedule 本身有限制）
Effect.retry(Schedule.exponential(Duration.millis(100)))

// 正确: 限制重试次数
Effect.retry(
  Schedule.exponential(Duration.millis(100)).pipe(
    Schedule.andThen(Schedule.recurs(5)),
  ),
)
```

**陷阱 2: 重试幂等性假设**

重试只有在操作是**幂等**的（多次执行与一次执行效果相同）时才安全。对于非幂等操作（如创建订单），重试可能导致重复执行。

**陷阱 3: 重试副作用**

如果 Effect 包含副作用（如日志、计数器），重试会导致这些副作用重复执行。使用 `Effect.tap` 进行副作用观察时要注意这一点。

### 5.2 超时陷阱

**陷阱 1: 超时后资源泄漏**

`Effect.timeout` 在超时时会中断（interrupt）原 Effect，但原 Effect 可能已经分配了资源（如数据库连接、文件句柄）。确保使用 `Scope` 或 `Effect.acquireRelease` 来正确释放资源。

**陷阱 2: 超时时间过短**

设置过短的超时时间会导致正常操作被误判为超时。建议根据实际操作的 P99 延迟来设置超时时间。

### 5.3 竞态陷阱

**陷阱 1: 混淆 race 和 raceFirst**

```typescript
// race: 第一个失败时等待下一个成功
Effect.race(failFast, succeedSlow) // → "慢速成功"

// raceFirst: 第一个完成就返回（可能是失败）
Effect.raceFirst(failFast, succeedSlow) // → 失败
```

**陷阱 2: 竞态中的资源泄漏**

与超时类似，竞态中的"输家"会被中断，但可能已经分配了资源。使用 `Effect.acquireRelease` 确保资源释放。

### 5.4 缓存陷阱

**陷阱 1: 缓存过期后并发请求**

`Effect.cachedWithTTL` 在缓存过期后，第一个请求会重新计算。但如果多个请求同时到达，它们可能都触发重新计算。使用 `Effect.cached` 或手动加锁来避免。

**陷阱 2: 缓存与可变状态**

缓存不可变数据是安全的。如果缓存的数据可能被外部修改，需要设置合理的 TTL 或使用失效机制。

## 6. 模式选择指南

| 场景 | 推荐模式 | 原因 |
|------|----------|------|
| 网络请求失败重试 | 指数退避 + 抖动 + 最大重试次数 | 减少服务压力，避免惊群效应 |
| 服务降级 | `timeoutOrElse` + 缓存降级 | 快速失败，提供备用数据 |
| 多数据源获取 | `raceAll` | 取最快的数据源 |
| 批量数据处理 | `partition` + 并发控制 | 容忍部分失败，控制资源使用 |
| 配置加载 | `cached` | 配置通常不变，永久缓存 |
| 初始化操作 | `once` | 确保只执行一次 |
| 数据库查询缓存 | `cachedWithTTL` | 数据可能更新，需要过期 |
| 主备切换 | `race` | 主服务失败时自动切换到备用 |

## 7. 本章总结

### 核心概念

1. **重试与调度:** `Effect.retry` + `Schedule` 组合器提供了从简单重试到复杂退避策略的完整解决方案。`Schedule` 是可组合的，你可以通过 `pipe` 叠加多个策略。

2. **超时与竞态:** `Effect.timeout` 和 `Effect.timeoutOrElse` 控制操作的时间边界。`Effect.race`、`Effect.raceAll`、`Effect.raceFirst` 实现了从多个操作中取最快结果的模式。

3. **批量操作:** `Effect.forEach`、`Effect.all`、`Effect.partition` 覆盖了从顺序遍历到并发批处理、从全有全无到部分失败容忍的各种场景。

4. **缓存与一次性操作:** `Effect.cached`、`Effect.cachedWithTTL` 提供了声明式缓存能力，`Ref` 可用于实现"只执行一次"语义。

### 关键区别

| 模式 | 函数 | 失败时行为 | 适用场景 |
|------|------|------------|----------|
| 重试 | `retry({times: n})` | 重试耗尽后失败 | 简单重试 |
| 重试 | `retry(schedule)` | 按调度策略重试 | 复杂重试策略 |
| 超时 | `timeout(d)` | 超时后失败 | 硬性时间限制 |
| 超时 | `timeoutOrElse(...)` | 超时后执行降级 | 优雅降级 |
| 竞态 | `race(a, b)` | 等待下一个成功 | 主备切换 |
| 竞态 | `raceAll([...])` | 全部失败才失败 | 多数据源 |
| 竞态 | `raceFirst(a, b)` | 第一个失败就失败 | 最快响应 |
| 批量 | `all([...])` | 任一失败则整体失败 | 全有全无 |
| 批量 | `partition(items, fn)` | 分离失败和成功 | 分别处理 |
| 缓存 | `cached` | 永久缓存（返回嵌套 Effect） | 不变数据 |
| 缓存 | `cachedWithTTL(...)` | TTL 过期后重新计算 | 可变数据 |
| 一次性 | `Ref` + `flatMap` | 只执行一次 | 初始化 |

### 下一步学习

- **第 11 章 (Fiber):** 深入理解竞态和超时的底层实现机制 — Fiber 中断和 Join
- **第 12 章 (Stream):** 学习流式数据处理中的重试和批量操作
- **第 13 章 (Queue & Deferred):** 学习更高级的并发原语，实现自定义的缓存和调度策略
