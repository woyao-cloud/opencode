# 第 4 章: Context 与 Layer — 依赖注入 (Dependency Injection)

> **环境准备**
>
> 如果你想一边阅读一边运行本章的示例代码，请先进入示例目录安装依赖：
>
> ```bash
> cd docs/Effect-ts/demos/ch04-context-layer && bun install
> ```
>
> 然后使用 `bun run src/<文件名>.ts` 运行各个示例。

---

## 1. 为什么要学 Context 与 Layer

### 1.1 依赖注入的本质

在传统的 TypeScript 开发中，管理依赖通常有两种方式：

- **全局单例 (Global Singleton)**: `import { db } from "./database"` — 简单但不可测试，无法替换实现
- **手动传递 (Manual Wiring)**: 通过构造函数一层层传递依赖 — 繁琐且容易出错

Effect-TS 的 Context 与 Layer 系统提供了一种**声明式依赖注入**（Declarative Dependency Injection）方案。核心理念是：

> **"声明你需要什么，而不是自己去拿。"**

你的业务逻辑只需声明它需要哪些服务（通过 `yield*`），至于这些服务从哪来、如何构建——完全由外部的 Layer 系统负责。

### 1.2 传统 DI 与 Effect-TS 的对比

| 方式 | 声明依赖 | 提供依赖 | 类型安全 | 组合性 |
|------|----------|----------|----------|--------|
| 全局单例 | `import` | 模块导出 | 编译时 | 无 |
| 构造函数注入 | 构造函数参数 | `new X(a, b, c)` | 编译时 | 手动 |
| DI 容器 (tsyringe) | `@inject()` 装饰器 | 容器注册 | 弱 | 有限 |
| **Effect-TS Context** | `yield* Tag` | `Layer` | **编译时 + 运行时** | **强** |

Effect-TS 的独特优势：
- **类型安全的依赖追踪**: 每个 Effect 的 `R` 类型参数精确记录它需要的所有服务
- **组合式 Layer**: Layer 可以像乐高积木一样组合、嵌套、替换
- **资源生命周期管理**: `Layer.scoped` + `Effect.acquireRelease` 自动管理资源的获取和释放
- **局部覆盖**: 在不同作用域使用不同的服务实现（测试 mock vs 生产实现）

### 1.3 一个直观的例子

```ts
import { Context, Effect, Layer } from "effect"

// 1. 声明服务接口
interface Logger {
  readonly log: (message: string) => void
}
const Logger = Context.GenericTag<Logger>("Logger")

// 2. 构建服务实现 (Layer)
const loggerLayer = Layer.succeed(Logger, {
  log: (msg) => console.log(`[LOG] ${msg}`)
})

// 3. 业务逻辑 — 只声明需要什么
const program = Effect.gen(function* () {
  const logger = yield* Logger   // "我需要 Logger"
  logger.log("Hello, Effect-TS!")
  return "done"
})

// 4. 注入依赖并运行
const result = Effect.runSync(Effect.provide(program, loggerLayer))
```

对比传统写法：你不需要在 `program` 中 `import` 任何东西，不需要创建全局单例，不需要手动传递依赖。依赖关系完全由类型系统和 Layer 自动管理。

---

## 2. Context 与 GenericTag — 服务的声明与获取

### 2.1 Context.GenericTag: 服务的"身份证"

`Context.GenericTag<接口类型>()("名称")` 是声明服务的标准方式。它同时扮演两个角色：

1. **类型标记** (Type Tag): 在 `Effect<R, E, A>` 中占据 `R` 位置，精确记录依赖需求
2. **依赖获取器** (Dependency Getter): 在 `Effect.gen` 中通过 `yield*` 获取服务实例

```ts
import { Context } from "effect"

interface Database {
  readonly query: (sql: string) => string
}
// GenericTag 同时是类型标记和依赖获取器
const Database = Context.GenericTag<Database>("Database")
```

**要点**:
- 接口名称和 Tag 变量名通常保持一致（如 `Database` 接口 → `Database` Tag）
- Tag 的字符串参数 `"Database"` 用于错误信息中的服务标识
- 一个 GenericTag 完成两个职责——不需要分别定义"接口"和"注入令牌"

### 2.2 yield*: 声明"我需要这个服务"

在 `Effect.gen` 中，`yield* Tag` 告诉 Effect 系统："我需要这个服务，请从上下文中提供给我"。

```ts
const businessLogic = Effect.gen(function* () {
  const db = yield* Database    // 声明依赖: 我需要 Database
  const logger = yield* Logger  // 声明依赖: 我需要 Logger

  logger.log("开始查询...")
  return db.query("SELECT * FROM users")
})
// businessLogic 的类型: Effect<Database | Logger, never, string>
//                                    ^^^^^^^^^^^^^^^^
//                                    编译器自动推导出需要的服务
```

### 2.3 MissingService: 当依赖未被满足时

如果运行一个缺少依赖的 Effect，你会得到 `ConfigError`（包含 `MissingService`），告诉你缺少了哪些服务。

```ts
// 直接运行 — 没有提供 Logger 和 Database
const result = Effect.runSyncExit(businessLogic)
// 输出: ConfigError: (MissingService [Database(Database)])
//        AndThen: (MissingService [Logger(Logger)])
```

这个错误信息清楚地告诉你：程序需要 `Database` 和 `Logger`，但你没有提供。这是一种**编译时追踪、运行时检查**的安全机制。

---

## 3. Layer — 构建依赖图

Layer 是服务的"配方"——它描述了如何构建一个或多个服务实例。Effect-TS 提供了四种 Layer 构建方式，覆盖从简单到复杂的各种场景。

### 3.1 Layer.succeed — 提供固定值

最简单的 Layer 构建方式。直接提供一个已经创建好的实例。

```ts
const loggerLayer = Layer.succeed(Logger, {
  log: (msg) => console.log(`[LOG] ${msg}`)
})
// 类型: Layer<Logger> — 这个 Layer 提供 Logger 服务
```

**适用场景**: 无状态的服务、配置对象、简单的 mock 实现。

### 3.2 Layer.sync — 同步构建（每次提供时重新执行）

`Layer.sync(tag, factory)` 在每次构建 Layer 时执行工厂函数。与 `succeed` 的区别是每次都是新实例。

```ts
let counter = 0
const loggerLayer = Layer.sync(Logger, () => ({
  log: (msg) => console.log(`[LOG#${++counter}] ${msg}`)
}))
// 每次构建都会重新执行工厂函数，counter 从当前值递增
```

**适用场景**: 需要每次构建时获取最新状态的服务。

### 3.3 Layer.effect — 异步/Effect 构建

当服务构建过程本身需要副作用（如读取配置、建立连接）或依赖其他服务时，使用 `Layer.effect`。

```ts
const databaseLayer = Layer.effect(Database, Effect.gen(function* () {
  // 可以在这里做任何 Effect 操作
  console.log("正在建立数据库连接...")

  return {
    query: (sql) => `[DB] 执行: ${sql}`,
    disconnect: () => console.log("断开连接")
  }
}))
// 类型: Layer<Database> — 提供 Database 服务
```

**适用场景**: 构建过程有副作用、需要依赖其他服务。

### 3.4 Layer.scoped — 带资源生命周期管理

`Layer.scoped(tag, Effect.acquireRelease(acquire, release))` 用于需要生命周期管理的服务——获取资源（acquire）和释放资源（release）成对出现。

```ts
const databaseLayer = Layer.scoped(Database,
  Effect.acquireRelease(
    // acquire — 获取资源
    Effect.sync(() => {
      console.log("获取数据库连接")
      return { query: (sql: string) => `执行: ${sql}` }
    }),
    // release — 释放资源（Scope 关闭时自动执行）
    (db) => Effect.sync(() => {
      console.log("释放数据库连接")
    })
  )
)
// 类型: Layer<Database, never, Scope> — 需要 Scope 上下文

// 运行时需要用 Effect.scoped 包裹
Effect.runSync(Effect.scoped(Effect.provide(program, databaseLayer)))
// 当 Effect.scoped 结束时，release 自动执行
```

**适用场景**: 数据库连接池、文件句柄、WebSocket 连接等需要显式释放的资源。

### 3.5 Layer.provide — 满足 Layer 的依赖

当一个 Layer 的构建需要其他服务时，使用 `Layer.provide` 来注入依赖。

```ts
// UserRepo 的构建需要 Database
const userRepoLayer = Layer.effect(UserRepo, Effect.gen(function* () {
  const db = yield* Database  // UserRepo 依赖 Database
  return { findById: (id) => db.query(`SELECT * FROM users WHERE id=${id}`) }
}))

// 将 Database 注入到 UserRepo 的构建中
const userRepoWithDb = Layer.provide(userRepoLayer, databaseLayer)
// 类型: Layer<UserRepo> — Database 的依赖已被满足，对外只暴露 UserRepo
```

**要点**:
- `Layer.provide(需要依赖的Layer, 提供依赖的Layer)` — 被提供者的依赖被消除
- 结果 Layer 的类型中不再包含被满足的依赖

---

## 4. Effect.provide — 注入模式大全

### 4.1 Effect.provide — 标准 Layer 注入

最标准的注入方式，将一个完整的 Layer 注入到 Effect 中。

```ts
const result = Effect.runSync(
  Effect.provide(program, myLayer)
)
```

### 4.2 Effect.provideService — 直接提供实例

跳过 Layer 构建，直接提供实例。适合快速测试和简单场景。

```ts
const result = Effect.runSync(
  Effect.provideService(program, Database, {
    query: (sql) => `[Mock] ${sql}`
  })
)
```

### 4.3 Effect.provideServiceEffect — 异步提供实例

当提供实例本身需要副作用时使用。通过 Effect 来构建实例。

```ts
const result = Effect.runSync(
  Effect.provideServiceEffect(program, Database, Effect.gen(function* () {
    console.log("异步初始化数据库...")
    return { query: (sql) => `[Async] ${sql}` }
  }))
)
```

### 4.4 Layer.provideMerge — 合并 Layer 上下文

`Layer.provideMerge(self, that)` 将 `that` 的上下文合并到 `self` 中，两者的服务都保持可见。

```ts
const dbLayer = Layer.succeed(Database, { query: (sql) => `[DB] ${sql}` })
const cacheLayer = Layer.succeed(Cache, {
  get: (k) => null, set: (k, v) => {}
})

// 合并后同时提供 Database 和 Cache
const merged = Layer.provideMerge(dbLayer, cacheLayer)
// 类型: Layer<Database | Cache>
```

### 4.5 Layer.mergeAll — 一次性合并多个 Layer

```ts
const allLayers = Layer.mergeAll(loggerLayer, dbLayer, cacheLayer)
// 类型: Layer<Logger | Database | Cache>
```

### 4.6 注入范围: 局部覆盖

`Effect.provide` 是局部的——只影响被 provide 的 Effect 及其子 Effect。这让你可以在不同层级使用不同的服务实现。

```ts
// 内层使用 mock，外层使用 real
const outerEffect = Effect.gen(function* () {
  const logger = yield* Logger
  logger.log("外层日志")  // 使用 real Logger

  // 内层局部覆盖为 mock Logger
  const innerResult = yield* Effect.provide(innerEffect, mockLogger)

  logger.log("外层继续")  // 仍然使用 real Logger
  return innerResult
})
```

---

## 5. Layer 组合模式

### 5.1 Layer.merge — 合并独立 Layer

`Layer.merge(layerA, layerB)` 将两个互不依赖的 Layer 合并为一个。

```ts
const baseInfra = Layer.merge(loggerLayer, configLayer)
// 类型: Layer<Logger | Config>
```

### 5.2 Layer.provide — 构建依赖链

```ts
// Database 依赖 Config
const dbWithConfig = Layer.provide(databaseLayer, configLayer)
// UserService 依赖 Database
const appLayer = Layer.provide(userServiceLayer, dbWithConfig)
// 最终: Layer<UserService> — 所有中间依赖已被满足
```

### 5.3 Layer.flatMap — 动态构建

`Layer.flatMap(layer, (context) => nextLayer)` 允许你根据一个 Layer 的上下文动态决定下一个 Layer 的构建方式。

```ts
// 根据 Config 决定使用哪种 Database 实现
const databaseLayer = Layer.flatMap(configLayer, (ctx) => {
  if (ctx.dbHost === "localhost") {
    return Layer.succeed(Database, { /* 内存实现 */ })
  } else {
    return Layer.succeed(Database, { /* 远程实现 */ })
  }
})
```

**适用场景**: 根据环境变量切换实现（开发/生产）、A/B 测试、特性开关。

### 5.4 完整三层依赖体系

以典型的后端服务为例，构建 Config → Database → UserService 三层依赖：

```ts
// 1. 基础层: Logger + Config（互不依赖，用 merge 合并）
const baseInfra = Layer.merge(loggerLayer, configLayer)

// 2. 数据层: Database（依赖 Config）
const databaseLayer = Layer.effect(Database, Effect.gen(function* () {
  const config = yield* Config
  return { query: (sql) => `[${config.dbHost}] ${sql}` }
}))

// 3. 业务层: UserService（依赖 Database）
const userServiceLayer = Layer.effect(UserService, Effect.gen(function* () {
  const db = yield* Database
  return { findById: (id) => db.query(`SELECT * FROM users WHERE id=${id}`) }
}))

// 4. 组合: 将所有依赖串联起来
const appLayer = Layer.provide(
  Layer.provide(userServiceLayer, databaseLayer),
  baseInfra
)
// 类型: Layer<UserService> — 对外只暴露 UserService
```

**依赖图可视化**:

```
┌──────────────────────────────────────┐
│           appLayer (最终组合)          │
│                                      │
│  ┌─────────┐    ┌──────────┐        │
│  │ Logger  │    │  Config  │        │
│  └────┬────┘    └────┬─────┘        │
│       │              │               │
│       ▼              ▼               │
│  ┌──────────────────────┐           │
│  │      Database        │           │
│  └──────────┬───────────┘           │
│             │                        │
│             ▼                        │
│  ┌──────────────────────┐           │
│  │    UserService       │           │
│  └──────────────────────┘           │
└──────────────────────────────────────┘
```

---

## 6. OpenCode 实战引用

### 6.1 OpenCode 的 ConfigService 模式

OpenCode 使用了一个自定义的 `ConfigService` 模式来管理配置型服务。这个模式展示了 Context + Layer 在实际项目中的高级用法。

```ts
// packages/opencode/src/effect/config.ts (简化)
export namespace ConfigService {
  export interface ServiceShape<S> {
    readonly [k: string]: unknown
  }

  export const defaults = { _tag: "ConfigService" } as const

  // 返回一个 Class，而不是直接使用 GenericTag
  export const Service = <S extends ServiceShape<S>>(defaults: S) =>
    class ConfigServiceImpl {
      _tag = "ConfigService"
      static _tag = "ConfigService"
      static defaults = defaults
      constructor(
        readonly config: S,
        readonly source?: string,
      ) {}
      get value(): S {
        return this.config
      }
    }

  // 使用 GenericTag 声明服务类型
  export const Tag = <S extends ServiceShape<S>>(id: string) =>
    Context.GenericTag<InstanceType<ReturnType<typeof ConfigService.Service<S>>>>(id)
}
```

### 6.2 OpenCode 的 RuntimeFlags 服务

`RuntimeFlags` 是 OpenCode 使用上述模式的典型例子：

```ts
// packages/opencode/src/effect/runtime-flags.ts (简化)
export interface RuntimeFlags {
  readonly logLevel: LogLevel
  readonly logDir: string
  readonly timeout: Duration.DurationInput
  readonly maxRetries: number
}

// 通过 ConfigService.Service 声明带有默认配置的服务类
export class Service extends ConfigService.Service<Service>()(
  "@opencode/RuntimeFlags",
  {
    ...ConfigService.defaults,
    logLevel: "info" as LogLevel,
    logDir: Path.join(LogService.paths().directory, "agent"),
    timeout: Duration.seconds(30),
    maxRetries: 3,
  },
) {}
```

**模式总结**:
- `ConfigService.Service<S>()(id, defaults)` 返回一个带默认值的服务类
- 通过 `extends` 继承，获得类型安全的配置管理
- `Context.GenericTag` 用于将服务类注册到 Effect 的依赖系统中
- 这种模式适合配置型服务——有默认值，可被外部覆盖

### 6.3 何时使用 GenericTag vs Class-based Service

| 场景 | 推荐方式 | 示例 |
|------|----------|------|
| 简单接口 | `Context.GenericTag<T>()("Name")` | Logger, Cache, Database |
| 有默认值的配置服务 | `extends ConfigService.Service` | RuntimeFlags, AppConfig |
| 需要工厂方法的复杂服务 | `Schema.Class` + Tag | 实体类 + 验证 |

---

## 7. 小结

### 7.1 核心要点回顾

| 概念 | 说明 |
|------|------|
| **Context.GenericTag** | 声明服务接口，同时作为类型标记和依赖获取器 |
| **yield\* Tag** | 在 Effect.gen 中声明依赖需求 |
| **Layer.succeed** | 提供固定值，最简单的 Layer |
| **Layer.sync** | 同步构建，每次提供时重新执行工厂函数 |
| **Layer.effect** | 通过 Effect 构建，支持异步和依赖其他服务 |
| **Layer.scoped** | 带资源生命周期管理（acquire/release） |
| **Layer.provide** | 满足 Layer 之间的依赖 |
| **Layer.merge** | 合并两个独立 Layer |
| **Layer.mergeAll** | 一次性合并多个 Layer |
| **Layer.flatMap** | 基于上下文动态构建 Layer |
| **Effect.provide** | 将 Layer 注入到 Effect |
| **Effect.provideService** | 直接提供实例，跳过 Layer |
| **Effect.provideServiceEffect** | 通过 Effect 异步提供实例 |
| **Layer.provideMerge** | 合并 Layer 上下文 |

### 7.2 常见陷阱

| 陷阱 | 正确做法 |
|------|----------|
| 忘记 `Layer.provide` 导致 MissingService | 检查依赖链: 每个依赖它的 Layer 的上游是否都已 provide |
| Layer 顺序错误 | `Layer.provide(需要依赖的, 提供依赖的)` — 被提供者在左 |
| 混淆 `Layer.provide` 和 `Layer.provideMerge` | provide: 消除被提供者的依赖; provideMerge: 合并两者的上下文 |
| 在 `Effect.gen` 外部使用 `yield*` | `yield*` 只能在 `Effect.gen` 内部使用 |
| Scoped Layer 忘记 `Effect.scoped` | 使用 `Layer.scoped` 构建的 Layer 需要 `Effect.scoped` 包裹 |
| 混淆 `Context.GenericTag` 和 `Context.Tag` | beta.65 使用 `Context.GenericTag<接口>()("名称")`，不是 `Context.Tag()` |

### 7.3 下一步

掌握了 Context 与 Layer 的依赖注入系统后，下一章我们将学习 **Effect-TS 的并发模型**——如何使用 `Effect.all`、`Effect.race`、`Fiber` 等工具编写高性能的并发程序。

---

> **运行示例代码**
>
> ```bash
> cd docs/Effect-ts/demos/ch04-context-layer && bun install
> bun run src/01-context-tag.ts       # Context.GenericTag 与 MissingService
> bun run src/02-layer-basics.ts      # Layer 四种构建方式
> bun run src/03-provide-patterns.ts  # Effect.provide 注入模式
> bun run src/04-layer-composition.ts # Layer 组合与三层依赖体系
> ```
