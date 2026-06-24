# 第 16 章：内存管理

## 一、本章概述

Effect-TS 通过类型系统和 Scope 机制帮我们管理资源生命周期，但理解内存如何被分配、引用和回收仍然至关重要。本章聚焦 Effect-TS 程序中内存管理的五个核心维度：

1. **闭包引用链** — flatMap 链中的闭包累积、Effect.gen 的变量生命周期、提前释放引用
2. **Scope 释放时机** — acquireRelease LIFO 顺序、addFinalizer 时机、Scope.fork 子作用域隔离
3. **Fiber 泄漏检测** — forkDaemon 泄漏场景、Scope 自动回收、WeakRef 验证
4. **Stream 缓冲控制** — bufferChunks 容量、grouped 批量大小、背压内存管理
5. **Layer 生命周期** — Layer.scoped 创建/销毁、Layer.fresh 隔离、内存占用对比

### 前置知识

- 第 6 章 Scope：理解 `acquireRelease`、`addFinalizer`、`Scope.fork`、`Scope.make`
- 第 11 章 Fiber：理解 `fork`、`forkDaemon`、`forkScoped`、`Fiber.join`、`Fiber.interrupt`
- 第 12 章 Stream：理解 `bufferChunks`、`grouped`、`mapEffect`、背压机制
- 第 8 章 Layer 进阶：理解 `Layer.scoped`、`Layer.fresh`、`Layer.merge`

### 示例代码

所有示例位于 `docs/Effect-ts/demos/ch16-memory/src/`，可直接运行：

```bash
cd docs/Effect-ts/demos/ch16-memory
bun install
bun run demo:closure    # Effect 闭包链
bun run demo:scope      # Scope 释放时机
bun run demo:fiber      # Fiber 泄漏检测
bun run demo:stream     # Stream 缓冲控制
bun run demo:layer      # Layer 生命周期
```

---

## 二、核心概念

### 2.1 内存管理在 Effect-TS 中的特殊性

在传统 TypeScript 程序中，内存管理主要关注：
- 变量作用域
- 闭包引用
- 事件监听器的注册/注销

Effect-TS 引入了额外的内存关注点：

```
┌──────────────────────────────────────────────────────────────┐
│                 Effect-TS 内存管理层次                         │
│                                                              │
│  层次 1: JavaScript 层面                                      │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ 闭包引用链、变量作用域、GC 回收时机                     │     │
│  │ 这是所有 TypeScript 程序的基础                        │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  层次 2: Effect 闭包层面                                     │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ flatMap 链闭包累积、Effect.gen 变量生命周期            │     │
│  │ Effect 类型的不可变性有助于减少意外引用                 │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  层次 3: Scope 资源层面                                      │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ acquireRelease、addFinalizer、Scope.fork             │     │
│  │ 通过类型系统保证资源"获取即释放"                       │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  层次 4: Fiber 并发层面                                      │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ forkDaemon 泄漏、未 join 的 Fiber、中断清理           │     │
│  │ 结构化并发防止 Fiber 泄漏                             │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  层次 5: Stream/Layer 架构层面                                │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ bufferChunks 容量、grouped 批量、Layer 生命周期        │     │
│  │ 配置驱动的内存控制                                    │     │
│  └─────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 关键 API

**Scope 资源管理 API:**

| API | 说明 | 内存影响 |
|-----|------|---------|
| `Effect.acquireRelease(acquire, release)` | 获取资源并注册释放函数 | 释放函数保证执行，防止泄漏 |
| `Effect.addFinalizer(fn)` | 注册清理钩子 | LIFO 顺序执行，即使失败也会执行 |
| `Scope.fork` | 创建子作用域 | 子作用域独立管理，可提前关闭 |
| `Scope.make` | 手动创建作用域 | 精确控制释放时机 |
| `Scope.close(scope, exit)` | 关闭作用域 | 触发所有 finalizer 执行 |

**Fiber 生命周期 API:**

| API | 说明 | 内存影响 |
|-----|------|---------|
| `Effect.forkScoped` | 创建 Scope 绑定的 Fiber | Scope 关闭时自动中断，防止泄漏 |
| `Effect.forkDaemon` | 创建独立 Fiber | 不绑定 Scope，需手动管理 |
| `Fiber.join(fiber)` | 等待 Fiber 完成 | 确保获取结果并允许 GC |
| `Fiber.interrupt(fiber)` | 中断 Fiber | 触发内部 finalizer，释放资源 |

**Stream 内存控制 API:**

| API | 说明 | 内存影响 |
|-----|------|---------|
| `Stream.bufferChunks({ capacity })` | 设置缓冲区容量 | 限制内存上限 |
| `Stream.grouped(n)` | 按 n 个元素分组 | 控制单批内存大小 |
| `Stream.mapEffect(fn, { concurrency })` | 限制并发度 | 控制并发内存占用 |
| `Stream.runForEach(fn)` | 逐元素消费 | 消费完自动释放缓冲区 |

**Layer 生命周期 API:**

| API | 说明 | 内存影响 |
|-----|------|---------|
| `Layer.scoped(tag, effect)` | 带生命周期的 Layer | 支持 acquire/release |
| `Layer.fresh(layer)` | 每次提供新实例 | 增加内存分配，实现隔离 |
| `Layer.succeed(tag, value)` | 包装已有值 | 零额外内存开销 |
| `Layer.merge(a, b)` | 合并多个 Layer | 共享 Scope，统一释放 |

---

## 三、Effect 闭包与内存引用链

### 3.1 flatMap 链中的闭包累积

`flatMap` 链是 Effect-TS 中最常见的组合方式。但每一步的闭包都会捕获外部变量，形成引用链：

```typescript
// flatMap 链中的闭包引用链
const chain = Effect.succeed(init).pipe(
  // 闭包 1 捕获 obj1
  Effect.flatMap((n) => {
    const obj1 = new LargeObject(1)   // obj1 被闭包捕获
    return Effect.sync(() => n + obj1.getValue())
  }),
  // 闭包 2 捕获 obj2
  Effect.flatMap((n) => {
    const obj2 = new LargeObject(2)   // obj2 被闭包捕获
    return Effect.sync(() => n + obj2.getValue())
  }),
  // 闭包 3 捕获 obj3
  Effect.flatMap((n) => {
    const obj3 = new LargeObject(3)   // obj3 被闭包捕获
    return Effect.sync(() => n + obj3.getValue())
  }),
)
```

**内存影响：** 在链的执行过程中，所有闭包引用的对象（obj1、obj2、obj3）同时保持存活。链越长，同时存活的对象越多。

### 3.2 Effect.gen 的变量生命周期

`Effect.gen` 使用生成器语法，在每次 `yield*` 后，之前的局部变量可以被垃圾回收：

```typescript
const gen = Effect.gen(function* () {
  // obj1 在这个 yield* 之后可以被 GC
  const obj1 = new LargeObject(10)
  const step1 = yield* Effect.sync(() => obj1.getValue())

  // obj2 在这个 yield* 之后可以被 GC
  const obj2 = new LargeObject(20)
  const step2 = yield* Effect.sync(() => obj2.getValue())

  // obj3 同样
  const obj3 = new LargeObject(30)
  const step3 = yield* Effect.sync(() => obj3.getValue())

  return step1 + step2 + step3
})
```

**关键区别：** 在 `Effect.gen` 中，如果局部变量在后续代码中不再使用，JS 引擎可以在 yield 点后回收它们。而 `flatMap` 链中的闭包引用在整个链执行完成前保持存活。

### 3.3 选择指南

| 场景 | 推荐 | 原因 |
|------|------|------|
| 长链（5+ 步）、有大对象 | Effect.gen | 变量可在 yield* 后被 GC |
| 短链（2-3 步）、小对象 | flatMap 链 | 代码更紧凑，内存差异可忽略 |
| 热路径 | flatMap 链 | 无 generator 开销 |
| 日常业务逻辑 | Effect.gen | 可读性 + 内存友好 |

### 3.4 提前释放引用

在长时间运行的 Effect.gen 中，如果某个大对象在后续步骤中不再需要，应主动释放引用：

```typescript
const better = Effect.gen(function* () {
  let dataset: LargeObject | null = new LargeObject(100)
  const result = yield* Effect.sync(() => dataset!.getValue())

  // 不再需要 dataset，主动释放
  dataset.dispose()
  dataset = null

  // 后续还有耗时操作，但 dataset 已被 GC
  yield* Effect.sleep("100 millis")
  yield* doMoreWork(result)
})
```

### 3.5 闭包捕获大对象的陷阱

```typescript
// 陷阱：大对象被闭包捕获，在延迟期间保持存活
const bigData = new LargeObject(999)

const delayedEffect = Effect.gen(function* () {
  yield* Effect.sleep("5000 millis")
  // bigData 被闭包捕获，整整 5 秒无法被 GC
  return bigData.getValue()
})

// 修复：只捕获需要的值
const capturedValue = bigData.getValue()
bigData.dispose()

const betterDelayed = Effect.gen(function* () {
  yield* Effect.sleep("5000 millis")
  return capturedValue  // 只捕获原始值
})
```

---

## 四、Scope 与资源释放时机

### 4.1 LIFO 释放顺序

Scope 中的所有 finalizer 按 LIFO（后进先出）顺序执行。这保证了依赖关系正确的释放顺序（后创建的先销毁）：

```
获取顺序: A → B → C
释放顺序: C → B → A  (LIFO)

[acquire] 获取连接 A
[acquire] 获取连接 B
[acquire] 获取连接 C
使用连接: A, B, C
[release] 释放连接 C   ← 最后获取，最先释放
[release] 释放连接 B
[release] 释放连接 A   ← 最先获取，最后释放
```

### 4.2 addFinalizer 与 acquireRelease 混合

`addFinalizer` 和 `acquireRelease` 注册的释放函数统一按 LIFO 顺序执行。执行顺序由注册顺序决定：

```typescript
Effect.scoped(
  Effect.gen(function* () {
    // 第 1 个注册 — 最后执行
    yield* Effect.addFinalizer((_exit) =>
      Effect.sync(() => Console.log("[finalizer] 记录指标")),
    )

    // 第 2 个注册 — 倒数第二执行
    yield* Effect.acquireRelease(acquireA, releaseA)

    // 第 3 个注册 — 最先执行
    yield* Effect.addFinalizer((_exit) =>
      Effect.sync(() => Console.log("[finalizer] 清理临时数据")),
    )
  }),
)
// 执行顺序: finalizer(清理) → release(A) → finalizer(记录指标)
```

### 4.3 错误场景中的释放保证

即使 Effect 失败（`Effect.fail`），Scope 中的 finalizer 仍然会执行：

```typescript
const result = yield* Effect.scoped(
  Effect.gen(function* () {
    yield* Effect.addFinalizer((exit) =>
      Effect.sync(() => {
        // Exit.isSuccess(exit) 为 false，因为 Effect 失败了
        console.log(`退出状态: ${Exit.isSuccess(exit) ? "成功" : "失败"}`)
      }),
    )
    yield* Effect.fail(new Error("操作失败"))  // finalizer 仍会执行
  }),
)
```

### 4.4 Scope.fork 子作用域

子作用域独立于父作用域管理资源。可以在父作用域关闭前手动关闭子作用域，释放其资源：

```typescript
yield* Effect.scoped(
  Effect.gen(function* () {
    yield* makeConnection("parent")  // 父作用域的资源

    const childScope = yield* Scope.fork

    // 在子作用域中获取资源
    yield* makeConnection("child-A").pipe(
      Effect.provideService(Scope.Scope, childScope),
    )

    // 提前关闭子作用域，释放子资源
    yield* Scope.close(childScope, Exit.succeed(undefined))
    // child-A 已释放，parent 仍在

    // 父作用域关闭时会释放 parent
  }),
)
```

### 4.5 手动 Scope 管理

`Scope.make()` 创建不绑定到 Effect.scoped 的手动 Scope，可以精确控制释放时机：

```typescript
const scope = yield* Scope.make

// 在手动 Scope 中获取资源
yield* makeConnection("manual").pipe(
  Effect.provideService(Scope.Scope, scope),
)

// ... 在需要的时候手动关闭
yield* Scope.close(scope, Exit.succeed(undefined))
```

---

## 五、Fiber 泄漏检测与预防

### 5.1 forkDaemon 泄漏场景

`forkDaemon` 创建的 Fiber 独立于当前 Scope 管理。如果不手动 join 或 interrupt，可能导致泄漏：

```typescript
// 泄漏场景：forkDaemon 创建永不停止的后台任务
const leakyFiber = yield* Effect.forkDaemon(
  Effect.gen(function* () {
    while (true) {
      yield* doBackgroundWork()
      yield* Effect.sleep("1 second")
    }
    // 如果没有人 interrupt 这个 Fiber，它会永远运行
  }),
)
// 忘记 join 或 interrupt → 内存泄漏
```

### 5.2 forkScoped — 防止泄漏

`forkScoped` 将 Fiber 绑定到当前 Scope，Scope 关闭时自动中断：

```typescript
yield* Effect.scoped(
  Effect.gen(function* () {
    // forkScoped — Fiber 受 Scope 管理
    const fiber = yield* Effect.forkScoped(
      Effect.gen(function* () {
        yield* longRunningTask()
      }),
    )

    // Scope 关闭时，如果 Fiber 还在运行，会被自动中断
  }),
)
// 此时 Fiber 已被中断，资源已清理
```

### 5.3 未 join 的 Fiber

使用 `Effect.fork`（非 scoped）创建 Fiber 但不 join，Fiber 会脱离管理：

```typescript
// 错误：fork 但不 join
const fiber = yield* Effect.fork(longTask)
// ... 做一些其他事情
// 忘记 join → 如果 longTask 还没完成，它继续运行但无人等待

// 正确：始终 join 或使用 forkScoped
const result = yield* Fiber.join(fiber)
```

### 5.4 中断时的资源清理

Fiber 被中断时，其内部 Scope 的 finalizer 仍会执行。这保证了资源不会因中断而泄漏：

```typescript
yield* Effect.scoped(
  Effect.gen(function* () {
    const fiber = yield* Effect.forkScoped(
      Effect.gen(function* () {
        // 注册 finalizer — 即使被中断也会执行
        yield* Effect.addFinalizer((_exit) =>
          Effect.sync(() => Console.log("资源已清理")),
        )

        yield* Effect.sleep("100 millis")  // 被中断
      }),
    )

    yield* Effect.sleep("5 millis")
    yield* Fiber.interrupt(fiber)  // 中断触发 finalizer
  }),
)
```

### 5.5 WeakRef 验证

可以使用 `WeakRef` 验证对象是否被正确回收（注意：GC 时机不确定）：

```typescript
let ref: WeakRef<object> | null = null

yield* Effect.scoped(
  Effect.gen(function* () {
    const obj = { data: new Array(1000) }
    ref = new WeakRef(obj)
    // obj 在 Scope 关闭后超出作用域
  }),
)

// Scope 关闭后，obj 不再被引用
const stillAlive = ref?.deref()  // 可能为 undefined（已被 GC）
```

### 5.6 泄漏预防清单

1. 始终使用 `forkScoped` 而非 `forkDaemon`（除非确有必要）
2. 使用 `Effect.scoped` 包裹所有资源获取代码
3. `fork` 后务必 `join` 或 `interrupt`
4. 在 Fiber 内部使用 `addFinalizer` 注册清理逻辑
5. 使用 `Scope.fork` 隔离不同生命周期的资源
6. 对于长时间运行的后台任务，使用 `forkDaemon` + 手动管理

---

## 六、Stream 缓冲内存控制

### 6.1 bufferChunks 容量

`bufferChunks` 的 `capacity` 参数直接控制 Stream 内部缓冲区的内存上限：

```typescript
Stream.fromIterable(data).pipe(
  Stream.bufferChunks({ capacity: 10 }),  // 最多缓冲 10 个元素
  Stream.mapEffect(slowConsumer),
)
```

| capacity | 内存占用 | 吞吐量 | 适用场景 |
|----------|---------|--------|---------|
| 1-5 | 低 | 低 | 内存敏感 |
| 10-50 | 中 | 中 | 一般场景 |
| 50+ | 高 | 高 | 生产者快于消费者，内存充裕 |

### 6.2 grouped 批量大小

`Stream.grouped(n)` 将 n 个元素合并为一个 Chunk。批量越大，单次处理的内存占用越大，但函数调用次数越少：

```typescript
// 小批量：频繁调用，但单批内存小
Stream.fromIterable(data).pipe(
  Stream.grouped(5),  // 每批 5 个元素
  Stream.mapEffect((chunk) => batchProcess(chunk)),
)

// 大批量：减少调用，但单批内存大
Stream.fromIterable(data).pipe(
  Stream.grouped(100),  // 每批 100 个元素
  Stream.mapEffect((chunk) => batchProcess(chunk)),
)
```

### 6.3 背压与内存

当生产者快于消费者时，Stream 的背压机制限制缓冲区增长。配合 `bufferChunks` 可以精确控制内存上限：

```typescript
// 生产者快、消费者慢 → 背压自动限制
const fastProducer = Stream.fromIterable(hugeDataset)

yield* fastProducer.pipe(
  Stream.bufferChunks({ capacity: 50 }),  // 缓冲区最多 50 个元素
  Stream.mapEffect(
    slowConsumer,
    { concurrency: 1 },  // 串行消费
  ),
  Stream.runForEach((result) => Effect.log(result)),
)
// 背压确保缓冲区不会超过 50，防止 OOM
```

### 6.4 大容量 Stream 的分批处理策略

对于大数据集，组合使用 `grouped` + `concurrency` 可在保持吞吐的同时控制内存：

```
策略 A: 逐元素、无限并发
  并发元素数 = 数据集大小 → 内存可能爆炸

策略 B: grouped=10, concurrency=3
  最大内存元素数 = 10 × 3 = 30 → 内存可控
```

```typescript
// 推荐策略：分批 + 限制并发
Stream.fromIterable(largeDataset).pipe(
  Stream.grouped(10),                    // 每批 10 个
  Stream.mapEffect(batchProcess, {
    concurrency: 3,                      // 最多 3 批并发
  }),
  Stream.runCollect,
)
// 最多 30 个元素同时在内存中
```

### 6.5 Stream 生命周期

Stream 消费完成（`runCollect`、`runForEach` 等）后，内部缓冲区自动释放。不需要手动清理：

```typescript
const results = yield* stream.pipe(Stream.runCollect)
// Stream 内部缓冲区已自动释放
```

---

## 七、Layer 生命周期与内存占用

### 7.1 Layer.scoped 的生命周期

`Layer.scoped` 是管理资源生命周期的推荐方式。它在 Layer 首次使用时初始化，在 Scope 关闭时销毁：

```typescript
const serviceLayer = Layer.scoped(
  Service,
  Effect.gen(function* () {
    // 初始化
    const conn = yield* acquireConnection()
    Console.log("[init] Service started")

    // 注册清理
    yield* Effect.addFinalizer((_exit) =>
      Effect.sync(() => {
        conn.close()
        Console.log("[destroy] Service stopped")
      }),
    )

    return { conn }
  }),
)
```

### 7.2 Layer.fresh vs 默认复用

默认情况下，同一个 Layer 实例会被复用（单例模式），减少内存分配。`Layer.fresh` 确保每次使用时创建新实例：

```typescript
// 默认：复用同一个实例
const sharedLayer = makeCounterLayer()
yield* Effect.gen(function* () {
  const svc1 = yield* CounterService  // 创建实例
  const svc2 = yield* CounterService  // 复用同一个实例
}).pipe(Effect.provide(sharedLayer), Effect.scoped)
// 创建 1 个实例

// Layer.fresh：每次提供新实例
const freshLayer = Layer.fresh(makeCounterLayer())
yield* Effect.gen(function* () {
  const svc1 = yield* CounterService  // 创建新实例
  const svc2 = yield* CounterService  // 创建另一个新实例
}).pipe(Effect.provide(freshLayer), Effect.scoped)
// 创建 2 个实例
```

### 7.3 Layer 内存模式对比

| 模式 | 内存占用 | 生命周期 | 适用场景 |
|------|---------|---------|---------|
| `Layer.succeed(tag, value)` | 最小 | 永久（引用已有对象） | 无状态配置 |
| `Layer.sync(tag, fn)` | 小 | 首次使用时调用 fn | 简单工厂 |
| `Layer.scoped(tag, effect)` | 中等 | Scope 管理 acquire/release | 数据库连接、文件句柄 |
| `Layer.fresh(layer)` | 较大 | 每次请求创建新实例 | 需要隔离的服务 |
| `Layer.merge(a, b, ...)` | 累加 | 所有子 Layer 共享 Scope | 依赖组合 |

### 7.4 使用建议

- **无状态配置**（如 timeout、API URL）→ `Layer.succeed`：零额外内存
- **需要初始化/销毁的资源**（如数据库连接池）→ `Layer.scoped`：自动生命周期
- **需要多实例隔离**（如测试场景）→ `Layer.fresh`：每次创建独立实例
- **默认复用单例**：减少不必要的内存分配

---

## 八、常见内存问题排查清单

| 问题 | 症状 | 排查方向 | 修复方式 |
|------|------|---------|---------|
| flatMap 链闭包累积 | 内存持续增长 | 检查长 flatMap 链中是否有大对象 | 改用 Effect.gen 或提前释放引用 |
| forkDaemon 泄漏 | Fiber 数持续增加 | 检查是否有未中断的 daemon Fiber | 改用 forkScoped 或手动 interrupt |
| Scope 未关闭 | 资源句柄耗尽 | 检查是否有未关闭的 Scope.make() | 确保 Scope.close 被调用 |
| Stream buffer 过大 | OOM 异常 | 检查 bufferChunks capacity | 减小 capacity 或使用 grouped |
| Layer 实例过多 | 内存占用高 | 检查 Layer.fresh 使用 | 改为默认复用模式 |
| 延迟 Effect 闭包 | 大对象存活过久 | 检查 Effect 闭包中是否捕获大对象 | 只捕获需要的值 |

---

## 九、小结

### 核心要点

1. **闭包引用链** — `flatMap` 链中闭包捕获的对象在整个链执行期间保持存活；`Effect.gen` 中变量在 `yield*` 后可以被 GC
2. **Scope LIFO 释放** — finalizer 按后进先出顺序执行，保证依赖关系正确的释放顺序
3. **错误不影响释放** — 即使 Effect 失败，Scope 中的 finalizer 仍会执行
4. **forkScoped 防泄漏** — 将 Fiber 绑定到 Scope，Scope 关闭时自动中断
5. **bufferChunks 控制内存** — capacity 参数直接限制 Stream 内存上限
6. **grouped + concurrency** — 分批处理 + 限制并发可在保持吞吐的同时控制内存
7. **Layer 默认复用** — 单例模式减少内存分配，需要隔离时使用 `Layer.fresh`

### 最佳实践

- 长链中有大对象时优先使用 `Effect.gen`
- 不再需要的大对象引用主动设为 `null`
- 使用 `forkScoped` 替代 `forkDaemon`（除非确有必要）
- 使用 `bufferChunks` + `grouped` 控制 Stream 内存
- 无状态配置使用 `Layer.succeed` 而非 `Layer.scoped`
- 在 Fiber 内部始终使用 `addFinalizer` 注册清理逻辑

### 下一章

第 17 章将深入 Effect-TS 的实现原理，包括 Effect 类型的内部结构、Fiber 运行时的事件循环机制、Layer 的依赖解析算法、Schema 的 AST 与编译器、以及 Stream 的 pull-based 实现。

---

## 参考

- [Effect-TS Scope 文档](https://effect.website/docs/resource-management/scope)
- [Effect-TS Fiber 文档](https://effect.website/docs/concurrency/fiber)
- [Effect-TS Stream 文档](https://effect.website/docs/streaming/stream)
- [Effect-TS Layer 文档](https://effect.website/docs/context-management/layer)
- [MDN: WeakRef](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakRef)
- [MDN: 垃圾回收](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_management)
