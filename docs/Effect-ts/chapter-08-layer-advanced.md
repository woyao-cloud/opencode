# 第 8 章：Layer 进阶 — 复杂依赖图

> **环境准备**
>
> 如果你想一边阅读一边运行本章的示例代码，请先进入示例目录安装依赖：
>
> ```bash
> cd docs/Effect-ts/demos/ch08-layer-advanced && bun install
> ```
>
> 然后使用 `bun run src/<文件名>.ts` 运行各个示例。

---

## 1. 本章目标

第 4 章介绍了 Layer 的基础用法——如何用 `Layer.succeed`、`Layer.effect`、`Layer.provide` 构建简单的依赖注入。但在真实项目中，依赖图往往比"一个服务依赖另一个服务"复杂得多：

- **动态选择**：根据运行时条件（环境、配置、A/B 测试）选择不同的服务实现
- **条件注入**：服务构建可能失败，需要回退方案
- **多层架构**：大型项目需要将服务分层（基础设施 → 领域 → 应用），每层独立构建
- **测试替换**：在不修改业务代码的前提下，用 mock 替换真实服务

本章将深入 Layer 的高级用法，帮助你应对这些真实场景。

### 学习目标

1. 掌握 `Layer.unwrap` 实现运行时动态 Layer 选择
2. 理解 `Layer.fresh` 与共享实例的区别
3. 学会使用 `Layer.orDie` 和 `Layer.catchTag` 处理 Layer 构建错误
4. 掌握 `Layer.provideMerge` 合并 Layer 上下文
5. 能够设计三层架构的 Layer 组织方式
6. 学会用 `Layer.succeed` 和 `Effect.provideServiceEffect` 做测试替换

---

## 2. 前置知识

- **第 4 章 Context 与 Layer**：理解 `Context.Service` 类模式、`Layer.effect`、`Layer.provide`、`Layer.mergeAll`
- **第 7 章 Config**：理解 `Config` 与 `Layer` 的集成模式
- **Effect 基础**：理解 `Effect.gen`、`Effect.runSync`、`Effect.provide`

---

## 3. 概念讲解：Layer 是"依赖图"，不是简单的 DI 容器

### 3.1 从"线性依赖"到"依赖图"

第 4 章展示的依赖关系是线性的：A → B → C。但真实项目的依赖图是网状的：

```
┌─────────────────────────────────────────────┐
│               Application                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ ServiceA │  │ ServiceB │  │ ServiceC │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │              │             │         │
│       ▼              ▼             ▼         │
│  ┌──────────────────────────────────────┐   │
│  │         Domain Services              │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌────┐ │   │
│  │  │RepoA │ │RepoB │ │SvcX │ │SvcY│ │   │
│  │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬─┘ │   │
│  └─────┼────────┼────────┼─────────┼────┘   │
│        │        │        │         │        │
│        ▼        ▼        ▼         ▼        │
│  ┌──────────────────────────────────────┐   │
│  │       Infrastructure Services        │   │
│  │  Logger  Database  HttpClient  Cache │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

Layer 系统需要处理这种复杂的依赖图，而不仅仅是线性链。

### 3.2 Layer 的四种"连接"方式

| API | 作用 | 类比 |
|-----|------|------|
| `Layer.merge` / `Layer.mergeAll` | 合并多个独立 Layer 的输出 | 并联电路 |
| `Layer.provide` | 用下游 Layer 满足上游 Layer 的依赖 | 串联电路 |
| `Layer.provideMerge` | 提供依赖的同时保留下游 Layer 的输出 | 串联 + 旁路 |
| `Layer.unwrap` | 根据 Effect 结果动态选择 Layer | 动态开关 |

### 3.3 共享 vs 隔离

默认情况下，Layer 是**共享的**——同一个服务实例被所有消费者复用。这在大多数场景下是正确的（如数据库连接池、配置对象）。但有些场景需要**隔离**：

- **无状态服务**：每个请求需要独立的计数器或 ID 生成器
- **多租户**：每个租户需要独立的数据库连接
- **测试隔离**：每个测试用例需要独立的 mock 实例

`Layer.fresh` 提供了这种隔离能力。

---

## 4. 代码示例

### 4.1 动态 Layer 选择 (`01-dynamic-layer.ts`)

**核心 API：`Layer.unwrap(Effect)`**

`Layer.unwrap` 接受一个 `Effect<Layer<A, E, R>>`，在 Layer 构建时执行该 Effect，根据结果决定使用哪个 Layer。这实现了"运行时依赖选择"。

```ts
const dynamicDatabaseLayer = Layer.unwrap(
  Effect.gen(function* () {
    const random = yield* Random.next
    if (random > 0.5) {
      return postgresLayer  // 使用 PostgreSQL
    } else {
      return sqliteLayer    // 使用 SQLite
    }
  })
)
```

**关键区别**：`Layer.flatMap` 根据**已有服务的值**决定如何构建新服务；`Layer.unwrap` 根据**任意 Effect**（包括随机、配置、外部 API 调用）决定使用哪个**完整的 Layer**。

**`Layer.fresh` 与共享实例**：

```ts
// 共享 Layer：多次 Effect.provide 复用同一个实例
const shared = Layer.effect(Counter)(Effect.sync(() => {
  let count = 0
  return { increment: () => ++count }
}))

// Fresh Layer：每次 Effect.provide 创建新实例
const fresh = Layer.fresh(shared)
```

| 场景 | 共享 Layer | Fresh Layer |
|------|-----------|-------------|
| 实例生命周期 | 全局单例 | 每次 provide 新实例 |
| 适用场景 | 数据库连接池、配置 | 计数器、ID 生成器 |
| 内存开销 | 低 | 高（每次新实例） |

### 4.2 条件注入与错误处理 (`02-conditional.ts`)

**核心 API：`Layer.orDie` 和 `Layer.catchTag`**

Layer 构建过程中可能失败。Effect-TS 提供了两种错误处理策略：

**`Layer.orDie`**：将构建错误转换为 Fiber 终止（Defect）。适用于"没有回退方案"的关键服务。

```ts
// 如果 Config 构建失败，整个应用终止
const configLayer = Layer.effect(Config)(/* ... */)
  .pipe(Layer.orDie)
```

**`Layer.catchTag`**：捕获特定类型的错误，提供回退 Layer。

```ts
// 数据库连接失败时，回退到内存数据库
const databaseWithFallback = databaseLayer.pipe(
  Layer.catchTag("DatabaseError", () => inMemoryDatabaseLayer)
)
```

**`Layer.provideMerge`**：与 `Layer.provide` 不同，`provideMerge` 在满足依赖的同时保留被提供者的输出。

```ts
// provide: 消除被提供者的依赖，只保留 self 的输出
// provideMerge: 消除依赖，同时保留两者的输出
const merged = databaseLayer.pipe(
  Layer.provideMerge(configLayer)
)
// 结果同时提供 Database 和 Config
```

### 4.3 多层架构 (`03-multi-layer-arch.ts`)

**核心模式：三层架构**

大型项目通常将服务分为三层，每层独立构建，通过 `Layer.provideMerge` 连接：

```
第 1 层: Infrastructure（基础设施层）
  ├─ Logger, Database, HttpClient
  └─ 无依赖，或依赖外部资源

第 2 层: Domain（领域层）
  ├─ UserRepository, OrderRepository, PaymentService
  └─ 依赖 Infrastructure 层

第 3 层: Application（应用层）
  ├─ UserService, OrderService
  └─ 依赖 Domain 层（间接依赖 Infrastructure 层）
```

**构建方式**：

```ts
// 基础设施层：无依赖
const infraLayer = Layer.mergeAll(loggerLayer, databaseLayer, httpClientLayer)

// 领域层：依赖基础设施，使用 provideMerge 保留基础设施服务
const domainLayer = Layer.mergeAll(userRepoLayer, orderRepoLayer, paymentLayer)
  .pipe(Layer.provideMerge(infraLayer))

// 应用层：依赖领域层
const appLayer = Layer.mergeAll(userServiceLayer, orderServiceLayer)
  .pipe(Layer.provideMerge(domainLayer))
```

**为什么使用 `provideMerge` 而非 `provide`**：应用层可能直接使用基础设施层的服务（如 Logger），`provideMerge` 保留了完整的上下文。

### 4.4 测试替换 (`04-test-replacement.ts`)

**核心 API：`Layer.succeed(Service)(mock)` 和 `Effect.provideServiceEffect`**

测试替换是依赖注入的核心价值之一。Effect-TS 提供了多种替换方式：

**方式 1：完整的测试 Layer**

```ts
// 生产 Layer
const productionLayer = userNotifierLive.pipe(
  Layer.provideMerge(Layer.mergeAll(emailServiceLive, paymentGatewayLive))
)

// 测试 Layer（使用 mock）
const testLayer = userNotifierTest.pipe(
  Layer.provideMerge(Layer.mergeAll(emailServiceTest, paymentGatewayTest))
)

// 业务代码不变，只切换 Layer
Effect.provide(businessLogic, productionLayer)  // 生产
Effect.provide(businessLogic, testLayer)         // 测试
```

**方式 2：局部替换（`Effect.provideServiceEffect`）**

```ts
// 在生产环境中，只替换 EmailService
Effect.provide(businessLogic, productionLayer).pipe(
  Effect.provideServiceEffect(EmailService, Effect.sync(() => ({
    send: (to, subject, body) => `[Mock] ${to}`
  })))
)
```

**方式 3：`Layer.succeed` 直接提供 mock**

```ts
const emailServiceTest = Layer.succeed(EmailService)({
  send: (to, subject, body) => `[Test] 邮件已记录: ${to}`
})
```

---

## 5. OpenCode 实战引用

### 5.1 `instance-layer.ts` — 动态 Layer 加载

OpenCode 使用 `Layer.unwrap` 实现动态 Layer 加载：

```ts
// packages/opencode/src/project/instance-layer.ts
export const layer = Layer.unwrap(
  Effect.promise(async () => {
    const { InstanceBootstrap } = await import("./bootstrap")
    return InstanceStore.defaultLayer.pipe(Layer.provide(InstanceBootstrap.defaultLayer))
  }),
)
```

**关键点**：
- `Layer.unwrap` 包裹一个异步 Effect，在 Layer 构建时动态导入模块
- 动态导入 (`await import(...)`) 实现了代码分割——`InstanceBootstrap` 只在需要时加载
- 内部使用 `Layer.provide` 将 `InstanceBootstrap` 注入到 `InstanceStore` 中

### 5.2 `app-runtime.ts` — `Layer.mergeAll` 组合所有服务

OpenCode 使用 `Layer.mergeAll` 将数十个服务合并为一个应用层：

```ts
// packages/opencode/src/effect/app-runtime.ts
export const AppLayer = Layer.mergeAll(
  Npm.defaultLayer,
  AppFileSystem.defaultLayer,
  Bus.defaultLayer,
  Auth.defaultLayer,
  // ... 30+ 个服务
  RuntimeFlags.defaultLayer,
  DataMigration.defaultLayer,
).pipe(Layer.provideMerge(InstanceLayer.layer), Layer.provideMerge(Observability.layer))
```

**关键点**：
- `Layer.mergeAll` 一次性合并 30+ 个独立服务
- `Layer.provideMerge` 注入跨层依赖（`InstanceLayer`、`Observability`）
- 每个服务模块暴露 `defaultLayer`，保持一致的模块接口

---

## 6. 常见陷阱

### 陷阱 1：Layer 循环依赖

Layer 系统不支持循环依赖。如果 A 依赖 B，B 依赖 A，Layer 构建会死锁。

```ts
// ❌ 错误：循环依赖
const layerA = Layer.effect(ServiceA)(Effect.gen(function* () {
  const b = yield* ServiceB  // A 依赖 B
  return { /* ... */ }
}))

const layerB = Layer.effect(ServiceB)(Effect.gen(function* () {
  const a = yield* ServiceA  // B 依赖 A — 循环！
  return { /* ... */ }
}))
```

**解决方案**：重构设计，将循环依赖拆分为三方——引入一个同时被 A 和 B 依赖的第三个服务。

### 陷阱 2：忘记 `Layer.orDie` 导致模糊的 MissingService 错误

当一个 Layer 构建失败时，如果没有使用 `Layer.orDie` 或 `Layer.catchTag`，错误信息可能不够明确：

```
error: Service not found: Config
```

这个错误只告诉你 Config 服务缺失，但没有说明为什么缺失——是根本没有提供，还是构建过程中失败了？

**最佳实践**：
- 关键服务（Config、Database）使用 `Layer.orDie`，失败时立即终止
- 非关键服务（Cache、Logger）使用 `Layer.catchTag` 提供回退
- 在 Layer 构建过程中添加日志，便于排查问题

### 陷阱 3：混淆 `Layer.provide` 和 `Layer.provideMerge`

```ts
// Layer.provide(self, that)：that 的输出被 self 消费，结果只保留 self 的输出
const result = Layer.provide(userServiceLayer, databaseLayer)
// 类型: Layer<UserService> — Database 不可见

// Layer.provideMerge(self, that)：that 的输出被 self 消费，结果保留两者的输出
const result = Layer.provideMerge(userServiceLayer, databaseLayer)
// 类型: Layer<UserService | Database> — Database 仍然可见
```

**选择原则**：如果上层服务需要直接使用下层服务（如 Application 层使用 Logger），使用 `provideMerge`。否则使用 `provide` 以保持类型简洁。

### 陷阱 4：`Layer.mergeAll` 不自动满足跨 Layer 依赖

`Layer.mergeAll` 只是将多个 Layer 的输出合并——它**不会**自动用其中一个 Layer 的输出去满足另一个 Layer 的输入依赖。

```ts
// ❌ 错误：mergeAll 不满足依赖
const layer = Layer.mergeAll(
  configLayer,           // 提供 Config
  databaseLayer          // 需要 Config — 但 mergeAll 不会自动注入！
)

// ✅ 正确：使用 provideMerge 显式注入
const layer = databaseLayer.pipe(
  Layer.provideMerge(configLayer)
)
```

### 陷阱 5：`Layer.fresh` 的适用边界

`Layer.fresh` 创建新实例，但**不是**每次 `yield*` 都创建——而是每次 `Effect.provide` 都创建。在同一个 `Effect.provide` 作用域内，多次 `yield*` 仍然共享同一个实例。

```ts
// 同一个 Effect.provide 内，c1 和 c2 共享实例
const program = Effect.gen(function* () {
  const c1 = yield* Counter  // 同一个实例
  const c2 = yield* Counter  // 同一个实例
})
Effect.provide(program, Layer.fresh(counterLayer))
```

如果需要每次 `yield*` 都创建新实例，需要使用 `Effect.fresh` 或重构设计。

---

## 7. 本章小结

### 7.1 核心概念回顾

| 概念 | API | 适用场景 |
|------|-----|----------|
| 动态 Layer 选择 | `Layer.unwrap(Effect)` | 根据运行时条件选择实现 |
| 新实例隔离 | `Layer.fresh(layer)` | 需要隔离状态的服务 |
| 构建错误终止 | `Layer.orDie` | 关键服务，无回退方案 |
| 构建错误回退 | `Layer.catchTag` / `Layer.catch` | 非关键服务，有备选方案 |
| 合并上下文 | `Layer.provideMerge` | 保留被提供者的输出 |
| 多层架构 | `Layer.mergeAll` + `Layer.provideMerge` | 大型项目分层组织 |
| 测试替换 | `Layer.succeed(Service)(mock)` | 单元测试、集成测试 |
| 局部替换 | `Effect.provideServiceEffect` | 局部覆盖单个服务 |

### 7.2 最佳实践总结

1. **分层组织**：将服务按 Infrastructure → Domain → Application 分层，每层独立构建
2. **依赖方向**：Application → Domain → Infrastructure，避免跨层依赖
3. **错误策略**：关键服务用 `orDie`，非关键服务用 `catchTag` 回退
4. **合并 vs 提供**：同层用 `mergeAll`，跨层用 `provideMerge`
5. **测试替换**：用 `Layer.succeed` 提供 mock，用 `provideServiceEffect` 局部覆盖
6. **动态选择**：用 `Layer.unwrap` 实现运行时决策，避免条件判断散落在业务代码中

### 7.3 下一步

掌握了 Layer 的高级用法后，下一章将学习 **Schema 进阶**——如何使用 Schema 进行复杂数据验证、编解码和协议定义。

---

> **运行示例代码**
>
> ```bash
> cd docs/Effect-ts/demos/ch08-layer-advanced && bun install
> bun run src/01-dynamic-layer.ts       # 动态 Layer 选择
> bun run src/02-conditional.ts         # 条件注入与错误处理
> bun run src/03-multi-layer-arch.ts    # 多层架构
> bun run src/04-test-replacement.ts    # 测试替换
> ```
