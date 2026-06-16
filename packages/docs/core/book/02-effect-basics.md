# Effect 基础：从 CompletableFuture 到 Effect

> **目标读者**：熟悉 Java `CompletableFuture`、`try/catch`、`@Autowired` 依赖注入的开发者。
> **本章目标**：理解 Effect 如何解决 Promise 的三大痛点——错误处理、依赖注入、并发控制。

---

## 2.1 从一个真实的故事开始

想象一下，你是一个有五年经验的 Java 后端工程师，习惯了 Spring Boot 那一套——

你写 Controller，用 `@Autowired` 注入 Service，Service 里用 `@Transactional` 管理事务，异步操作交给 `CompletableFuture`，错误处理用 `try/catch`。一切都很熟悉。

然后你接到了一个任务：维护一个 TypeScript + Effect-ts 的项目。

你打开代码，看到了这样的写法：

```typescript
const result = yield* someService.doStuff(input).pipe(
  Effect.retry(Schedule.exponential("1 seconds")),
  Effect.timeout("30 seconds"),
)
```

你愣住了。`yield*` 是什么？不是 `await`，不是 `return`，是一个带着星号的 yield。`.pipe()` 又是什么——Java 8 的 Stream API 混进来了？

更让你困惑的是，`someService` 这个变量——它没有构造函数，没有 setter，没有 `@Autowired` 注解——它是从哪里来的？

本章的目的就是解开这些谜。你会发现，Effect 不是在"发明新概念"，而是在用函数式的方式重新解决 Java 开发者已经熟悉的那些问题：异步编程怎么做、错误怎么处理、依赖怎么注入。

我们从一个你绝对熟悉的场景开始。

### 2.1.1 一个简单的业务场景

假设我们要实现一个"用户发送消息 → AI 生成回复 → 保存到数据库"的功能。在 Spring Boot 里，你可能会这样写：

```java
// Java
@Service
public class MessageService {
    @Autowired
    private AIClient aiClient;           // 依赖 1：AI 客户端

    @Autowired
    private MessageRepository repository; // 依赖 2：数据库

    public CompletableFuture<Message> processMessage(String content) {
        return CompletableFuture.supplyAsync(() -> {
            return aiClient.generate(content);  // 调用 AI
        }).thenCompose(reply -> {
            return repository.save(reply);      // 存到数据库
        }).exceptionally(error -> {
            log.error("Failed to process message", error);
            throw new RuntimeException(error);
        });
    }
}
```

这段代码看起来很直观，对吧？但你大概率曾经被它坑过。

### 2.1.2 这段代码的三个隐患

**隐患 1：错误类型丢失**

`.exceptionally()` 捕获了所有异常。不管是 `AIClient` 抛出的"API Key 过期"还是 `repository` 抛出的"数据库连接失败"，都被吞进了同一个 `Throwable`。如果你想区分处理——比如 API Key 过期需要提示用户重新登录，数据库失败需要自动重试——你会发现根本做不到，因为类型信息已经丢了。

**隐患 2：依赖来源不明**

`aiClient` 和 `repository` 是字段注入的。你在 IDE 里点 "Find Usages" 可以看到它们在哪里被使用，但你看不到**谁提供了它们**。如果一个 Bean 没定义，错误不是在编译时出现，而是在运行时报 `NullPointerException`——可能是在生产环境上线的第一分钟。

**隐患 3：重试逻辑需要手写**

`CompletableFuture` 本身没有重试机制。如果 AI 调用超时了，你需要自己写一个循环：

```java
// Java 手写重试——这段代码你很熟悉吧？
int maxRetries = 3;
for (int i = 0; i < maxRetries; i++) {
    try {
        return aiClient.generate(content);
    } catch (Exception e) {
        if (i == maxRetries - 1) throw e;
        Thread.sleep(1000 * (long) Math.pow(2, i)); // 指数退避，手动实现
    }
}
```

这段重试代码的问题不在于它长，而在于**每一个可能超时的地方都要写一遍**——AI 调用要写、数据库连接要写、HTTP 请求要写。你很快就会发现自己陷入了 copy-paste 的泥潭。

### 2.1.3 Effect 是如何解决这些问题的

现在来看 Effect 的版本。我不要求你立刻理解每一行代码，先感受一下对比：

```typescript
// TypeScript + Effect
function processMessage(content: string) {
  return Effect.gen(function* () {
    // 依赖从上下文获取——不是字段注入，不是全局变量
    const ai = yield* AIService
    const db = yield* DatabaseService

    // 调用 AI（声明式重试——不需要手写循环）
    const reply = yield* ai.generate(content).pipe(
      Effect.retry(Schedule.exponential("1 seconds"))
    )

    // 保存到数据库
    const saved = yield* db.save(reply)
    return saved
  })
}
```

三个问题对应三个解决方案：

1. **错误类型不丢失**——`Effect<A, E, R>` 中的 `E` 就是错误类型。你能在编译期就知道这个 Effect 可能抛出什么错误。在 Java 中你要靠文档或者 luck 才知道一个 `CompletableFuture` 可能以哪些异常结束；在 Effect 中，编译器知道一切。

2. **依赖来源明确**——`yield* AIService` 不是从魔法中获取实例的。`AIService` 是一个 `Tag`（标签），Effect Runtime 在运行时会从已注册的 `Layer` 中找到对应的实现。在 Java 中这被称为"控制反转"——Spring 用注解实现，Effect 用类型实现。

3. **重试是声明式的**——`.pipe(Effect.retry(...))` 是一个**声明**，不是**实现**。你说"我要重试，指数退避，从 1 秒开始"，Effect Runtime 负责执行。你不需要写循环，不需要处理线程 sleep 的中断异常，不需要记住每次重试的间隔。

---

## 2.2 Effect 三部曲：理解 `<A, E, R>`

### 2.2.1 三个类型参数到底在说什么

Effect 的核心是一个泛型类型，三个参数：

```typescript
// Effect<成功类型, 错误类型, 依赖类型>
type MyEffect = Effect<string, HttpError, AIService | DatabaseService>
```

你可以把这三个参数理解为三个问题的答案：

- **A（Success）**：这个操作成功时返回什么？——`string`
- **E（Error）**：这个操作失败时以什么方式失败？——`HttpError`
- **R（Requirements）**：这个操作需要谁才能执行？——`AIService 或 DatabaseService`

在 Java 中，这三个问题的答案是分散的：

```java
// Java 中，这三个信息是分散的
public CompletableFuture<String> process()
    throws HttpError {                  // E 在 throws 子句中
                                        // A 在泛型参数中
    AIService ai = getAIService();      // R 在方法体内部
    DatabaseService db = getDatabase();
    // ...
}
```

`CompletableFuture<String>` 只回答了 A（返回 String）。E 隐藏在 `throws` 子句中（而且经常是 `throws Exception`——等于什么都没说）。R 最惨——你根本看不出来，除非你读了全部的方法体。

Effect 把这三个问题统一到一个类型中。这意味着：

- 如果你忘了处理某种错误，编译器会告诉你
- 如果你忘了提供某个依赖，编译器会告诉你
- 如果你把两个不同类型的 Effect 组合在一起，编译器会算出它们的并集

### 2.2.2 一个帮助你记忆的类比

```
Effect<A, E, R>
       │  │  │
       │  │  └─ 像 Spring 的 @Autowired：你需要什么才能执行？
       │  │
       │  └──── 像 Java 的 throws：可能出什么问题？
       │
       └─────── 像 Java 的泛型返回值：成功了返回什么？
```

### 2.2.3 一个更具体的例子

假设你在写一个"获取用户信息"的功能：

```typescript
// 获取用户信息 Effect
type GetUser = Effect<
  User,               // A: 成功 → 返回 User 对象
  NotFoundError,      // E: 失败 → 可能用户不存在
  DatabaseService     // R: 需要数据库才能执行
>
```

现在你想增加缓存功能：

```typescript
type GetUserWithCache = Effect<
  User,
  NotFoundError | CacheError,  // E 自动扩展了——多了缓存可能出错
  DatabaseService | CacheService  // R 也扩展了——多了缓存依赖
>
```

注意看——Effect 类型**自动组合**了。你加了一个缓存逻辑，编译器要求你同时处理 `CacheError` 并提供 `CacheService`。在 Java 中，这种"组合式变更"需要你手动跟踪所有调用链——很容易漏掉某个 catch 块或某个注入点。

---

## 2.3 Effect.gen：一条一条执行的"脚本"

### 2.3.1 对比三种异步风格的写法

假设有三个步骤：A → B → C，每个步骤都可能失败。

**Java 同步风格（最简单，最直观）**：

```java
// Java
public Result process() {
    A a = step1();
    B b = step2(a);
    C c = step3(b);
    return c;
}
```

**TypeScript Promise 风格（大部分时候也还好）**：

```typescript
// Promise
async function process(): Promise<Result> {
    const a = await step1()
    const b = await step2(a)
    const c = await step3(b)
    return c
}
```

**Java CompletableFuture 链式风格（一个链式调用的噩梦）**：

```java
// Java CompletableFuture 链式
public CompletableFuture<Result> process() {
    return step1().thenCompose(a ->
        step2(a).thenCompose(b ->
            step3(b).thenApply(c -> c)
        )
    );
}
```

如果你写过这种代码，你一定经历过那种"加一个步骤就要重新缩进一整段"的痛苦。三步还好，十步的话——你的代码会变成一个向右倾斜的三角形。

**Effect.gen 风格（保留了 Java 同步风格的直观）**：

```typescript
// Effect
function process(): Effect<Result, Error, never> {
    return Effect.gen(function* () {
        const a = yield* step1()
        const b = yield* step2(a)
        const c = yield* step3(b)
        return c
    })
}
```

这就是 Effect.gen 的魅力：**它让你用写同步代码的方式写异步逻辑**。`yield*` 关键字在这里的作用类似于 `await`，但它等待的不只是 Promise——它可以等待任何 Effect，包括那些带着重试策略、超时控制、资源管理的复杂 Effect。

### 2.3.2 深入理解 yield*：它和 await 到底有什么区别

很多第一次接触 Effect 的 Java 开发者会问："`yield*` 不就是 `await` 吗？"

答案是：功能上确实相似——两者都"暂停当前执行，等待异步操作完成"。但区别在于：

`await` 只能等 `Promise`。你写 `await fetch(url)`，它等你一个 HTTP 请求。完事。你不能在 `await` 后面附加"如果超时了怎么办"、"如果失败了重试几次"——这些逻辑要在 `await` 外面包裹。

`yield*` 可以等**任何 Effect**——而 Effect 本身已经包含了错误处理、重试策略、超时控制等信息。所以你可以写：

```typescript
const data = yield* fetchData(url).pipe(
  Effect.retry(Schedule.exponential("1 seconds")),
  Effect.timeout("30 seconds"),
  Effect.catchTag("TimeoutError", () => fallbackData),
)
```

这一行代码等于 Java 中的：

```java
// Java 需要这么多代码才能实现同样的效果
for (int i = 0; i < 3; i++) {
    try {
        return CompletableFuture.supplyAsync(() -> fetchData(url))
            .get(30, TimeUnit.SECONDS);
    } catch (TimeoutException e) {
        // 超时，重试
    } catch (Exception e) {
        if (i == 2) return fallbackData;
    }
}
```

所以结论是：**`yield*` 不是 `await` 的替代品，而是 `await` + `try/catch` + `for(retry)` 的合体**。

### 2.3.3 一个小练习

读下面这段代码，猜猜它的执行顺序：

```typescript
function demo() {
  return Effect.gen(function* () {
    console.log("1")
    const a = yield* Effect.succeed("2")
    console.log(a)
    const b = yield* Effect.sleep("1 seconds").pipe(
      Effect.map(() => "3")
    )
    console.log(b)
    console.log("4")
  })
}
```

**答案**：`1 → 2 → (等待 1 秒) → 3 → 4`。和同步代码的执行顺序完全一致——这就是 Effect.gen 的设计目标：让异步代码看起来像同步代码。

---

## 2.4 错误处理：Effect 的异常体系

### 2.4.1 Java 开发者最熟悉的场景

```java
// Java
try {
    return process();
} catch (FileNotFoundException e) {
    return fallback();
} catch (IOException e) {
    log.error("IO error", e);
    throw e;
}
```

这段代码的问题是：`try` 块里的 `process()` 可能抛出什么异常？你是看了文档才知道的，还是靠运气？

Java 的 checked exception 试图解决这个问题——但大多数项目最终都选择了 `throws Exception` 或者用 RuntimeException 绕过它。

### 2.4.2 Effect 的错误处理

```typescript
yield* process().pipe(
  Effect.catchTags({
    FileNotFound: () => fallback(),       // 精确捕获 FileNotFound
    // 如果还有其他错误类型没处理——编译错误！
  }),
)
```

关键区别：**`catchTags` 要求你处理所有标记过的错误类型**。如果你忘了处理某个错误，编译器会告诉你。不会出现"上线了才发现某个异常没被捕获"的情况。

### 2.4.3 TaggedError 深入

在 Effect 中，错误不是用类继承体系组织的，而是用**标签**区分的。每个错误带一个字符串标签，可以精确匹配：

```typescript
// 定义两个错误
export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()(
  "NotFoundError",           // ← 标签名
  { resourceId: Schema.String }
) {}

export class UnauthorizedError extends Schema.TaggedErrorClass<UnauthorizedError>()(
  "UnauthorizedError",       // ← 标签名
  { userId: Schema.String }
) {}

// 精确捕获
yield* findResource(id).pipe(
  Effect.catchTags({
    NotFoundError: (err) =>
      Effect.succeed(null),              // 没找到 → 返回 null
    // UnauthorizedError 没处理 → 继续向上传播
  }),
)
```

**对比 Java 的异常层次**：

```
Java:
  Exception
    ├── IOException
    │     ├── FileNotFoundException
    │     └── SocketException
    └── RuntimeException
          ├── NullPointerException
          └── IllegalArgumentException

Effect:
  TaggedError("NotFoundError")
  TaggedError("UnauthorizedError")
  TaggedError("ValidationError")
  // 没有继承树——只有标签
```

Java 用继承树组织错误——`FileNotFoundException extends IOException extends Exception`。Effect 用标签组织错误——每个错误是独立的，有唯一的字符串标签。

哪种更好？取决于场景。继承树的优势是可以统一捕获父类（`catch (IOException e)`），缺陷是不容易精确捕获。标签的优势是精确，缺陷是你需要显式处理每个标签。

### 2.4.4 常见错误：忘记处理错误

一个 Java 开发者最容易犯的 Effect 错误：

```typescript
// ❌ 错误：忘了处理可能出现的错误
const data = yield* fetchData()  // fetchData 返回 Effect<Data, HttpError, never>
// 如果 fetchData 失败了，错误会向上传播到调用者
// 如果你的函数签名没有包含 HttpError——编译错误

// ✅ 正确：要么处理，要么在函数签名中声明
function getData(): Effect<Data, HttpError | AppError, never> {
  const data = yield* fetchData()
  return data
}
```

这个设计迫使你在"处理错误"和"传播错误"之间做显式选择——你不能"忘记"。

---

## 2.5 依赖注入：从 @Autowired 到 yield* Tag

### 2.5.1 Spring 的依赖注入有什么问题

```java
// Java Spring
@Service
public class OrderService {
    @Autowired
    private PaymentService paymentService;

    @Autowired
    private InventoryService inventoryService;

    public void placeOrder(Order order) {
        // 这里用 paymentService 和 inventoryService
    }
}
```

这段代码有什么问题？从编译器的角度看——没有任何问题。但如果你在生产环境启动时发现 `PaymentService` 的 Bean 没有定义，你得到的是一个运行期异常：

```
Caused by: org.springframework.beans.factory.NoSuchBeanDefinitionException:
  No qualifying bean of type 'com.example.PaymentService' available
```

这个错误可能在开发环境不会出现（因为开发环境加载了不同的配置），但在生产环境"突然"出现了。这就是隐式依赖的代价——编译器不检查。

### 2.5.2 Effect 的依赖注入

```typescript
// 1. 定义服务的 Tag（类似 Spring 的接口定义）
export class Service extends Context.Service<Service, Interface>()("@opencode/LLM") {}

// 2. 创建服务的 Layer（类似 @Bean 方法）
const live: Layer.Layer<
  Service,                          // 这个 Layer 提供什么
  never,                            // 创建不会出错
  Auth.Service | Config.Service     // 需要 Auth 和 Config 才能创建
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    // 显式声明需要什么
    const auth = yield* Auth.Service
    const config = yield* Config.Service
    // ...
    return Service.of({ stream })
  }),
)
```

注意 `Layer.Layer<Service, never, Auth.Service | Config.Service>` 这个签名——它明确告诉编译器：要创建 `LLM.Service`，你需要先提供 `Auth.Service` 和 `Config.Service`。

如果你忘记提供 `Auth.Service`：

```typescript
// ❌ 编译错误！缺少 Auth.Service
const app = LLM.Service.layer.pipe(
  Layer.provide(Config.defaultLayer)  // 只提供了 Config
  // 忘了提供 Auth.defaultLayer
)

// ✅ 正确
const app = LLM.Service.layer.pipe(
  Layer.provide(Config.defaultLayer),
  Layer.provide(Auth.defaultLayer),
)
```

这就是 Effect 的"编译期依赖检查"——和 Spring 的最大区别。

### 2.5.3 Layer 的"拼图"类比

你可以把 Layer 想象成拼图：

- 每个 Layer 是一块拼图
- Block 上的"凸起"是它的**需求**（R 参数）
- Block 上的"凹陷"是它的**供给**（输出的 Service）
- `Layer.provide(A).pipe(Layer.provide(B))` 就是把 A 和 B 拼在一起

如果你缺了一块，拼图装不上——编译器会告诉你。

---

## 2.6 Fiber：轻量级的"线程"

### 2.6.1 Java 线程和 Effect Fiber 的对比

Java 线程是操作系统线程的包装——每个线程大约占用 1MB 栈内存，上下文切换需要操作系统内核参与。一万个线程在你的笔记本上跑？你的风扇会尖叫。

Effect Fiber 是用户空间调度的"轻量级线程"——每个 Fiber 只占用几个对象的内存，上下文切换是纯用户态操作。一万个 Fiber？在 Effect 中这是日常操作。

```java
// Java：启动 10,000 个线程做并发
ExecutorService executor = Executors.newFixedThreadPool(100);
for (int i = 0; i < 10000; i++) {
    executor.submit(() -> {
        // 每个线程 ~1MB 栈 → 10,000 个线程需要 ~10GB 内存
    });
}
```

```typescript
// TypeScript：启动 10,000 个 Fiber
yield* Effect.forEach(
  items,
  (item) => processItem(item),
  { concurrency: "unbounded" }  // 无限并发，Fiber 几乎没有内存开销
)
```

### 2.6.2 Fiber 在实际项目中的用途

在 OpenCode 中，用 Fiber 处理后台任务非常普遍：

```typescript
// 创建一个"后台事件监听器"，和主流程同时运行
yield* Effect.forkIn(scope)(
  EventV2.Service.subscribe(SessionCreated).pipe(
    Stream.tap((event) => websocket.push(event.data)),
    Stream.runDrain,  // 这个 Stream 会一直运行——直到 scope 关闭
  )
)
// 主流程继续执行，不会被上面的监听器阻塞
```

在 Java 中实现同样的效果，你需要：
1. 创建一个 `ExecutorService`
2. 创建一个监听器线程
3. 确保应用关闭时线程能正确停止

在 Effect 中，Fiber 的生命周期由 `Scope` 管理——scope 关闭时，所有 fiber 自动终止。

### 2.6.3 ⚠️ 容易踩的坑：忘记 fork

```typescript
// ❌ 错误：下面的 subscribe 会阻塞主流程
yield* EventV2.Service.subscribe(MyEvent).pipe(
  Stream.runDrain  // runDrain 会等待 Stream 结束——但 Stream 永远不会结束！
)
// ← 永远不会执行到这里

// ✅ 正确：用 forkIn 放到后台
yield* Effect.forkIn(scope)(
  EventV2.Service.subscribe(MyEvent).pipe(
    Stream.runDrain
  )
)
// ← 立即执行到这里
```

这个错误几乎每个新手都会犯一次——`Stream.runDrain` 会等待流结束，而无限流永远不会结束。结果就是程序"卡住"了。记住：**长期运行的监听器一定要 fork**。

---

## 2.7 本章完整示例

让我们把本章学到的所有概念组合起来，写一个完整的"AI 聊天服务"：

```typescript
import { Effect, Layer, Context, Schedule } from "effect"

// 1. 定义服务 Tag（类似接口）
class AIService extends Context.Tag("@app/AIService")<
  AIService,
  { readonly chat: (input: string) => Effect<string, Error, never> }
>() {}

class Database extends Context.Tag("@app/Database")<
  Database,
  { readonly save: (msg: string) => Effect<void, Error, never> }
>() {}

// 2. 实现 Layer（类似 @Bean）
const AILayer = Layer.effect(
  AIService,
  Effect.sync(() => AIService.of({
    chat: (input) =>
      Effect.gen(function* () {
        // AI 调用 + 重试
        const reply = yield* callAIAPI(input).pipe(
          Effect.retry(Schedule.exponential("500 millis")),
          Effect.timeout("10 seconds"),
        )
        return reply
      }),
  })),
)

const DatabaseLayer = Layer.effect(
  Database,
  Effect.sync(() => Database.of({
    save: (msg) => Effect.sync(() => console.log(`Saved: ${msg}`)),
  })),
)

// 3. 业务逻辑（用了 DI + 错误处理 + 组合）
const processMessage = Effect.gen(function* () {
  const ai = yield* AIService
  const db = yield* Database

  const reply = yield* ai.chat("Hello!").pipe(
    Effect.catchTags({
      // 错误精确处理
      TimeoutException: () => Effect.succeed("I'm sorry, I timed out."),
    }),
  )

  yield* db.save(reply)
  return reply
})

// 4. 组装依赖图
const AppLayer = Layer.mergeAll(AILayer, DatabaseLayer)
const runnable = processMessage.pipe(Layer.provide(AppLayer))
```

---

## 2.8 本章小结

| Java 概念 | Effect 对应 | 核心区别 |
|-----------|------------|----------|
| `CompletableFuture<T>` | `Effect<A, E, R>` | 多了错误类型 E 和依赖 R |
| `async/await` | `Effect.gen` + `yield*` | `yield*` 可以组合更多行为 |
| `try/catch` | `catchTags` | 编译期检查错误是否处理完 |
| `@Autowired` | `yield* Service` | 依赖在编译期可见 |
| `Thread` | `Fiber` | 轻量级，百万级并发 |
| `@Service + @Bean` | `Context.Tag + Layer` | 类型安全的 DI |
| `ExecutorService` | `Effect.forkIn` | Scope 自动管理生命周期 |

**核心领悟**：Effect 不是"又一个新的异步框架"——它把错误处理、依赖注入、并发控制统一到了一套类型系统中。在 Java 中这些是分散在不同机制中的（异常层次、Spring DI、线程池）；在 Effect 中它们是一个整体，编译器能帮你检查你是否有遗漏。

**试试看**：打开你的 IDE，创建一个新的 Effect，尝试：
1. 定义一个会返回 `Effect<string, NotFoundError, DatabaseService>` 的函数
2. 在 `Effect.gen` 中调用它——但不处理 `NotFoundError`
3. 观察编译器的反应

你会发现——编译器直接告诉你要么处理错误，要么在函数签名中声明它。这个"要么处理要么声明"的约束，就是 Effect 的核心设计哲学。它把很多在 Java 中需要靠经验、规范、Code Review 才能保证的事，变成了编译器强制执行的事。