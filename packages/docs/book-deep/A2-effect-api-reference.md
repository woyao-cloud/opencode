# 附录 B：Effect-TS API 速查表

> 本书涉及的 Effect-TS 核心函数分类速查。基于 Effect v4 (4.0.0-beta.65)。

---

## B.1 核心类型

| 类型 | 签名 | 说明 |
|------|------|------|
| `Effect<A, E, R>` | 三维类型 | 成功值 A、错误 E、依赖 R |
| `Stream<A, E, R>` | 异步流 | 可中断、背压支持的异步数据流 |
| `Layer<S, E, R>` | 依赖层 | 描述如何从 R 构建 S |
| `Fiber<A, E>` | 纤程 | 正在执行的 Effect 句柄 |
| `Scope` | 作用域 | 资源生命周期管理器 |
| `Exit<A, E>` | 退出状态 | Success 或 Failure |
| `Cause<E>` | 错误原因 | Fail / Die / Interrupt / Parallel / Sequential |
| `Option<A>` | 可选值 | Some 或 None |
| `Deferred<A, E>` | 延迟承诺 | 一次性异步协调原语 |
| `PubSub<A>` | 发布订阅 | 多播事件总线 |
| `Queue<A>` | 队列 | 并发安全的消息队列 |
| `Semaphore` | 信号量 | 并发许可控制 |
| `SynchronizedRef<A>` | 同步引用 | 原子可变状态 |
| `Schedule<Out, In, R>` | 调度策略 | 重试/重复策略抽象 |
| `Duration` | 时间间隔 | 类型安全的时间表示 |
| `Config<A>` | 配置 | 声明式环境配置 |

## B.2 Effect 构造器

| 函数 | 用途 |
|------|------|
| `Effect.succeed(value)` | 创建成功 Effect |
| `Effect.fail(error)` | 创建失败 Effect |
| `Effect.sync(() => value)` | 包装同步操作 |
| `Effect.try({ try, catch })` | 包装可能抛异常的同步操作 |
| `Effect.gen(function* () { ... })` | Generator do-notation |
| `Effect.fn(name)(function* () { ... })` | 命名 Effect 函数（带追踪） |
| `Effect.fnUntraced(name)(function* () { ... })` | 命名 Effect 函数（无追踪） |
| `Effect.callback(resume)` | 回调式 API 转 Effect |

## B.3 Effect 组合器

| 函数 | 用途 |
|------|------|
| `Effect.map(effect, fn)` | 转换成功值 |
| `Effect.flatMap(effect, fn)` | 链式调用下一个 Effect |
| `Effect.all([e1, e2], { concurrency })` | 结构化并行 |
| `Effect.forEach(items, fn, { concurrency })` | 并行遍历 |
| `Effect.race(e1, e2)` | 竞速执行 |
| `pipe(value, fn1, fn2, ...)` | 链式组合 |

## B.4 错误处理

| 函数 | 用途 |
|------|------|
| `Effect.catchTag(effect, "Tag", handler)` | 按标签捕获 |
| `Effect.catchIf(effect, predicate, handler)` | 按条件捕获 |
| `Effect.catchAll(effect, handler)` | 捕获所有错误 |
| `Effect.catchCauseIf(effect, predicate, handler)` | 按 Cause 条件捕获 |
| `Effect.orDie(effect)` | 错误转 Defect |
| `Effect.ignore(effect)` | 忽略错误 |
| `Effect.retry(effect, schedule)` | 按策略重试 |
| `Effect.timeout(effect, duration)` | 超时控制 |
| `Effect.exit(effect)` | 获取 Exit（不抛异常） |

## B.5 资源管理

| 函数 | 用途 |
|------|------|
| `Effect.acquireRelease(acquire, release)` | 资源安全获取与释放 |
| `Effect.addFinalizer(finalizer)` | 注册清理回调 |
| `Effect.ensuring(effect, finalizer)` | 无论成败都清理 |
| `Effect.onInterrupt(effect, handler)` | 中断处理钩子 |
| `Scope.make()` | 创建 Scope |
| `Scope.addFinalizer(scope, finalizer)` | 向 Scope 注册清理 |
| `Scope.close(scope, exit)` | 关闭 Scope |

## B.6 并发控制

| 函数 | 用途 |
|------|------|
| `Effect.fork(effect)` | 独立 Fork |
| `Effect.forkIn(effect, scope)` | 在 Scope 中 Fork |
| `Effect.forkScoped(effect)` | 在当前 Scope 中 Fork |
| `Effect.forkChild(effect)` | Fork 子 Fiber（父等子） |
| `Fiber.join(fiber)` | 等待 Fiber 完成 |
| `Fiber.interrupt(fiber)` | 中断 Fiber |
| `Fiber.await(fiber)` | 等待 Fiber 完成（Exit 形式） |
| `Semaphore.make(permits)` | 创建信号量 |
| `Semaphore.withPermits(sem, n)(effect)` | 获取许可后执行 |

## B.7 Stream 操作

| 函数 | 用途 |
|------|------|
| `Stream.fromAsyncIterable(iter)` | 异步迭代器转 Stream |
| `Stream.fromPubSub(pubsub)` | PubSub 转 Stream |
| `Stream.fromIterable(items)` | 同步迭代器转 Stream |
| `Stream.tap(stream, fn)` | 对每个元素执行副作用 |
| `Stream.takeUntil(stream, predicate)` | 条件终止 |
| `Stream.runDrain(stream)` | 消费整个流 |
| `Stream.runCollect(stream)` | 收集所有元素 |
| `Stream.runForEach(stream, fn)` | 对每个元素执行 Effect |
| `Stream.scoped(effect)` | 资源安全的流包装 |

## B.8 Layer 操作

| 函数 | 用途 |
|------|------|
| `Layer.effect(Service, Effect.gen(...))` | 创建 Layer |
| `Layer.succeed(Service, impl)` | 创建静态值 Layer |
| `Layer.provide(layer, dep)` | 满足依赖 |
| `Layer.provideMerge(layer, dep)` | 合并并提供 |
| `Layer.mergeAll(l1, l2, ...)` | 合并多个 Layer |
| `Layer.suspend(() => layer)` | 懒创建 Layer |
| `ManagedRuntime.make(layer)` | 从 Layer 创建 Runtime |

## B.9 Schema 操作

| 函数 | 用途 |
|------|------|
| `Schema.Struct({ ... })` | 定义结构体 |
| `Schema.Union([...])` | 定义联合类型 |
| `Schema.Literal("value")` | 定义字面量类型 |
| `Schema.brand(schema, "Name")` | 创建品牌类型 |
| `Schema.TaggedErrorClass<...>()("Name", { ... })` | 创建标签错误类 |
| `Schema.decodeUnknownEffect(schema)(value)` | Schema 验证 + Effect 集成 |
| `Schema.optional(schema)` | 可选字段 |
| `Schema.mutable(schema)` | 可变类型 |

## B.10 配置与上下文

| 函数 | 用途 |
|------|------|
| `Config.string(name)` | 读取字符串配置 |
| `Config.boolean(name)` | 读取布尔配置 |
| `Config.withDefault(config, value)` | 带默认值的配置 |
| `Context.Service<Self, Interface>()("@scope/Name")` | 创建服务 Tag |
| `Context.Reference<A>("name", opts)` | 创建 Fiber 本地引用 |
| `Context.getReferenceUnsafe(ctx, ref)` | 读取 Fiber 本地引用 |
