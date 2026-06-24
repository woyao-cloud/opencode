# 第 12 章：Stream 响应式数据处理

## 一、本章概述

在 Effect-TS 中，`Effect` 处理的是**单个值**的计算，而 `Stream` 处理的是**多个值**的异步数据流。Stream 是 Effect-TS 的响应式编程核心抽象，它结合了：

1. **响应式** — 数据随时间推移而到达，消费者按需拉取
2. **背压** — 消费者驱动，生产者不会压垮消费者
3. **组合性** — 丰富的操作符（map/filter/merge/zip 等）可以链式组合
4. **类型安全** — 元素类型 `A`、错误类型 `E`、环境需求 `R` 都在类型中体现

### Stream 与 Effect 的对比

| 特性 | Effect | Stream |
|------|--------|--------|
| 值数量 | 一个 | 多个（零到无穷） |
| 求值策略 | 立即执行 | 惰性拉取（pull-based） |
| 背压 | 不适用 | 内置背压 |
| 错误处理 | `Effect<A, E, R>` | `Stream<A, E, R>` |
| 消费方式 | `runPromise` | `runCollect` / `runForEach` / `runFold` 等 |

### 前置知识

- 第 2 章 Effect 基础：理解 `Effect`、`Effect.gen`、`Effect.runPromise`
- 第 11 章 Fiber：理解 `Effect.forkScoped`、`Fiber.join`、结构化并发

### 示例代码

所有示例位于 `docs/Effect-ts/demos/ch12-stream/src/`，可直接运行：

```bash
cd docs/Effect-ts/demos/ch12-stream
bun install
bun run demo:create       # 创建 Stream
bun run demo:transform    # 转换 Stream
bun run demo:consume      # 消费 Stream
bun run demo:merge        # 合并与分流
bun run demo:backpressure # 背压机制
```

---

## 二、核心概念

### 2.1 什么是 Stream

`Stream<A, E, R>` 是一个描述**多值异步计算**的程序类型：

- **A** — 发射的元素类型
- **E** — 可能发生的错误类型
- **R** — 执行所需的环境依赖

Stream 的核心设计理念是 **pull-based**（拉取模型）：消费者主动拉取数据，生产者按需生成。这与 RxJS 的 push-based（推送模型）形成鲜明对比。

```
Push-based (RxJS):    生产者 →→→→→ 消费者（消费者被动接收）
Pull-based (Effect):  生产者 ←←←←← 消费者（消费者主动拉取）
```

### 2.2 拉取模型 vs 推送模型

```
┌──────────────────────────────────────────────────────────────┐
│                    Stream 拉取模型                            │
│                                                              │
│  消费者（下游）                   生产者（上游）              │
│  ┌──────────┐                    ┌──────────┐                │
│  │          │ ── 请求下一个 ──→  │          │                │
│  │          │ ←── 返回数据 ────  │          │                │
│  │          │ ── 请求下一个 ──→  │          │                │
│  │          │ ←── 返回数据 ────  │          │                │
│  │          │ ── 请求下一个 ──→  │          │                │
│  │          │ ←── 结束信号 ────  │          │                │
│  └──────────┘                    └──────────┘                │
│                                                              │
│  优势：消费者控制速率，不会过载                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 关键 API

**创建 Stream：**

| API | 类型签名 | 说明 |
|-----|---------|------|
| `Stream.fromIterable` | `(iterable) => Stream<A>` | 从可迭代对象创建 |
| `Stream.fromEffect` | `(effect) => Stream<A, E, R>` | 从 Effect 创建（单值） |
| `Stream.fromQueue` | `(queue) => Stream<A, E>` | 从 Queue 创建（流式数据） |
| `Stream.make` | `(...values) => Stream<A>` | 从多个值创建 |
| `Stream.range` | `(min, max) => Stream<number>` | 整数范围 |
| `Stream.fromArray` | `(array) => Stream<A>` | 从数组创建 |

**转换操作：**

| API | 说明 |
|-----|------|
| `Stream.map` | 同步映射 |
| `Stream.filter` | 过滤 |
| `Stream.tap` | 副作用窥视（不改变元素） |
| `Stream.mapEffect` | 异步映射 |
| `Stream.take` | 取前 N 个 |
| `Stream.drop` | 丢弃前 N 个 |
| `Stream.changes` | 去重连续重复 |

**消费操作：**

| API | 说明 |
|-----|------|
| `Stream.runCollect` | 收集所有元素到数组 |
| `Stream.runForEach` | 对每个元素执行副作用 |
| `Stream.runFold` | 折叠归约 |
| `Stream.runHead` | 取第一个元素 |
| `Stream.runCount` | 计数 |
| `Stream.runDrain` | 只执行副作用，丢弃结果 |

**组合操作：**

| API | 说明 |
|-----|------|
| `Stream.merge` | 合并两个流（交错发射） |
| `Stream.zip` | 按位置配对 |
| `Stream.concat` | 串联两个流 |
| `Stream.broadcast` | 广播到多个消费者 |
| `Stream.groupBy` | 按键分组 |

**背压控制：**

| API | 说明 |
|-----|------|
| `Stream.buffer` | 缓冲，允许生产者超前 |
| `Stream.throttle` | 限流，控制发射速率 |

---

## 三、创建 Stream

### 3.1 fromIterable — 从可迭代对象创建

`Stream.fromIterable` 是最常用的创建方式，可以从数组、Set、Generator 等任何可迭代对象创建 Stream：

```typescript
import { Effect, Stream } from "effect"

const stream = Stream.fromIterable([10, 20, 30, 40, 50])
const collected = yield* Stream.runCollect(stream)
// [10, 20, 30, 40, 50]
```

**惰性求值：** `fromIterable` 是惰性的——元素只有在被消费时才会从迭代器中取出。这意味着你可以传入一个无限迭代器，只要消费者只取部分元素，就不会有问题。

### 3.2 fromEffect — 从 Effect 创建

`Stream.fromEffect` 将单个 Effect 的值包装为只发射一个元素的 Stream：

```typescript
const stream = Stream.fromEffect(Effect.succeed("Hello from Effect!"))
// 只发射一个元素: "Hello from Effect!"
```

这在需要将 Effect 与 Stream API 组合时非常有用。

### 3.3 fromQueue — 从 Queue 创建

`Stream.fromQueue` 将 Queue 转换为 Stream，每次从 Queue 中 `take` 一个元素并发射：

```typescript
const queue = yield* Queue.bounded<number>(5)

// 启动 Fiber 向队列写入数据
yield* Effect.forkScoped(
  Effect.gen(function* () {
    for (const n of [1, 2, 3, 4, 5]) {
      yield* Queue.offer(queue, n)
      yield* Effect.sleep("100 millis")
    }
    yield* Queue.end(queue) // 标记队列结束
  }),
)

// 从 Queue 创建 Stream
const stream = Stream.fromQueue(queue)
const collected = yield* Stream.runCollect(stream)
// [1, 2, 3, 4, 5]
```

当 Queue 被 `end` 时，Stream 会自动结束。这是构建实时数据管道的核心模式。

### 3.4 make + repeat — 重复发射

`Stream.make` 创建单值流，配合 `Stream.repeat` 可以按 Schedule 重复发射：

```typescript
const stream = Stream.make("tick").pipe(
  Stream.repeat(Schedule.spaced("200 millis")),
  Stream.take(3), // 只取前 3 个
)
// 输出: tick, tick, tick（每 200ms 一个）
```

### 3.5 range — 整数范围

`Stream.range(min, max)` 发射 `[min, max]` 闭区间内的整数：

```typescript
const stream = Stream.range(1, 8)
// 发射: 1, 2, 3, 4, 5, 6, 7, 8
```

---

## 四、转换 Stream

### 4.1 map — 同步映射

`Stream.map` 对每个元素应用同步函数，是最基本的转换操作：

```typescript
const stream = Stream.fromIterable([1, 2, 3, 4, 5]).pipe(
  Stream.map((n) => n * 10),
)
// 结果: [10, 20, 30, 40, 50]
```

### 4.2 filter — 过滤

`Stream.filter` 保留满足条件的元素：

```typescript
const stream = Stream.fromIterable([1, 2, 3, 4, 5, 6]).pipe(
  Stream.filter((n) => n % 2 === 0),
)
// 结果: [2, 4, 6]
```

### 4.3 tap — 副作用窥视

`Stream.tap` 在不改变元素的情况下执行副作用，常用于调试和日志：

```typescript
const stream = Stream.fromIterable(["a", "b", "c"]).pipe(
  Stream.tap((s) => Console.log(`处理元素 "${s}"`)),
  Stream.map((s) => s.toUpperCase()),
)
// tap 输出: 处理元素 "a", 处理元素 "b", 处理元素 "c"
// map 结果: [A, B, C]
```

### 4.4 mapEffect — 异步映射

`Stream.mapEffect` 对每个元素应用异步函数（返回 Effect 的函数）：

```typescript
const asyncDouble = (n: number) =>
  Effect.succeed(n * 2).pipe(Effect.delay("50 millis"))

const stream = Stream.fromIterable([1, 2, 3]).pipe(
  Stream.mapEffect(asyncDouble),
)
// 结果: [2, 4, 6]（每个元素延迟 50ms）
```

`mapEffect` 默认按顺序执行（一个接一个），可以通过 `{ concurrency: "unbounded" }` 选项启用并发执行。

### 4.5 take / drop — 截取

`Stream.take(n)` 取前 n 个元素，`Stream.drop(n)` 丢弃前 n 个元素：

```typescript
Stream.fromIterable([1, 2, 3, 4, 5]).pipe(Stream.take(3))
// [1, 2, 3]

Stream.fromIterable([1, 2, 3, 4, 5]).pipe(Stream.drop(2))
// [3, 4, 5]
```

### 4.6 changes — 去重连续重复

`Stream.changes` 只保留与前一个元素不同的元素：

```typescript
Stream.fromIterable([1, 1, 2, 2, 2, 3, 1, 1, 4]).pipe(Stream.changes)
// [1, 2, 3, 1, 4]
```

这在处理传感器数据、状态变更事件等场景中非常有用。

---

## 五、消费 Stream

### 5.1 runCollect — 收集所有元素

`Stream.runCollect` 将 Stream 的所有元素收集到数组中：

```typescript
const collected = yield* Stream.runCollect(Stream.range(1, 5))
// [1, 2, 3, 4, 5]
```

**注意：** 对于无限流，`runCollect` 会永远运行。请确保使用 `take` 等操作限制元素数量。

### 5.2 runForEach — 对每个元素执行副作用

`Stream.runForEach` 对每个元素执行一个返回 Effect 的回调：

```typescript
yield* Stream.runForEach(
  Stream.fromIterable(["A", "B", "C"]),
  (letter) => Console.log(`处理元素: ${letter}`),
)
```

### 5.3 runFold — 折叠归约

`Stream.runFold` 将 Stream 的所有元素折叠为一个值：

```typescript
const sum = yield* Stream.runFold(
  Stream.fromIterable([1, 2, 3, 4, 5]),
  () => 0,        // 初始值（惰性）
  (acc, n) => acc + n,  // 累加函数
)
// sum = 15
```

### 5.4 runHead — 取第一个元素

`Stream.runHead` 返回第一个元素（以 `Option` 形式）：

```typescript
const head = yield* Stream.runHead(Stream.fromIterable([100, 200, 300]))
// Option.some(100)
```

### 5.5 runCount — 计数

`Stream.runCount` 返回 Stream 的元素数量：

```typescript
const count = yield* Stream.runCount(Stream.fromIterable(["x", "y", "z", "w"]))
// count = 4
```

### 5.6 runDrain — 只执行副作用

`Stream.runDrain` 执行所有副作用但丢弃元素值：

```typescript
yield* Stream.runDrain(
  Stream.fromIterable([1, 2, 3]).pipe(
    Stream.tap((n) => Console.log(`处理 ${n}`)),
  ),
)
// 输出: 处理 1, 处理 2, 处理 3
// 返回值: void
```

---

## 六、合并与分流

### 6.1 merge — 合并两个流

`Stream.merge` 将两个流交错合并为一个流，元素按到达顺序发射：

```typescript
const stream1 = Stream.fromIterable([1, 2, 3]).pipe(
  Stream.tap((n) => Effect.sleep(`${n * 50} millis`)),
)
const stream2 = Stream.fromIterable([10, 20, 30]).pipe(
  Stream.tap((n) => Effect.sleep(`${n * 10} millis`)),
)

const merged = Stream.merge(stream1, stream2)
// 结果: [1, 10, 2, 20, 3, 30]（交错发射）
```

### 6.2 zip — 按位置配对

`Stream.zip` 将两个流按位置配对，任一结束则结束：

```typescript
const zipped = Stream.zip(
  Stream.fromIterable(["a", "b", "c"]),
  Stream.fromIterable([1, 2, 3]),
)
// 结果: [["a", 1], ["b", 2], ["c", 3]]
```

### 6.3 concat — 串联两个流

`Stream.concat` 先发射第一个流的所有元素，再发射第二个流：

```typescript
const concatenated = Stream.concat(
  Stream.fromIterable([1, 2, 3]),
  Stream.fromIterable([4, 5, 6]),
)
// 结果: [1, 2, 3, 4, 5, 6]
```

### 6.4 broadcast — 广播到多个消费者

`Stream.broadcast` 创建一个 PubSub 支持的广播流，所有订阅者都收到相同的元素：

```typescript
const broadcasted = yield* Stream.broadcast(
  Stream.fromArray([1, 2, 3]),
  { capacity: 8, replay: 3 },
)

// 两个消费者独立处理
const c1 = yield* Effect.forkScoped(
  Stream.runCollect(broadcasted.pipe(Stream.map((n) => n * 10))),
)
const c2 = yield* Effect.forkScoped(
  Stream.runCollect(broadcasted.pipe(Stream.map((n) => n * 100))),
)
// 消费者 1: [10, 20, 30]
// 消费者 2: [100, 200, 300]
```

`broadcast` 返回的流是 scoped 的，需要在 `Effect.scoped` 中使用。

### 6.5 groupBy — 按键分组

`Stream.groupBy` 将元素按键分组，每个键对应一个子流：

```typescript
const grouped = yield* Stream.fromIterable([1, 2, 3, 4, 5, 6]).pipe(
  Stream.groupBy((n) =>
    Effect.succeed([n % 2 === 0 ? "even" : "odd", n] as const)
  ),
  Stream.mapEffect(
    (entry) => Effect.gen(function* () {
      const [key, stream] = entry
      const values = yield* Stream.runCollect(stream)
      return { key, values }
    }),
    { concurrency: "unbounded" },
  ),
  Stream.runCollect,
)
// groupBy("odd"): [1, 3, 5]
// groupBy("even"): [2, 4, 6]
```

---

## 七、背压机制

### 7.1 什么是背压

背压（Backpressure）是响应式系统中消费者控制数据流速率的机制。在 Effect-TS 的 Stream 中，背压是**内置且默认启用**的——消费者通过拉取模型自然控制速率。

### 7.2 pull-based 模型

Stream 的默认行为是 pull-based：消费者每次请求一个元素，生产者按需生成。这意味着如果消费者只取 3 个元素，生产者不会生成第 4 个：

```typescript
let counter = 0
const stream = Stream.fromIterable(
  (function* () {
    for (let i = 1; i <= 5; i++) {
      counter++
      yield i
    }
  })(),
)

const result = yield* Stream.runCollect(stream.pipe(Stream.take(3)))
// 消费者只收到 [1, 2, 3]
// 生成器只被调用了 3 次（counter = 3）
```

### 7.3 buffer — 缓冲策略

`Stream.buffer` 允许生产者超前消费者一定数量的元素，以缓冲速率波动：

```typescript
const buffered = fastProducer.pipe(
  Stream.buffer({ capacity: 5 }),
  Stream.tap((n) => Effect.sleep("50 millis")), // 慢消费者
  Stream.take(8),
)
```

`buffer` 的容量决定了生产者可以超前消费者的最大元素数。当缓冲区满时，生产者会被暂停（背压生效）。

### 7.4 throttle — 限流

`Stream.throttle` 使用令牌桶算法限制发射速率：

```typescript
const stream = Stream.range(1, 10).pipe(
  Stream.throttle({
    cost: (arr) => arr.length,
    units: 1,
    duration: "200 millis",
    burst: 2,
    strategy: "shape",
  }),
)
```

参数说明：
- `cost` — 每个元素的成本
- `units` — 每 `duration` 时间补充的令牌数
- `duration` — 令牌补充周期
- `burst` — 允许的突发量
- `strategy` — `"shape"`（延迟发射）或 `"enforce"`（丢弃超限元素）

### 7.5 生产者 vs 消费者速率协调

当生产者速度快于消费者时，背压机制会自动协调：

```
快速生产者（无延迟） → Queue(bounded) → 慢消费者（200ms/个）

1. 生产者快速填充队列（容量 3）
2. 队列满时，生产者被挂起（背压生效）
3. 消费者消费一个元素，腾出空间
4. 生产者恢复，继续生产
5. 如此循环，自然平衡
```

这种机制确保系统不会因为速率不匹配而耗尽内存。

### 7.6 与 OpenCode 的联系

OpenCode 的 `ripgrep.ts` 中大量使用了 Stream 和 Queue 构建实时日志管道：

```typescript
// OpenCode 中 ripgrep 搜索的 Stream 管道
const [items, stderr, code] = yield* Effect.all(
  [
    Stream.decodeText(handle.stdout).pipe(
      Stream.splitLines,
      Stream.filter((line) => line.length > 0),
      Stream.mapEffect(parse),       // 解析 JSON 行
      Stream.filter((item): item is Match => item.type === "match"),
      Stream.map((item) => row(item.data)),
      Stream.runCollect,
      Effect.map((chunk) => [...chunk]),
    ),
    Stream.mkString(Stream.decodeText(handle.stderr)),
    handle.exitCode,
  ],
  { concurrency: "unbounded" },
)
```

这个管道展示了 Stream 的核心模式：
1. **`Stream.decodeText`** — 将字节流解码为文本流
2. **`Stream.splitLines`** — 按行分割
3. **`Stream.filter`** — 过滤空行
4. **`Stream.mapEffect`** — 异步解析 JSON
5. **`Stream.runCollect`** — 收集结果

此外，`files` 方法使用 `Stream.callback` + Queue 构建了基于回调的 Stream：

```typescript
const files: Interface["files"] = (input) =>
  Stream.callback<string, PlatformError | Error>((queue) =>
    Effect.gen(function* () {
      yield* Effect.forkScoped(
        Effect.gen(function* () {
          // ... 执行 ripgrep 命令
          // 将结果行通过 Queue.offer 推入 Stream
          yield* Stream.splitLines(stdout).pipe(
            Stream.runForEach((line) =>
              Effect.sync(() => Queue.offerUnsafe(queue, clean(line)))
            ),
          )
          Queue.endUnsafe(queue) // 标记完成
        }),
      )
    }),
  )
```

---

## 八、小结

### 核心要点

1. **Stream 是多值异步计算**：`Stream<A, E, R>` 描述可以发射多个值的程序
2. **Pull-based 模型**：消费者驱动，按需拉取，内置背压
3. **丰富的操作符**：map/filter/tap/mapEffect/take/drop/changes 等转换操作
4. **多种消费方式**：runCollect/runForEach/runFold/runHead/runCount/runDrain
5. **组合能力**：merge/zip/concat/broadcast/groupBy 支持复杂数据流编排
6. **背压控制**：buffer 缓冲速率波动，throttle 限制发射速率
7. **与 Queue 集成**：fromQueue 将队列桥接为流，构建实时管道

### 最佳实践

- 优先使用 `fromIterable` 和 `range` 创建有限流
- 使用 `take` 限制无限流的元素数量
- 使用 `tap` 进行调试和日志，不改变元素
- 使用 `mapEffect` 处理异步转换，注意并发控制
- 使用 `buffer` 平滑速率波动，但设置合理的容量上限
- 使用 `broadcast` 实现一对多分发
- 使用 `groupBy` 实现按键分流处理

### 下一章

第 13 章将介绍 Queue 与 Deferred——Fiber 间通信的核心原语，以及如何与 Stream 配合构建复杂的并发管道。

---

## 参考

- [Effect-TS Stream 文档](https://effect.website/docs/stream/introduction)
- [Effect-TS Queue 文档](https://effect.website/docs/concurrency/queue)
- [Effect-TS Fiber 文档](https://effect.website/docs/concurrency/fiber)
- OpenCode 项目: `packages/opencode/src/file/ripgrep.ts` — Stream + Queue 实时日志管道
