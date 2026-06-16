# Effect 运行时：应用的心脏

> **目标读者**：熟悉 Spring `ApplicationContext`、`@Configuration`、`@Bean` 的开发者。
> **本章目标**：理解 makeRuntime、MemoMap、Layer 组合——Effect 应用是如何启动和执行的。

---

## 9.1 从 Spring Boot 的启动过程开始

### 9.1.1 一个 Java 开发者眼中的"启动"

如果你写过 Spring Boot 应用，你一定对启动过程很熟悉：

```java
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        // 这行代码背后发生了什么？
        SpringApplication.run(Application.class, args);
    }
}
```

`SpringApplication.run()` 背后做的事情：

1. **扫描 classpath**——找到所有带 `@Component`、`@Service`、`@Repository` 注解的类
2. **创建 Bean 定义**——解析每个注解类的元数据
3. **依赖注入**——按 `@Autowired` 的声明建立 Bean 之间的依赖关系
4. **解决循环依赖**——用三级缓存处理 A → B → A 的情况
5. **执行 @PostConstruct**——调用每个 Bean 的初始化方法
6. **启动 Web 服务器**——启动内嵌的 Tomcat/Undertow

整个过程快则几秒，慢则几十秒——而且大部分时间花在 classpath 扫描和反射上。

### 9.1.2 Effect 应用的启动过程

现在看 Effect 的启动——要简单得多：

```typescript
// Effect 应用的 main 函数
function main() {
  return Effect.gen(function* () {
    // 1. 构建服务
    const server = yield* Server.Default

    // 2. 启动
    yield* server.listen(8080)
  })
}

// 执行
const runtime = makeRuntime()
runtime.runPromise(main())
```

整个启动过程的核心是 `makeRuntime()`——它创建了一个 Effect Runtime，相当于 Spring 的 `ApplicationContext`，但轻量得多：

| Spring | Effect Runtime |
|--------|---------------|
| `ApplicationContext` | `Runtime` |
| 扫描 classpath（秒级） | 显式组合 Layer（微秒级） |
| 反射创建 Bean | 函数创建 Service |
| 三级缓存解决循环依赖 | 编译期拒绝循环依赖 |
| 启动过程几十秒 | 启动过程几毫秒 |

---

## 9.2 makeRuntime：三种执行模式

### 9.2.1 为什么需要 Runtime

Effect 代码不能直接在 JavaScript 引擎上执行——需要一个 Runtime 来管理：

- **Fiber 调度**——纤程的创建、暂停、恢复
- **资源生命周期**——Scope 的打开和自动关闭
- **Layer 去重**——确保每个 Service 只初始化一次
- **错误传播**——Fiber 之间的错误传递

`makeRuntime` 创建了这样一个 Runtime，并返回三种执行模式：

```typescript
// 创建 Runtime
const runtime = makeRuntime()

// 模式 1：runPromise——适合应用入口
// 返回一个 Promise，可以用 await 等待完成
const result = await runtime.runPromise(
  Effect.gen(function* () {
    // 你的应用逻辑
    return "done"
  })
)
console.log(result)  // "done"

// 模式 2：runFork——适合后台任务
// 返回一个 Fiber，可以控制生命周期
const fiber = runtime.runFork(
  // 一个持续运行的监听器
  EventV2.Service.subscribe(SessionCreated).pipe(
    Stream.tap((event) => handleEvent(event)),
    Stream.runDrain,
  )
)
// 之后可以：
// fiber.await()    → 等待完成
// fiber.interrupt() → 中断纤程

// 模式 3：runCallback——适合事件回调
// 通过回调获取执行结果
runtime.runCallback(
  myEffect,
  (exit) => {
    if (Exit.isSuccess(exit)) {
      console.log("Success:", exit.value)
    } else {
      console.error("Failed:", exit.cause)
    }
  },
)
```

### 9.2.2 对比 Java 的三种执行模式

```java
// Java

// 模式 1：同步方法（类似 runPromise）
String result = service.process();

// 模式 2：异步线程（类似 runFork）
CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> {
    return service.process();
});
// future.get() → 等待结果

// 模式 3：回调（类似 runCallback）
service.processAsync(new Callback<String>() {
    void onSuccess(String result) { ... }
    void onError(Throwable t) { ... }
});
```

Java 的三种模式用了三种不同的机制（同步调用、`CompletableFuture`、回调接口）。Effect 的三种模式都基于同一个 Runtime——只是"如何获取结果"的方式不同。

---

## 9.3 Layer：服务的"配方"

### 9.3.1 什么是 Layer

**Layer = 一个服务的完整创建方案**。

它包括三部分信息：
1. **输出什么**——创建完成后提供什么 Service
2. **需要什么**——创建这个 Service 需要哪些其他 Service
3. **怎么创建**——拿到依赖后如何初始化

```typescript
// Layer<提供什么, 可能出错, 需要什么>
// 类比 Java:
//   Layer<A, E, R> = @Bean(提供A) + throws E + @Autowired R

type DatabaseLayer = Layer<
  Database.Service,        // 提供：Database 服务
  ConfigError,             // 可能错：配置错误
  Config.Service           // 需要：Config 服务才能创建
>
```

### 9.3.2 定义和组合 Layer

```typescript
// 1. 定义一个 Layer（类似于 Spring 的 @Bean 方法）
const databaseLayer = Layer.effect(
  Database.Service,                    // 这个 Layer 提供 Database 服务
  Effect.gen(function* () {
    const config = yield* Config.Service  // 从上下文中获取依赖
    const db = createDatabase(config)      // 创建数据库连接
    return Database.Service.of({ query: db.query, save: db.save })
  }),
)

// 2. 提供依赖（类似于 Spring 自动装配）
const appLayer = databaseLayer.pipe(
  Layer.provide(configLayer)           // 提供 Config 依赖
)

// 3. 或者合并多个 Layer
const allLayers = Layer.mergeAll(
  configLayer,
  databaseLayer,
  serviceLayer,
)

// 4. 构建完整的依赖图
runtime.runFork(Layer.build(appLayer))
```

### 9.3.3 对比 Spring 的 @Configuration

```java
// Java Spring
@Configuration
public class AppConfig {
    @Bean
    public DatabaseService databaseService(ConfigService config) {
        return new DatabaseService(config);
    }

    @Bean
    public UserService userService(DatabaseService db) {
        return new UserService(db);
    }
}
```

```typescript
// Effect
const AppLayer = Layer.mergeAll(
  Layer.effect(Database.Service, Effect.gen(function* () {
    const config = yield* Config.Service
    return Database.Service.of({ ... })
  })),
  Layer.effect(UserService.Service, Effect.gen(function* () {
    const db = yield* Database.Service
    return UserService.Service.of({ ... })
  })),
)
```

**关键区别**：

| Spring @Configuration | Effect Layer |
|----------------------|-------------|
| 通过反射创建 Bean | 通过函数创建 Service |
| 运行时才知道依赖是否完整 | 编译期就知道 |
| 启动失败在运行期报错 | 启动失败可以在编译期发现 |
| 隐式注册（扫描） | 显式组合 |

---

## 9.4 MemoMap：为什么 Layer 不会重复初始化

### 9.4.1 一个经典问题

假设两个 Service 都需要 Database 连接：

```typescript
// ServiceA 需要 Database
const serviceA = Layer.effect(ServiceA, Effect.gen(function* () {
  const db = yield* Database.Service  // 获取 Database
  return ServiceA.of({ ... })
}))

// ServiceB 也需要 Database
const serviceB = Layer.effect(ServiceB, Effect.gen(function* () {
  const db = yield* Database.Service  // 也获取 Database
  return ServiceB.of({ ... })
}))
```

如果没有 MemoMap，`Database.Service` 会被初始化两次——两个数据库连接。对于 SQLite 来说这可能是两个文件句柄，对于 PostgreSQL 来说是两个 TCP 连接。

### 9.4.2 MemoMap 如何解决

```typescript
// 创建带 MemoMap 的 Runtime
const runtime = makeRuntime({ memoMap: MemoMap.make() })

// 现在 Layer 只会初始化一次
runtime.runFork(Layer.build(serviceA))  // Database 初始化，缓存
runtime.runFork(Layer.build(serviceB))  // Database 复用缓存
```

**MemoMap 的工作原理**——一个"已初始化 Layer"的缓存：

```
                                              MemoMap
                                                │
 serviceA 被 build:                            │
   → 需要 DatabaseService                      │
   → MemoMap.get(DatabaseLayer)                │
   → miss → 执行数据库初始化                    │
   → 缓存 DatabaseService 实例                  │
   → 返回给 serviceA                           │
                                                │
 serviceB 被 build:                            │
   → 需要 DatabaseService                      │
   → MemoMap.get(DatabaseLayer)                │
   → HIT! 直接返回缓存的实例                    │
   → 不重新初始化数据库                          │
```

**类比 Spring**：Spring 默认就是单例——`@Scope("singleton")`。Effect 的 MemoMap 实现了同样的语义。

**为什么不需要 @Scope("prototype") 模式？**

因为在 Effect 中，如果你真的需要每次都新建实例，你可以不在 Layer 中注册它——直接 `new MyService()`。Layer 是为"全局唯一的服务"设计的——数据库连接、配置、认证服务，这些天然就是单例。

---

## 9.5 完整启动时序图

```
应用入口                makeRuntime                   MemoMap                   Fiber Runtime
(main.ts)
    │
    │  makeRuntime()
    │────────────────────────────────────────────────▶
    │                                                  │
    │                    ① 创建 MemoMap                 │
    │                    (空缓存，等待 Layer 注册)       │
    │                    ──────────────────────────────▶│
    │                                                  │
    │                    ② 创建 FiberSet                │
    │                    (Fiber 调度器)                  │
    │                    ───────────────────────────────────────────────▶│
    │                                                  │                  │
    │◀── { runPromise, runFork,                       │                  │
    │       runCallback, memoMap }                    │                  │
    │                                                  │                  │
    │  runFork(Server.Default())                       │                  │
    │────────────────────────────────────────────────▶│                  │
    │                                                  │                  │
    │                    ③ MemoMap.get(Server.layer)   │                  │
    │                    → miss（第一次启动）            │                  │
    │                    ──────────────────────────────▶│                  │
    │                                                  │                  │
    │                                                  │  Layer.build()   │
    │                                                  │  → 初始化 Database│
    │                                                  │  → 注册 Session  │
    │                                                  │  → 启动 HTTP     │
    │                                                  │─────────────────▶│
    │                                                  │                  │
    │                                                  │◀── 所有服务就绪 ─│
    │                    ◀── Service 实例 ─────────────│                  │
    │◀── Fiber (Server 已启动) ──────────────────────│                  │
    │                                                  │                  │
    │  runFork(BackgroundWorker.layer)                  │                  │
    │  (需要 Database，和 Server 共享同一个连接)        │                  │
    │────────────────────────────────────────────────▶│                  │
    │                                                  │                  │
    │                    ④ MemoMap.get(Database.layer) │                  │
    │                    → HIT！（和 Server 共享）       │                  │
    │                    ◀── 直接返回已缓存的实例 ─────│                  │
    │                                                  │                  │
    │◀── Fiber (Worker 已就绪) ──────────────────────│                  │
```

---

## 9.6 Scope：资源生命周期管理

### 9.6.1 一个真实的资源泄漏问题

假设你的应用打开了一个文件监听器：

```typescript
// 如果没有 Scope，资源会泄漏
function startWatcher() {
  return Effect.gen(function* () {
    const watcher = yield* openFileWatcher("/path")

    // 监听文件变化
    yield* Effect.forkIn(scope)(
      watcher.onChange((file) => handleChange(file))
    )

    // 问题：当应用关闭时，watcher 谁来关闭？
  })
}
```

在 Java 中，你会实现 `AutoCloseable`，然后用 `try-with-resources`：

```java
// Java
try (Watcher watcher = new FileWatcher("/path")) {
    watcher.onChange(file -> handleChange(file));
    // try 块结束时，watcher.close() 自动调用
}
```

### 9.6.2 Effect 的 Scope

```typescript
// Effect Scope 提供了类似的"自动清理"语义
Effect.scoped(
  Effect.gen(function* () {
    // 在这个 scoped 块中获取的资源
    const watcher = yield* openFileWatcher("/path")
    const scope = yield* Scope.Scope

    // 注册清理器
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => watcher.close())
    )

    // fork 到当前 scope 的 fiber
    yield* Effect.forkIn(scope)(
      watcher.onChange((file) => handleChange(file))
    )

    // 当 scoped 块结束时：
    // 1. 所有 forkIn(scope) 的 fiber 被中断
    // 2. 所有 addFinalizer 被按注册顺序的反向执行
    // 3. watcher.close() 被自动调用
  })
)
```

**Scope 的生命周期**：

```
scope 创建 → 资源注册 → scope 关闭
                │               │
                │               ├── 1. 中断所有 forkIn 的 fiber
                │               ├── 2. 按 LIFO 顺序执行 finalizer
                │               └── 3. 释放所有资源
                │
                ├── forkIn(scope)(fiber) → fiber 生命周期绑定到 scope
                ├── addFinalizer(cleanup) → 注册清理函数
                └── 可嵌套 → 内层 scope 先关闭
```

**对比 Java**：

| 场景 | Java | Effect |
|------|------|--------|
| 单个资源清理 | `try-with-resources` | `Effect.acquireRelease` |
| 多个资源清理 | 手动管理或嵌套 try | `Effect.scoped` + `addFinalizer` |
| 后台任务清理 | 手动管理线程池 | `forkIn(scope)` 自动中断 |
| 任意时刻关闭 | 调 `close()` | Scope 关闭触发所有清理 |

---

## 9.7 ⚠️ 常见错误

**错误 1：忘记提供 Layer 依赖**

```typescript
// ❌ 错误：只提供了 LLM Layer，忘了 Auth Layer
const app = LLM.layer.pipe(
  Layer.provide(Config.defaultLayer),
  // 没提供 Auth.defaultLayer → 编译错误或运行时报错
)

// ✅ 正确：提供所有依赖
const app = LLM.layer.pipe(
  Layer.provide(Config.defaultLayer),
  Layer.provide(Auth.defaultLayer),
)
```

**错误 2：在 makeRuntime 之外使用 runFork**

```typescript
// ❌ 错误：没有 Runtime 就 fork
const fiber = Effect.forkIn(scope)(myTask)  // 需要在 Runtime 中运行

// ✅ 正确：通过 Runtime fork
const runtime = makeRuntime()
runtime.runFork(myTask)
```

---

## 9.8 本章小结

| Java Spring | Effect Runtime | 核心区别 |
|------------|---------------|----------|
| `SpringApplication.run()` | `makeRuntime()` | 无需 classpath 扫描 |
| `@Scope("singleton")` | MemoMap | 自动去重 |
| `@Configuration` `@Bean` | `Layer.effect` + `Layer.mergeAll` | 函数式组合 |
| `@Autowired` | `yield* Service` | 编译期检查 |
| `@PreDestroy` | `Effect.addFinalizer` | Scope 自动管理 |
| `try-with-resources` | `Effect.scoped` | Scope 可嵌套、可组合 |
| `ApplicationContext` | `Runtime` | 更轻量，启动更快 |

**试试看**：创建一个包含两个 Service（`Logger` 和 `Database`）的 Layer 图，其中一个依赖另一个。验证 MemoMap 的效果——两个 Service 是否共享同一个 Logger 实例。

1. 定义 Logger Service（打印日志）
2. 定义 Database Service（依赖 Logger）
3. 创建两个 Layer：`Logger.layer` 和 `Database.layer`
4. 用 `Layer.mergeAll` 组合
5. 用 `makeRuntime({ memoMap })` 运行