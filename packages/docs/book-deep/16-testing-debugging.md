# 第 16 章：测试与调试

> **本章目标**：理解 Effect 的可测试性优势——Layer 替换注入 Mock、`TestClock` 模拟时间，掌握 opencode 的调试工具链。
> **涉及文件**：`packages/opencode/test/`、`packages/opencode/src/cli/cmd/debug/`
> **必备知识**：单元测试基础、Mock/Stub 概念

---

## 16.1 场景引入：如何测试一个 LLM 调用？

测试普通 Web 应用相对简单：Mock 数据库，发送 HTTP 请求，检查响应。但测试 AI 编程工具面临独特的挑战：

- **LLM 调用不可预测**——同样的输入可能得到不同的输出
- **LLM 调用昂贵**——每次测试都调用真实 LLM 会消耗大量 token
- **LLM 调用慢**——等待几秒到几十秒，测试套件会非常慢
- **时间依赖**——重试策略依赖时间（指数退避），测试不能真的等几秒

Effect-TS 的可测试性设计恰好解决了这些问题：你可以替换任何依赖（包括 LLM 服务），可以用 `TestClock` 模拟时间流逝，可以精确控制 Effect 的执行环境。

---

## 16.2 核心概念

### Effect 的可测试性：替换 Layer

Effect 的依赖注入让测试变得简单：**替换一个 Layer 就替换了一个依赖**。

```typescript
// 生产环境：使用真实的 LLM 服务
const productionLayer = Layer.provide(MyService.layer, LLM.defaultLayer)

// 测试环境：替换为 Mock LLM 服务
const mockLLM = Layer.succeed(LLM.Service, {
  stream: (input) => Stream.fromIterable([
    { type: "text-delta", textDelta: "Mock response" },
    { type: "finish-step", usage: { totalTokens: 100 } },
  ]),
})
const testLayer = Layer.provide(MyService.layer, mockLLM)
```

不需要修改被测代码，不需要依赖注入框架的"test profile"——只需要在测试中传入不同的 Layer。

### TestClock：模拟时间

Effect 的 `TestClock` 让你可以精确控制时间的流逝：

```typescript
// 测试重试策略
test("retry with exponential backoff", async () => {
  const testClock = yield* TestClock.TestClock

  // 启动一个会失败并重试的 Effect
  const fiber = yield* Effect.fork(failingEffect.pipe(Effect.retry(Schedule.exponential("2 seconds"))))

  // 第一次尝试立即失败
  await TestClock.adjust(testClock, Duration.seconds(0))
  // Fiber 正在等待 2 秒后重试

  // 快进 2 秒
  await TestClock.adjust(testClock, Duration.seconds(2))
  // Fiber 现在重试第二次

  // 快进 4 秒（第二次重试的等待时间）
  await TestClock.adjust(testClock, Duration.seconds(4))
  // Fiber 现在重试第三次
})
```

`TestClock` 让"等待 2 秒"的测试在毫秒级完成——时间被"快进"了。

### opencode 的测试结构

```
packages/opencode/test/
├── session/          # 会话测试（创建、恢复、压缩）
├── tool/             # 工具测试（read、write、grep、bash 等）
├── agent/            # Agent 测试（plan mode、子 Agent 权限）
├── permission/       # 权限测试（规则评估、通配符匹配）
├── effect/           # Effect 基础设施测试（app-runtime、bridge）
└── control-plane/    # 控制平面测试（workspace）
```

---

## 16.3 Effect-TS 函数详解

### `Layer.succeed` — 创建静态值 Layer

```
类型签名（简化）:
  Layer.succeed(Service, implementation: Interface): Layer<Service, never, never>
```

**用途**：创建一个"总是返回固定值"的 Layer。这是测试中 Mock 依赖的标准方式。

**与普通 TypeScript 的对比**：

```typescript
// 普通 TS：Mock 需要专门的 Mock 框架（jest.mock、sinon、ts-mockito）
jest.mock("../llm", () => ({ stream: jest.fn() }))

// Effect-TS：Layer.succeed 直接替换
const mockLLM = Layer.succeed(LLM.Service, {
  stream: (input) => mockStream(input),
})
// 类型安全——如果 mock 实现缺少方法或类型不对，编译期报错
```

**在 opencode 中的使用**：测试文件中大量使用 `Layer.succeed` 创建 Mock 服务。

### `TestClock` — 模拟时间

```
类型签名（简化）:
  TestClock.TestClock — 一个可以手动控制的时间源
  TestClock.adjust(clock, duration): Effect<void>
  TestClock.sleep(clock, duration): Effect<void>
```

**用途**：替代真实时钟，让测试可以精确控制时间流逝。

**与普通 TypeScript 的对比**：

```typescript
// 普通 TS：jest.useFakeTimers() + jest.advanceTimersByTime()
jest.useFakeTimers()
const promise = retryWithBackoff()
jest.advanceTimersByTime(2000)  // 快进 2 秒
await promise

// Effect-TS：TestClock
const clock = yield* TestClock.TestClock
const fiber = yield* Effect.fork(retryWithBackoff())
yield* TestClock.adjust(clock, Duration.seconds(2))
const result = yield* Fiber.join(fiber)
```

**在 opencode 中的使用**：测试重试策略时使用 `TestClock` 模拟时间流逝。

### `Effect.provide` / `Effect.provideService` — 覆盖依赖

```
类型签名（简化）:
  Effect.provide(effect, layer): Effect<A, E2, R2>
  Effect.provideService(effect, Tag, implementation): Effect<A, E, R - Tag>
```

**用途**：为 Effect 提供（或覆盖）依赖。`provide` 接受 Layer，`provideService` 直接提供单个服务的实现。

**在 opencode 中的使用**：测试中通过 `Effect.provide(testLayer)` 替换生产依赖为测试依赖。

### `Effect.runSync` — 同步执行纯 Effect

```
类型签名（简化）:
  Effect.runSync(effect: Effect<A, never, never>): A
```

**用途**：同步执行一个"纯"Effect（无异步操作、无依赖）。用于测试纯逻辑。

**在 opencode 中的使用**：测试纯函数（如 Schema 验证、通配符匹配）时使用 `runSync`。

### `Effect.runPromiseExit` — 获取 Exit 结果

```
类型签名（简化）:
  Effect.runPromiseExit(effect): Promise<Exit<A, E>>
```

**用途**：执行 Effect，以 `Exit` 形式返回结果（不抛异常）。用于测试"预期会失败"的场景。

**与普通 TypeScript 的对比**：

```typescript
// 普通 TS：测试预期失败需要 try/catch
test("should fail with specific error", async () => {
  try {
    await failingFunction()
    fail("Should have thrown")
  } catch (e) {
    expect(e).toBeInstanceOf(MyError)
  }
})

// Effect-TS：runPromiseExit 不抛异常
test("should fail with specific error", async () => {
  const exit = await Effect.runPromiseExit(failingEffect)
  expect(Exit.isFailure(exit)).toBe(true)
  expect(Exit.cause(exit)).toMatchObject({ _tag: "Fail", error: expect.any(MyError) })
})
```

**在 opencode 中的使用**：测试错误处理逻辑时使用 `runPromiseExit`。

---

## 16.4 实现剖析

### 测试中的 Layer 替换

opencode 的测试文件遵循统一模式：

```typescript
// 典型的测试结构
test("Session.create creates a session", async () => {
  // 1. 创建 Mock 依赖
  const mockBus = Layer.succeed(Bus.Service, {
    publish: (event) => Effect.void,
    subscribe: (type) => Effect.succeed(Stream.empty),
  })
  const mockDB = Layer.succeed(Database.Service, {
    insert: (table, values) => Effect.succeed(undefined),
    select: () => Effect.succeed([]),
  })

  // 2. 组装测试 Layer
  const testLayer = Session.layer.pipe(
    Layer.provide(mockBus),
    Layer.provide(mockDB),
    // ... 其他 Mock 依赖
  )

  // 3. 执行测试
  const result = await Effect.runPromise(
    Session.create({ title: "test" }).pipe(Effect.provide(testLayer))
  )

  // 4. 验证结果
  expect(result.title).toBe("test")
})
```

### 调试技巧

opencode 提供了多个调试入口：

1. **`Effect.fn` 命名追踪** — 每个 `Effect.fn("Name")` 创建一个 OpenTelemetry span。在 Jaeger/Zipkin 中可以可视化整个调用链。

2. **`--log-level DEBUG`** — 开启详细日志，每个 Effect 操作都有日志输出。

3. **`--print-logs`** — 实时打印 Effect 调用链到终端。

4. **`opencode debug agent`** — 测试特定 Agent 的工具执行，不经过完整的 CLI 流程。

5. **`Effect.withSpan`** — 手动添加追踪点，标记关键路径。

---

## 16.5 开发人员必备知识与技能

1. **Effect 测试框架** — Effect 没有专门的测试框架——它直接使用 Vitest/Jest。可测试性来自 Layer 系统，而非测试框架。关键技能：用 `Layer.succeed` 创建 Mock，用 `Layer.provide` 替换依赖。

2. **Mock 策略** — 优先 Mock 外部边界（LLM、数据库、文件系统），而非内部逻辑。opencode 的测试通常 Mock `LLM.Service`（返回固定的事件流）和 `Database.Service`（返回固定的查询结果），但使用真实的 `Schema` 验证和 `Permission` 评估。

3. **TestClock 使用场景** — `TestClock` 适合测试：重试策略、超时逻辑、定期任务（如快照清理）、缓存过期。不适合测试：真实网络延迟、真实文件 I/O 耗时。

4. **调试工具链** — OpenTelemetry + Jaeger 是 Effect 应用的标准调试工具链。`Effect.fn` 自动创建 span，`Effect.withSpan` 手动添加。在开发阶段，`--print-logs` 是最快的调试方式。

---

## 16.6 本章小结

- Effect 的可测试性来自 Layer 系统——替换 Layer 就替换了依赖，无需 Mock 框架
- `Layer.succeed` 创建静态 Mock 服务，`Layer.provide` 替换生产依赖
- `TestClock` 模拟时间流逝，让"等待 2 秒"的测试在毫秒级完成
- `Effect.runSync` 测试纯逻辑，`Effect.runPromiseExit` 测试预期失败（不抛异常）
- opencode 的测试覆盖 session、tool、agent、permission、effect、control-plane
- 调试工具链：`Effect.fn` 命名追踪 → OpenTelemetry → Jaeger，`--print-logs` 实时查看调用链
