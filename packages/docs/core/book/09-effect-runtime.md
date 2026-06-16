# Effect 运行时：应用的心脏

> **目标读者**：熟悉 Spring `ApplicationContext`、`@Configuration`、`@Bean` 的开发者。
> **本章目标**：理解 makeRuntime、MemoMap、Layer 组合——Effect 应用是如何启动和执行的。

---

## 9.1 从 Spring Boot 启动过程说起

### 9.1.1 Spring Boot 启动

```java
// Java Spring Boot
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        // 1. 创建 Spring ApplicationContext
        // 2. 扫描 @Component / @Service / @Repository
        // 3. 创建 Bean 实例（单例）
        // 4. 注入依赖（@Autowired）
        // 5. 运行 @PostConstruct
        // 6. 启动内嵌 Tomcat
        SpringApplication.run(Application.class, args);
    }
}
```

### 9.1.2 Effect 应用启动

```typescript
// TypeScript Effect
function main() {
  return Effect.gen(function* () {
    // 1. 创建 Effect Runtime
    const runtime = makeRuntime()

    // 2. 构建 Layer 图（相当于扫描 @Configuration）
    const appLayer = SessionProcessor.defaultLayer

    // 3. 启动服务
    const server = yield* Server.Default

    // 4. 监听端口
    yield* server.listen(8080)
  })
}

// 运行
const runtime = makeRuntime()
runtime.runPromise(main())
```

---

## 9.2 makeRuntime：三种执行模式

### 9.2.1 为什么需要 Runtime

Effect 代码不能直接在 JavaScript 引擎上运行——需要一个 Runtime 来管理：

- **Fiber 调度**：纤程的创建、暂停、恢复
- **资源管理**：Scope 的打开和关闭
- **Layer 去重**：MemoMap 确保单例

### 9.2.2 三种模式

```typescript
const runtime = makeRuntime()

// 模式 1: runPromise（适合应用入口）
// 返回 Promise，可以用 await
const result = await runtime.runPromise(
  Effect.gen(function* () {
    return yield* doSomething()
  })
)

// 模式 2: runFork（适合后台任务）
// 返回 Fiber，可以控制生命周期
const fiber = runtime.runFork(
  EventV2.Service.subscribe(MyEvent).pipe(
    Stream.runDrain    // 持续运行的流
  )
)
// fiber.await()   → 等待完成
// fiber.interrupt() → 中断纤程

// 模式 3: runCallback（适合事件回调）
runtime.runCallback(myEffect, (exit) => {
  if (Exit.isSuccess(exit)) {
    console.log("Success:", exit.value)
  } else {
    console.error("Failed:", exit.cause)
  }
})
```

### 9.2.3 对比 Java

```java
// Java 的三种执行方式

// 方式 1: 同步阻塞
String result = service.process();           // 类似 runPromise

// 方式 2: 异步线程
CompletableFuture<String> future =
    CompletableFuture.supplyAsync(() -> service.process());
future.get();                                // 类似 runFork + .await()

// 方式 3: 回调
service.processAsync(new Callback() {
    void onSuccess(String result) { ... }
    void onError(Throwable t) { ... }
});                                          // 类似 runCallback
```

---

## 9.3 Layer 组合：构建依赖图

### 9.3.1 什么是 Layer

**Layer = 服务的创建配方 + 服务的依赖声明**。

```typescript
// Layer<输出, 错误, 输入>
// Layer<这个 Layer 提供什么服务, 初始化可能出错, 需要什么依赖>
type SessionLayer = Layer<Session.Service, never, Database.Service | Config.Service>
//                        ↑                   ↑               ↑
//                     输出 Session        不会出错       需要 Database 和 Config
```

### 9.3.2 定义 Layer

```typescript
// 定义一个 Layer（类似 Spring 的 @Bean 方法）
const myLayer = Layer.effect(
  Session.Service,                    // 这个 Layer 提供 Session 服务
  Effect.gen(function* () {
    // 从上下文中获取依赖（类似 @Autowired）
    const db = yield* Database.Service
    const cfg = yield* Config.Service

    // 创建服务实例
    return Session.Service.of({
      create(input) {
        return db.insert("sessions", input)
      },
    })
  }),
)
```

### 9.3.3 组合 Layer

```typescript
// 提供依赖（类似 Spring 的自动装配）
const appLayer = myLayer.pipe(
  Layer.provide(databaseLayer),        // 提供 Database 依赖
  Layer.provide(configLayer),          // 提供 Config 依赖
)

// 或者合并多个 Layer
const allLayers = Layer.mergeAll(
  databaseLayer,
  configLayer,
  myLayer,
)
```

---

## 9.4 MemoMap：Layer 去重

### 9.4.1 解决什么问题

```typescript
// 两个服务都需要 Database 连接
const serviceA = Layer.effect(ServiceA, Effect.gen(function* () {
  const db = yield* Database.Service
  // ... 用 db 做点什么
}))

const serviceB = Layer.effect(ServiceB, Effect.gen(function* () {
  const db = yield* Database.Service
  // ... 也用 db 做点什么
}))

// 没有 MemoMap 的话：
// Database 会被初始化两次 → 两个数据库连接！
```

### 9.4.2 MemoMap 如何工作

```typescript
// 创建带 MemoMap 的 Runtime
const runtime = makeRuntime({ memoMap: MemoMap.make() })

// 现在 Layer 只会初始化一次
runtime.runFork(Layer.build(serviceA))  // Database 初始化
runtime.runFork(Layer.build(serviceB))  // Database 复用！不重新初始化
```

**工作原理**：

```
                        MemoMap
                          │
 runFork(serviceA)        │  get(DatabaseLayer) → miss → build → cache ✓
 runFork(serviceB)        │  get(DatabaseLayer) → HIT → 返回已缓存的实例
                          │
                          │  (相当于 Spring 的单例作用域)
```

**对比 Spring**：

| Spring | Effect | 说明 |
|--------|--------|------|
| `@Scope("singleton")` | MemoMap | 默认就是单例 |
| `@Scope("prototype")` | 不用 MemoMap | 每次都新建 |
| `ApplicationContext` | Runtime | 管理所有 Bean |
| `@Configuration` class | `Layer.mergeAll()` | 组装依赖图 |
| `@Autowired` 字段 | `yield* Service` | 从上下文中获取依赖 |

---

## 9.5 启动时序图：完整流程

```
Application                              makeRuntime                           MemoMap                          Fiber Runtime
Entry (main)                             (effect/runtime.ts)
    │                                         │                                  │                                  │
    │  makeRuntime()                          │                                  │                                  │
    │────────────────────────────────────────▶│                                  │                                  │
    │                                         │                                  │                                  │
    │                                         │  ① 创建 MemoMap                  │                                  │
    │                                         │     (用于 Layer 去重)             │                                  │
    │                                         │─────────────────────────────────▶│                                  │
    │                                         │                                  │                                  │
    │                                         │  ② 创建 FiberSet                 │                                  │
    │                                         │     (用于管理所有纤程)            │                                  │
    │                                         │─────────────────────────────────────────────────────────────────▶│
    │                                         │                                  │                                  │
    │◀── { runPromise, runFork,               │                                  │                                  │
    │       runCallback, memoMap }            │                                  │                                  │
    │                                         │                                  │                                  │
    │  runFork(Server.Default())              │                                  │                                  │
    │────────────────────────────────────────▶│                                  │                                  │
    │                                         │                                  │                                  │
    │                                         │  ③ 检查 MemoMap                  │                                  │
    │                                         │     get(Server.layer) → miss     │                                  │
    │                                         │─────────────────────────────────▶│                                  │
    │                                         │                                  │                                  │
    │                                         │                                  │  Layer.build() → 调用 init()    │
    │                                         │                                  │── 创建 Database 连接 ──────────▶│
    │                                         │                                  │── 注册 Session 服务 ──────────▶│
    │                                         │                                  │── 启动 HTTP 服务器 ───────────▶│
    │                                         │                                  │                                  │
    │                                         │                                  │◀── Service 实例 ◀──────────────│
    │                                         │◀── Service ◀───────────────────│                                  │
    │◀── Fiber (Server 已就绪) ──────────────│                                  │                                  │
    │                                         │                                  │                                  │
    │  runFork(SessionService.layer)           │                                  │                                  │
    │  (依赖 Database，和 Server 共享)       │                                  │                                  │
    │────────────────────────────────────────▶│                                  │                                  │
    │                                         │                                  │                                  │
    │                                         │  ④ 检查 MemoMap                  │                                  │
    │                                         │     get(Database.layer) → HIT    │                                  │
    │                                         │     (和 Server 共享同一个连接)   │                                  │
    │                                         │◀── 直接返回已缓存的实例 ────────│                                  │
    │                                         │                                  │                                  │
    │◀── Fiber (Session 已就绪) ──────────────│                                  │                                  │
```

---

## 9.6 Scope 和资源管理

### 9.6.1 问题

当用户关闭一个项目时，需要清理这个项目相关的所有资源：
- 数据库连接
- MCP 客户端连接
- 文件系统监听器
- 后台 Fiber

### 9.6.2 Scope 方案

```typescript
// 每个项目获取一个 Scope
Effect.scoped(
  Effect.gen(function* () {
    const scope = yield* Scope.Scope

    // 在这个 Scope 中 fork 的后台任务
    yield* Effect.forkIn(scope)(backgroundTask)

    // 注册清理器
    yield* Effect.addFinalizer(() =>
      Effect.log("Cleaning up project resources")
    )

    // 当 Scope 关闭时，所有资源自动清理
  })
)
```

**对比 Java**：

```java
// Java 需要手动管理资源
public class ProjectManager {
    private List<AutoCloseable> resources = new ArrayList<>();

    public void open() {
        Connection conn = DriverManager.getConnection(url);
        resources.add(conn);     // 需要手动注册

        Watcher watcher = FileSystems.getDefault().newWatchService();
        resources.add(watcher);  // 需要手动注册
    }

    public void close() {
        for (AutoCloseable r : resources) {
            r.close();           // 需要手动关闭
        }
    }
}

// Effect Scope: 自动完成，不需要手动管理
```

---

## 9.7 本章小结

| Java Spring | Effect Runtime | 优势 |
|------------|---------------|------|
| `SpringApplication.run()` | `makeRuntime()` | 返回三种执行模式 |
| `@Scope("singleton")` | MemoMap | 自动去重 |
| `@Configuration` | `Layer.mergeAll()` | 函数式组合 |
| `@Autowired` | `yield* Service` | 编译期检查 |
| `@PreDestroy` | `Effect.addFinalizer()` | 自动 Scope 管理 |
| `ApplicationContext` | `Runtime` | 更轻量，无 classpath 扫描 |

**下一章预告**：工具函数——Identifier、Flock、Log、Hash……这些看似不起眼的工具函数，构成了坚实的地基。我们将看到它们各自解决了什么问题。