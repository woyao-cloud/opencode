# 第 18 章: 典型问题处理手册

## 1. 本章目标

完成本章学习后，你将能够：

- 使用 `Effect.timeout` 和 `Effect.onInterrupt` 控制长任务执行
- 使用 `Schedule.spaced` 和令牌桶算法实现限流
- 使用 `Effect.all` + `mode: "result"`、`Effect.partition`、`Effect.orElseSucceed` 实现优雅降级
- 使用 `Cause.pretty`、`Effect.tap`/`Effect.tapError`、`Fiber.getCurrent` 进行调试诊断
- 识别并避免 5 个常见的 Effect-TS 反模式

## 2. 前置知识

阅读本章前，你需要掌握：

- **第 5 章 (错误处理):** `Effect.catch`、`Effect.catchTag`、`Effect.retry`、`Schedule`
- **第 10 章 (Effect 模式集锦):** `Effect.forEach`、`Effect.all`、`Effect.timeout`、`Effect.race`
- **第 11 章 (Fiber):** `Effect.forkChild`、`Fiber.join`、`Fiber.interrupt`、`Fiber.getCurrent`
- **第 12 章 (Stream):** `Stream` 的基本概念（本章仅引用，不深入）

## 3. 概念讲解

### 3.1 长任务处理

在实际应用中，长时间运行的任务（如大数据处理、文件上传、批量计算）需要三种控制机制：

1. **超时控制** — 防止任务无限执行
2. **中断清理** — 任务被中断时释放资源
3. **检查点模式** — 在关键步骤保存进度，支持安全中断

#### Effect.timeout

`Effect.timeout` 是最直接的超时控制方式。当任务执行超过指定时间时，自动中断并返回超时错误：

```typescript
const result = yield* longRunningTask.pipe(
  Effect.timeout(Duration.seconds(30)),
)
```

如果超时发生，Effect 会返回一个 `TimeoutException`。你也可以使用 `Effect.timeoutOrElse` 在超时时执行降级逻辑：

```typescript
const result = yield* longRunningTask.pipe(
  Effect.timeoutOrElse({
    duration: Duration.seconds(30),
    orElse: () => Effect.succeed("使用缓存数据"),
  }),
)
```

#### Effect.onInterrupt

`Effect.onInterrupt` 注册一个在任务被中断时自动执行的回调。这对于释放资源（关闭文件句柄、回滚数据库事务、释放网络连接）至关重要：

```typescript
const task = Effect.gen(function* () {
  // 打开资源
  yield* openConnection()
  // 执行业务逻辑
  yield* doWork()
  // 关闭资源
  yield* closeConnection()
}).pipe(
  Effect.onInterrupt(() =>
    Effect.gen(function* () {
      yield* rollbackTransaction()
      yield* closeConnection()
    })
  ),
)
```

#### 检查点模式

检查点模式在长任务的关键步骤插入"检查点"。使用 `Effect.interruptible` 使检查点区域可被中断，当 Fiber 被中断时，interruptible 区域会抛出 Interrupt，从而优雅退出：

```typescript
const withCheckpoint = <A, E, R>(
  task: Effect.Effect<A, E, R>,
  label: string,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    yield* Console.log(`[检查点] ${label}`)
    const result = yield* task.pipe(Effect.interruptible)
    return result
  })
```

### 3.2 限流与并发控制

限流是保护外部服务不被过度调用的关键手段。Effect-TS 提供多种限流策略：

#### Schedule.spaced

`Schedule.spaced` 创建固定间隔的调度计划，适合控制请求频率：

```typescript
// 每 500ms 执行一次
Effect.repeat(apiCall, Schedule.spaced(Duration.millis(500)))
```

#### 令牌桶算法

令牌桶是一种经典的限流算法：

- **桶容量** — 允许的最大突发请求数
- **补充速率** — 每秒向桶中添加的令牌数
- **获取令牌** — 每次请求消耗一个令牌，令牌不足时等待

```typescript
class TokenBucket {
  private tokens: Ref.Ref<number>

  constructor(capacity: number, intervalMs: number) {
    this.tokens = Ref.makeUnsafe(capacity)
  }

  acquire(): Effect.Effect<boolean> {
    return Ref.get(this.tokens).pipe(
      Effect.flatMap((current) => {
        if (current > 0) {
          return Ref.update(this.tokens, (n) => n - 1).pipe(
            Effect.map(() => true),
          )
        }
        return Effect.succeed(false)
      }),
    )
  }
}
```

#### 并发度控制

`Effect.forEach` 和 `Effect.all` 都支持 `concurrency` 参数，控制同时执行的任务数：

```typescript
// 限制并发度为 3
const results = yield* Effect.forEach(items, processItem, {
  concurrency: 3,
})
```

### 3.3 优雅降级

在分布式系统中，部分服务不可用是常态。优雅降级确保系统在部分失败时仍能提供有意义的响应。

#### Effect.all + mode: "result"

`Effect.all` 的 `mode: "result"` 模式执行一组 Effect，返回每个结果的 `Result` 对象（包含 `_tag`、`success`、`failure` 属性），让你可以分别处理成功和失败：

```typescript
const results = yield* Effect.all([
  fetchService("用户服务"),
  fetchService("订单服务"),  // 可能失败
  fetchService("商品服务"),
], { mode: "result" })
// results 包含 { _tag: "Success", success: ... } 或 { _tag: "Failure", failure: ... }
```

#### Effect.partition

`Effect.partition` 将结果分为失败和成功两个数组（注意：返回 `[failures, successes]`）：

```typescript
const [failures, successes] = yield* Effect.partition(
  items,
  processItem,
  { concurrency: "unbounded" },
)
// successes: 成功的结果
// failures: 失败的错误
```

#### Effect.orElseSucceed

`Effect.orElseSucceed` 在失败时返回一个默认值，是最简单的降级方式。注意它接受一个工厂函数（thunk）：

```typescript
const data = yield* fetchFromCache(key).pipe(
  Effect.orElseSucceed(() => "默认数据"),
)
```

#### 降级链

降级链实现多级降级策略：主服务 → 备用服务 → 本地缓存 → 静态默认值：

```typescript
const result = yield* primaryService.pipe(
  Effect.catch(() => secondaryService),
  Effect.catch(() => localCache),
  Effect.catch(() => staticDefault),
)
```

### 3.4 调试与诊断

Effect-TS 提供多种调试工具，帮助开发者追踪问题。

#### Cause.pretty

`Cause.pretty` 将 `Cause` 格式化为人类可读的字符串，包含完整的错误链和 Fiber 栈信息：

```typescript
Effect.runPromiseExit(effect).then((exit) => {
  if (exit._tag === "Failure") {
    console.log(Cause.pretty(exit.cause))
  }
})
```

#### Effect.tap / Effect.tapError

`Effect.tap` 和 `Effect.tapError` 是"观察者"操作：它们让你查看 Effect 的成功值或错误值，而不改变执行流程：

```typescript
const program = effect.pipe(
  Effect.tap((result) => Console.log(`成功: ${result}`)),
  Effect.tapError((err) => Console.log(`失败: ${err.message}`)),
)
```

#### Fiber.getCurrent

`Fiber.getCurrent()` 返回当前正在执行的 Fiber 对象，可以访问 `id`、`interruptible` 等属性：

```typescript
const currentFiber = Fiber.getCurrent()
console.log(`Fiber ID: ${currentFiber.id}`)
```

#### Effect.withLogSpan

`Effect.withLogSpan` 为日志添加范围标记，方便追踪嵌套调用：

```typescript
const fetchUser = (id: number) =>
  Effect.gen(function* () {
    yield* Console.log(`获取用户 ${id}`)
    // ...
  }).pipe(Effect.withLogSpan("fetchUser"))
```

### 3.5 常见反模式

#### 反模式 1: 在 Effect.gen 中使用 try/catch

**错误:** `Effect.fail` 不是 JavaScript 的 `throw`，`try/catch` 无法捕获 Effect 错误。

```typescript
// ❌ 错误
Effect.gen(function* () {
  try {
    const result = yield* Effect.fail(new Error("错误"))
    return result
  } catch (e) {
    return "降级值"  // 永远不会执行
  }
})
```

**正确:** 使用 `Effect.catch` 或 `Effect.catchTag`。

```typescript
// ✅ 正确
Effect.gen(function* () {
  const result = yield* Effect.fail(new Error("错误"))
  return result
}).pipe(
  Effect.catch((err) => Effect.succeed("降级值")),
)
```

#### 反模式 2: 过早使用 Effect.run*

**错误:** 在 Effect 组合完成前调用 `runSync`/`runPromise`，失去了组合能力。

```typescript
// ❌ 错误
const value = Effect.runSync(Effect.succeed(42))
const result = value + 10  // 在 Effect 外部处理
```

**正确:** 在 Effect 内部完成所有处理。

```typescript
// ✅ 正确
const result = yield* Effect.succeed(42).pipe(
  Effect.map((n) => n + 10),
)
```

#### 反模式 3: 忽略错误类型

**错误:** 使用 `catch` 捕获所有错误，丢失了类型区分。

```typescript
// ❌ 错误
effect.pipe(
  Effect.catch((err) => {
    // err 是联合类型，需要手动 instanceof 判断
    if (err instanceof ValidationError) { ... }
  }),
)
```

**正确:** 使用 `catchTag` 按 `_tag` 精确处理。

```typescript
// ✅ 正确
effect.pipe(
  Effect.catchTag("ValidationError", (err) => ...),
  Effect.catchTag("AuthError", (err) => ...),
)
```

#### 反模式 4: 深层嵌套 Effect.gen

**错误:** 多层嵌套的 `Effect.gen` 导致代码难以阅读和维护。

```typescript
// ❌ 错误
Effect.gen(function* () {
  const a = yield* Effect.gen(function* () {
    const b = yield* Effect.gen(function* () {
      const c = yield* Effect.succeed(1)
      return c + 1
    })
    return b * 2
  })
  return a + 3
})
```

**正确:** 使用 `pipe` + `map`/`flatMap` 扁平化。

```typescript
// ✅ 正确
Effect.succeed(1).pipe(
  Effect.map((c) => c + 1),
  Effect.map((b) => b * 2),
  Effect.map((a) => a + 3),
)
```

#### 反模式 5: 遗忘 Fiber

**错误:** `forkChild` 后没有保存 Fiber 引用，导致 Fiber 无法被管理。

```typescript
// ❌ 错误
yield* Effect.forkChild(someTask)  // Fiber 引用丢失
```

**正确:** 使用 `Scope` 管理 Fiber 生命周期。

```typescript
// ✅ 正确
Effect.scoped(
  Effect.gen(function* () {
    const fiber = yield* Effect.forkScoped(someTask)
    const result = yield* Fiber.join(fiber)
    return result
  }),
)
```

## 4. 代码示例

本章的完整代码示例位于 `demos/ch18-problem-handbook/` 目录：

| 文件 | 说明 |
|------|------|
| `src/01-long-running-task.ts` | 超时控制、onInterrupt 清理、检查点模式 |
| `src/02-rate-limiting.ts` | 令牌桶限流、Schedule.spaced、并发度控制 |
| `src/03-graceful-degradation.ts` | all + mode:result、partition、orElseSucceed、降级链 |
| `src/04-debugging.ts` | Cause.pretty、tap/tapError、Fiber.getCurrent、withLogSpan |
| `src/05-anti-patterns.ts` | 5 个反模式及对应的正确实现 |

## 5. 本章总结

| 问题领域 | 核心工具 | 关键要点 |
|----------|----------|----------|
| 长任务 | `Effect.timeout`、`Effect.onInterrupt`、检查点 | 超时 + 清理 + 进度保存 |
| 限流 | `Schedule.spaced`、令牌桶、`concurrency` 参数 | 保护外部服务，控制资源使用 |
| 降级 | `Effect.all` + `mode: "result"`、`Effect.partition`、降级链 | 部分失败容忍，多级降级策略 |
| 调试 | `Cause.pretty`、`Effect.tap`/`tapError`、`Fiber.getCurrent` | 观察而不改变，格式化错误输出 |
| 反模式 | 正确使用 `catch`/`catchTag`、避免过早 `run*` | 类型安全，组合优先 |

## 6. 练习

1. **超时练习:** 实现一个带超时的批量处理函数，处理 10 个任务，整体超时 5 秒
2. **限流练习:** 实现一个限流器，每秒最多处理 5 个请求，突发量最多 10 个
3. **降级练习:** 实现一个三级降级的数据获取函数：Redis → 数据库 → 本地文件
4. **调试练习:** 使用 `Cause.pretty` 和 `Effect.tap` 追踪一个多层嵌套的错误
5. **重构练习:** 将以下反模式代码重构为正确的 Effect-TS 风格：

```typescript
// 请重构这段代码
function processUsers(ids: number[]) {
  const results: string[] = []
  for (const id of ids) {
    try {
      const result = Effect.runSync(fetchUser(id))
      results.push(result)
    } catch (e) {
      results.push("默认用户")
    }
  }
  return results
}
```

## 7. 延伸阅读

- [Effect-TS 官方文档: Effect](https://effect.website/docs/guides/effect)
- [Effect-TS 官方文档: Schedule](https://effect.website/docs/guides/schedule)
- [Effect-TS 官方文档: Fiber](https://effect.website/docs/guides/fiber)
- [第 5 章: 错误处理模型](./chapter-05-error-handling.md)
- [第 10 章: Effect 模式集锦](./chapter-10-effect-patterns.md)
- [第 11 章: Fiber 并发执行单元](./chapter-11-fiber.md)
