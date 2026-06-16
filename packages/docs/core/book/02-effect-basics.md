# Effect 基础：从 CompletableFuture 到 Effect

> **目标读者**：熟悉 Java `CompletableFuture`、`try/catch`、`@Autowired` 依赖注入的开发者。
> **本章目标**：理解 Effect 如何解决 Promise 的三大痛点——错误处理、依赖注入、并发控制。

---

## 2.1 从一个真实的场景开始

假设我们要实现一个"用户发送消息 → AI 生成回复 → 保存到数据库"的功能。

### 2.1.1 Java 的 Promise 写法

```java
// Java
public CompletableFuture<Message> processMessage(String content) {
    return CompletableFuture.supplyAsync(() -> {
        // 1. 调用 AI API
        return aiClient.generate(content);
    }).thenCompose(reply -> {
        // 2. 保存到数据库
        return messageRepository.save(reply);
    }).exceptionally(error -> {
        // 3. 错误处理
        log.error("Failed to process message", error);
        throw new RuntimeException(error);
    });
}
```

这段代码有什么问题？

1. **错误类型丢失**：`.exceptionally()` 捕获所有异常，无法区分"AI 服务不可用"和"数据库连接失败"
2. **依赖不明确**：`aiClient` 和 `messageRepository` 从哪来的？全局变量？Spring 注入？
3. **无法组合重试**：如果 AI 调用超时了想重试，需要自己写循环

### 2.1.2 Effect 的写法

```typescript
// TypeScript + Effect
function processMessage(content: string) {
  return Effect.gen(function* () {
    // 1. 依赖在哪里？通过 Effect 上下文获取
    const ai = yield* AIService
    const db = yield* DatabaseService

    // 2. 调用 AI API（错误是类型安全的）
    const reply = yield* ai.generate(content).pipe(
      Effect.retry(Schedule.exponential("1 seconds"))  // 声明式重试
    )

    // 3. 保存到数据库
    const saved = yield* db.save(reply)

    return saved
  })
}

// 错误类型在编译期就知道
type ProcessError = AIServiceError | DatabaseError
```

**关键差异**：
- 依赖**不是全局的**，通过 Effect 上下文（`yield* AIService`）获取
- 重试**不是手写的**，通过 `Effect.retry()` 声明式组合
- 错误**不是丢失的**，错误类型在编译期就确定了

---

## 2.2 Effect 三部曲：理解 `<A, E, R>`

### 2.2.1 三个类型参数

```typescript
// Effect<A, E, R> 的三个类型参数：
//   A = Success Type  (成功时返回值的类型)
//   E = Error Type    (失败时错误的类型)
//   R = Requirements  (执行这个 Effect 需要的依赖)

// 示例
type MyEffect = Effect<string, HttpError, AIService | DatabaseService>
//                ↑           ↑            ↑
//              成功返回 string │           需要 AIService 和 DatabaseService
//                           错误是 HttpError
```

### 2.2.2 类比 Java

```java
// Java 中，类似的效果需要用多个机制组合：
//   A  = 方法的返回值类型
//   E  = checked exception (但 Java 不一定抛出)
//   R  = 方法的参数 + @Autowired 依赖

// Java
public CompletableFuture<String> process() throws HttpError {
    AIService ai = SpringContext.getBean(AIService.class);  // 依赖从外部获取
    DatabaseService db = SpringContext.getBean(DatabaseService.class);
    // ...
}
```

**Effect 的优雅之处**：A、E、R 三个维度都在**类型系统**中体现，编译器会检查你是否处理了所有错误、是否提供了所有依赖。

### 2.2.3 在 OpenCode 中的实际使用

```typescript
// packages/core/src/event.ts:84
export class Service extends Context.Service<Service, Interface>()("@opencode/Event") {}

// packages/core/src/event.ts:86-153
export const layer = Layer.effect(
  Service,                     // 要提供的服务
  Effect.gen(function* () {    // 服务的初始化逻辑
    const all = yield* PubSub.unbounded<Payload>()
    return Service.of({ publish, subscribe, all: streamAll, sync })
  }),
)
// 这里的 Effect 是 Effect<Service, never, never>
// A = Service（成功时返回 Service 实例）
// E = never（不可能失败）
// R = never（不需要额外依赖）
```

---

## 2.3 Effect.gen：命令式风格的异步编程

### 2.3.1 对比 Java 和 TypeScript

```javascript
// Java: 命令式风格
// 你写的是"怎么做"
public String process(String input) {
    String result = step1(input);       // 同步
    String enhanced = step2(result);    // 同步
    return enhanced;
}

// TypeScript Promise: 链式风格
// 你写的是"回调怎么组织"
async function process(input: string): Promise<string> {
    const result = await step1(input)
    const enhanced = await step2(result)
    return enhanced
}

// TypeScript Effect: 命令式风格 + 可组合
// 你写的是"怎么做"，和 Java 一样直观
function process(input: string): Effect<string, Error, never> {
    return Effect.gen(function* () {
        const result = yield* step1(input)    // yield* 类似 await
        const enhanced = yield* step2(result) // 但比 await 更强大
        return enhanced
    })
}
```

### 2.3.2 yield* 和 await 的区别

```typescript
// await 只能等 Promise
const result = await fetch(url)

// yield* 可以等任何"可组合"的对象
const user = yield* findUser(id)                    // Effect
const count = yield* countUsers.pipe(               // Effect + pipe
  Effect.timeout("5 seconds")
)
const stream = yield* EventV2.Service.subscribe(    // Stream
  SessionCreated
)
```

**对 Java 开发者来说**：`yield*` 可以理解为"智能版的 `await`"——它不仅能等待异步操作，还能附加超时、重试、资源管理等行为。

### 2.3.3 Effect.fn：命名你的 Effect

```typescript
// packages/core/src/auth.ts:156-158
get: Effect.fn("AuthV2.get")(function* (accountID) {
  return (yield* SynchronizedRef.get(state)).accounts[accountID]
}),

// 为什么命名？
// 1. 堆栈跟踪能显示 "AuthV2.get" 而不是 "anonymous"
// 2. OpenTelemetry 能追踪这个特定的 Effect
// 3. 调试时能知道当前执行到哪里
```

---

## 2.4 错误处理：Effect 的 try/catch

### 2.4.1 Effect 的条件错误

Java 中用 `try/catch` 处理错误，Effect 中用 `Effect.catchTags` / `Effect.catchAll`：

```java
// Java
try {
    return process();
} catch (FileNotFoundException e) {
    return fallback();
} catch (IOException e) {
    throw new RuntimeException(e);
}
```

```typescript
// TypeScript Effect
yield* process().pipe(
  Effect.catchTags({
    FileNotFound: () => fallback(),   // 只捕获 FileNotFound 错误
    // IOException: 没处理 → 编译错误！
  })
)
// 更安全的版本：所有错误分支都要覆盖
// 或者用 catchAll 兜底
```

### 2.4.2 TaggedError：类型安全的错误层次

```typescript
// packages/core/src/catalog.ts:16-26
// 定义类型安全的错误
export class ProviderNotFoundError extends Schema.TaggedErrorClass<ProviderNotFoundError>()(
  "CatalogV2.ProviderNotFound",
  { providerID: ProviderV2.ID },  // 错误携带的数据
) {}

export class ModelNotFoundError extends Schema.TaggedErrorClass<ModelNotFoundError>()(
  "CatalogV2.ModelNotFound",
  { providerID: ProviderV2.ID, modelID: ModelV2.ID },
) {}

// 使用
yield* Catalog.Service.model.get(providerID, modelID).pipe(
  // 使用 catchTags 捕获特定的标签错误
  Effect.catchTags({
    CatalogV2ProviderNotFound: (err) =>
      Effect.succeed(defaultModel),
    CatalogV2ModelNotFound: (err) =>
      Effect.fail(new UserVisibleError(`Model ${err.modelID} not found`)),
  })
)
```

**对 Java 开发者来说**：`Schema.TaggedErrorClass` 类似于创建 checked exception，但区别在于：
1. 错误类型是**名义上唯一**的（通过字符串标签 `"CatalogV2.ProviderNotFound"`）
2. 用 `catchTags` 可以精确捕获，不会意外吞错
3. 忘记处理某个错误类型会触发**编译错误**

### 2.4.3 对比：Java 异常体系 vs Effect 错误体系

| Java | Effect |
|------|--------|
| `class MyException extends Exception` | `class MyError extends Schema.TaggedErrorClass` |
| `try { ... } catch (MyException e) { ... }` | `Effect.catchTag("MyError", handler)` |
| `throw new MyException(msg)` | `yield* Effect.fail(new MyError({...}))` |
| `throws` 声明（可选） | `E` 类型参数（强制） |
| `finally { cleanup() }` | `Effect.ensuring(cleanup())` |
| 运行期才知道抛什么异常 | 编译期就知道所有错误类型 |

---

## 2.5 依赖注入：Layer vs Spring @Autowired

### 2.5.1 Spring 的依赖注入

```java
// Java Spring
@Service
public class UserService {
    @Autowired
    private UserRepository repository;  // 字段注入

    @Autowired
    private AIClient aiClient;         // 字段注入

    public User process(String input) {
        // 直接用，不知道它们从哪来
    }
}
```

Spring 的问题：依赖是**隐式**的——看 `@Service` 注解不知道它需要什么，运行期才会报 `NoSuchBeanDefinitionException`。

### 2.5.2 Effect 的依赖注入

```typescript
// TypeScript Effect

// 1. 定义服务（类似 Spring 的接口）
export class Service extends Context.Service<Service, Interface>()("@opencode/LLM") {}

// 2. 创建 Layer（类似 Spring 的 @Bean 方法）
const live: Layer.Layer<
  Service,                              // 这个 Layer 提供什么服务
  never,                                // 创建时可能出错吗
  Auth.Service | Config.Service | ...   // 需要什么依赖（R 参数）
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const auth = yield* Auth.Service     // 从上下文中获取依赖
    const config = yield* Config.Service
    // ...
    return Service.of({ stream })
  }),
)

// 3. 组装（类似 Spring 的 @Configuration）
export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Auth.defaultLayer),      // 提供 Auth 依赖
    Layer.provide(Config.defaultLayer),    // 提供 Config 依赖
  )
)
```

### 2.5.3 关键区别

| 特性 | Spring | Effect |
|------|--------|--------|
| 依赖定义 | `@Autowired` 字段 | `yield* Service` 表达式 |
| 依赖可见性 | 运行时（可能找不到 Bean） | 编译时（R 参数） |
| Bean 范围 | 单例/原型/请求 | Layer（可组合、可清理） |
| 循环依赖 | Spring 能处理（三级缓存） | Effect 编译时就会拒绝 |
| 测试替换 | `@MockBean` | `Layer.provide(mockLayer)` |

### 2.5.4 测试时替换依赖

```typescript
// 测试：替换真实 Auth 为 mock
const testAuthLayer = Layer.effect(
  Auth.Service,
  Effect.sync(() => Auth.Service.of({
    get: () => Effect.succeed(mockAccount),
    // ...
  })),
)

// 在其他环境使用不同依赖
const testLayer = realLayer.pipe(
  Layer.provide(testAuthLayer),  // 覆盖 Auth 依赖
)
```

---

## 2.6 Fiber：轻量级并发 vs Java Thread

### 2.6.1 线程 vs 纤程

```java
// Java 线程（重量级）
Thread thread = new Thread(() -> {
    // 每个线程 1MB+ 栈内存
    // 上下文切换成本高
});
thread.start();
```

```typescript
// TypeScript Effect 纤程（轻量级）
const fiber = yield* Effect.forkIn(scope)(
  backgroundTask  // 纤程只占几个对象的内存
)
// 纤程的上下文切换几乎是零成本的
```

### 2.6.2 在 OpenCode 中的实际使用

```typescript
// packages/core/src/event.ts:102-107
// 服务关闭时清理所有 PubSub
yield* Effect.addFinalizer(() =>
  Effect.gen(function* () {
    yield* PubSub.shutdown(all)                    // 关闭主 PubSub
    yield* Effect.forEach(                         // 并行关闭所有类型 PubSub
      typed.values(),
      PubSub.shutdown,
      { discard: true, concurrency: "unbounded" },  // 无限并发
    )
  }),
)
```

`{ concurrency: "unbounded" }` 就是 Effect 的并发控制——同时关闭所有 PubSub，相当于 Java 的 `ExecutorService.invokeAll()`，但不用手动管理线程池。

---

## 2.7 本章小结

| Java 概念 | Effect 对应 | 为什么要换 |
|-----------|------------|-----------|
| `CompletableFuture<T>` | `Effect<A, E, R>` | 多了错误类型 E 和依赖 R |
| `async/await` | `Effect.gen` + `yield*` | 更强大的组合能力 |
| `try/catch/finally` | `catchTags` / `ensuring` | 编译期安全检查 |
| `@Autowired` | `yield* Service` | 依赖显式、可测试 |
| `ThreadPoolExecutor` | `Effect.forkIn` + `concurrency` | 零成本抽象 |
| `@Service + @Bean` | `Context.Service + Layer` | 类型安全的 DI |
| `throws Exception` | `E` 类型参数 | 强制处理 |
| `CompletableFuture.allOf` | `Effect.all({concurrency})` | 更简洁的并发控制 |

**关键领悟**：
- Effect = Promise + try/catch + DI + Retry + Timeout 的统一抽象
- 所有"副作用"都在 Effect 中显式表达
- 编译器是你最好的朋友——它知道哪里可能出错

**下一章预告**：有了 TypeScript 和 Effect 的基础，我们将深入 OpenCode 的第一个核心模块——Schema 系统，看看它如何用类型安全的方式处理 JSON 序列化。