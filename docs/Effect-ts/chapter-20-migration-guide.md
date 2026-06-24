# 第 20 章：迁移指南与生态展望

## 一、本章概述

经过前面 19 章的学习，你已经掌握了 Effect-TS 的核心概念、高级模式和实战技巧。本章将帮助你回答最后一个问题：**如何将现有项目迁移到 Effect-TS，以及 Effect 生态中还有哪些值得关注的库？**

### 学习目标

完成本章学习后，你将能够：

- 制定从传统 TypeScript 到 Effect-TS 的渐进式迁移计划
- 使用 Schema 先行策略逐步引入类型安全的数据校验
- 将现有 async/await 代码包装为 Effect
- 用 Context + Layer 替代手工依赖注入
- 在 React 应用中集成 Effect-TS
- 了解 @effect/platform、@effect/cli、@effect/rpc、@effect/sql 等生态库

### 前置知识

本章是全书最后一章，需要综合运用前面所有章节的知识：

- **第 1 章 (为什么 Effect-TS):** 理解 Effect-TS 解决的问题
- **第 2 章 (Effect 基础):** Effect.gen、Effect.pipe、Effect.runPromise
- **第 3 章 (Schema):** Schema.Class、Schema.decode、Schema.encode
- **第 4 章 (Context & Layer):** Context.Service、Layer.effect、Layer.provide
- **第 5 章 (错误处理):** Effect.catchAll、Effect.retry
- **第 6 章 (Scope):** Effect.scoped、Scope.addFinalizer
- **第 11 章 (Fiber):** Effect.fork、Effect.runFork、Fiber.interrupt
- **第 12 章 (Stream):** Stream 数据流处理
- **第 13 章 (Queue & Deferred):** 异步消息传递

### 示例代码

所有示例位于 `docs/Effect-ts/demos/ch20-migration-guide/src/`，可直接运行：

```bash
cd docs/Effect-ts/demos/ch20-migration-guide
bun install
bun run demo:migration    # 四阶段迁移策略
bun run demo:react        # React 集成
bun run demo:ecosystem    # 生态概览
```

---

## 二、渐进式迁移策略

将现有项目迁移到 Effect-TS 不需要"大爆炸"式的重写。我们推荐**四阶段渐进式迁移**策略，每个阶段都可以独立交付，逐步积累价值。

### 2.1 迁移路线图

```
阶段 1: Schema 先行
  ┌─────────────────────────────────────────────┐
  │ 在现有代码中引入 Schema 定义数据模型         │
  │ 收益: 类型安全校验、编解码、文档自动生成      │
  │ 风险: 极低 — 只增加不修改                    │
  └─────────────────────────────────────────────┘
                    ↓
阶段 2: Effect 包装
  ┌─────────────────────────────────────────────┐
  │ 将关键函数包装为 Effect                      │
  │ 收益: 类型化错误、可组合性                    │
  │ 风险: 低 — 新旧代码可共存                    │
  └─────────────────────────────────────────────┘
                    ↓
阶段 3: Layer DI
  ┌─────────────────────────────────────────────┐
  │ 用 Context + Layer 管理依赖                  │
  │ 收益: 可测试性、可替换性                      │
  │ 风险: 中 — 需要重构依赖图                    │
  └─────────────────────────────────────────────┘
                    ↓
阶段 4: 全 Effect 架构
  ┌─────────────────────────────────────────────┐
  │ 应用层全部使用 Effect                        │
  │ 收益: 完整享受 Effect 生态                   │
  │ 风险: 高 — 需要全面重构                      │
  └─────────────────────────────────────────────┘
```

### 2.2 阶段 1: Schema 先行

**目标:** 在不改变现有业务逻辑的前提下，用 Schema 定义所有数据模型。

**为什么先做 Schema?** Schema 是侵入性最小的引入方式。你只需要定义模型，然后在边界处（API 响应、文件读取、用户输入）进行解码校验。现有代码完全不需要修改。

**迁移步骤:**

1. 识别项目中所有"数据边界"（API 请求/响应、配置文件、数据库记录）
2. 用 `Schema.Class` 或 `Schema.Struct` 定义对应的 Schema
3. 在边界处用 `Schema.decode` 替换手工校验
4. 删除手工校验代码

**Before — 纯 TypeScript 类型 + 手工校验:**

```typescript
interface User {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly age: number
}

function validateUser(data: unknown): User {
  if (typeof data !== "object" || data === null) throw new Error("必须是对象")
  const obj = data as Record<string, unknown>
  if (typeof obj.id !== "string") throw new Error("id 必须是字符串")
  if (typeof obj.name !== "string") throw new Error("name 必须是字符串")
  if (typeof obj.email !== "string") throw new Error("email 必须是字符串")
  if (typeof obj.age !== "number") throw new Error("age 必须是数字")
  return { id: obj.id, name: obj.name, email: obj.email, age: obj.age }
}
```

**After — Schema 定义，类型自动推导:**

```typescript
class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  age: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
}) {}

// 使用: Schema.decode(User)(data) 自动校验并返回 User 类型
```

**关键收益:**
- 类型和校验来自同一来源（消除类型定义和校验逻辑的"双重维护"）
- Schema 自动提供编码（`Schema.encodeSync`）
- 校验错误信息结构化，便于前端展示
- 可自动生成 OpenAPI 文档（通过 `Schema.annotations`）

### 2.3 阶段 2: Effect 包装

**目标:** 将关键业务函数从 async/await 包装为 Effect，获得类型化错误和可组合性。

**迁移步骤:**

1. 识别项目中"可能失败"的函数（网络请求、数据库查询、文件操作）
2. 定义对应的错误类型（使用 `Schema.TaggedErrorClass` 或普通 class）
3. 将函数签名从 `Promise<T>` 改为 `Effect<never, E, T>`
4. 在调用处用 `Effect.runPromise` 桥接到现有代码

**Before — 传统 async/await:**

```typescript
async function fetchUser(id: string): Promise<User> {
  if (id === "error") throw new Error("网络错误")
  if (id === "not-found") throw new Error("用户不存在")
  return { id, name: "Alice", email: "alice@test.com" }
}
```

**After — Effect 包装:**

```typescript
class FetchError {
  readonly _tag = "FetchError"
  constructor(readonly message: string) {}
}

class NotFoundError {
  readonly _tag = "NotFoundError"
  constructor(readonly id: string) {}
}

const fetchUser = (id: string): Effect.Effect<never, FetchError | NotFoundError, User> =>
  id === "error"
    ? Effect.fail(new FetchError("网络错误"))
    : id === "not-found"
      ? Effect.fail(new NotFoundError(id))
      : Effect.succeed({ id, name: "Alice", email: "alice@test.com" })
```

**桥接策略:** 在现有代码中通过 `Effect.runPromise` 调用 Effect 函数：

```typescript
// 在现有 async 函数中调用 Effect
async function existingHandler() {
  try {
    const user = await Effect.runPromise(fetchUser("1"))
    // 继续使用 user
  } catch (e) {
    // 处理错误
  }
}
```

### 2.4 阶段 3: Layer DI

**目标:** 用 Context + Layer 替代手工依赖注入或全局单例模式。

**迁移步骤:**

1. 识别项目中的"服务"（数据库、缓存、日志、配置）
2. 用 `Context.Service` 定义服务接口
3. 用 `Layer.effect` 或 `Layer.succeed` 实现服务
4. 用 `Layer.provide` 组合依赖关系
5. 在业务代码中通过 `yield* Service` 获取依赖

**Before — 手工依赖注入:**

```typescript
interface Logger {
  log: (msg: string) => void
}

class UserService {
  constructor(private logger: Logger) {}
  async getUsers() {
    this.logger.log("获取用户列表")
    return []
  }
}
```

**After — Context + Layer:**

```typescript
interface LoggerShape {
  readonly log: (msg: string) => Effect.Effect<void>
}

class Logger extends Context.Service<Logger, LoggerShape>()("Logger") {}

const LoggerLive = Layer.succeed(Logger, Logger.of({
  log: (msg) => Console.log(`[Logger] ${msg}`),
}))

// 业务代码只需 yield* Logger，不关心实现来源
const getUsers = Effect.gen(function* () {
  const logger = yield* Logger
  yield* logger.log("获取用户列表")
  return []
})
```

**关键收益:**
- 依赖关系在类型层面声明（编译期检查）
- 测试时只需替换 Layer（`Layer.succeed` 提供 mock 实现）
- 依赖图自动管理（`Layer.provide` 确保正确顺序）

### 2.5 阶段 4: 全 Effect 架构

**目标:** 应用层全部使用 Effect，完整享受 Effect 生态。

**迁移步骤:**

1. 将所有服务实现为 Layer
2. 使用 `ManagedRuntime.make` 创建应用运行时
3. 在应用入口处运行 Effect
4. 逐步引入 Stream、Queue、Fiber 等高级特性

**完整示例:**

```typescript
// 定义服务
class ConfigService extends Context.Service<ConfigService, ConfigShape>()("ConfigService") {}
class HttpClient extends Context.Service<HttpClient, HttpClientShape>()("HttpClient") {}
class UserRepository extends Context.Service<UserRepository, UserRepoShape>()("UserRepository") {}

// 实现并组合 Layer
const AppLayer = UserRepoLive.pipe(
  Layer.provide(HttpLive),
  Layer.provide(ConfigLive),
)

// 创建运行时
const runtime = ManagedRuntime.make(AppLayer)

// 运行应用
const program = Effect.gen(function* () {
  const repo = yield* UserRepository
  return yield* repo.findById("1")
})

const result = await runtime.runPromise(program)
```

---

## 三、React 集成

Effect-TS 与 React 的集成非常自然。本节介绍三种核心集成模式。

### 3.1 Effect.runPromise — 在 useEffect 中加载数据

最直接的集成方式：在 `useEffect` 中使用 `Effect.runPromise` 将 Effect 转换为 Promise。

```typescript
import { useEffect, useState } from "react"
import { Effect } from "effect"

function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const promise = Effect.runPromise(
      fetchUser(userId).pipe(
        Effect.tap((user) => Effect.sync(() => setUser(user))),
        Effect.tap(() => Effect.sync(() => setLoading(false))),
        Effect.catchAll((err) =>
          Effect.sync(() => {
            setError(err.message)
            setLoading(false)
          })
        ),
      ),
    )
    // 注意: 这里没有清理逻辑
    // 如果需要取消，参考模式 3
  }, [userId])

  if (loading) return <div>加载中...</div>
  if (error) return <div>错误: {error}</div>
  return <div>{user?.name}</div>
}
```

**注意事项:**
- `Effect.runPromise` 返回标准的 Promise，可直接在 `useEffect` 中使用
- 使用 `Effect.tap` 在 Effect 中安全地触发 React 状态更新
- 错误处理通过 `Effect.catchAll` 完成，不会丢失错误类型

### 3.2 Scope 生命周期 — 组件卸载时自动清理

使用 `Effect.scoped` 和 `Scope.addFinalizer` 管理资源生命周期，在组件卸载时自动清理。

```typescript
import { useEffect } from "react"
import { Effect, Scope } from "effect"

function useScopedEffect(effect: Effect.Effect<Scope.Scope, never, void>, deps: unknown[]) {
  useEffect(() => {
    // Effect.scoped 确保 Scope 在 Effect 完成后自动关闭
    const promise = Effect.runPromise(Effect.scoped(effect))
    return () => { /* 清理逻辑 */ }
  }, deps)
}

// 使用示例: WebSocket 连接
const useWebSocket = (url: string) => {
  const [messages, setMessages] = useState<string[]>([])

  useScopedEffect(
    Effect.gen(function* () {
      const ws = yield* createWebSocket(url)
      // 在 Scope 关闭时自动关闭 WebSocket
      yield* Scope.addFinalizer(() =>
        Effect.sync(() => ws.close())
      )
      // 监听消息
      // ...
    }),
    [url],
  )

  return messages
}
```

### 3.3 Effect.runFork — 在事件处理器中触发副作用

在按钮点击、表单提交等事件处理器中，使用 `Effect.runFork` 启动 Effect。`runFork` 返回一个 `Fiber`，可以用于取消操作。

```typescript
import { Effect, Fiber } from "effect"

function SaveButton({ data }: { data: unknown }) {
  const handleSave = () => {
    // runFork 启动 Effect，返回 Fiber
    const fiber = Effect.runFork(
      saveData(data).pipe(
        Effect.tap(() => Effect.sync(() => alert("保存成功"))),
        Effect.catchAll((err) =>
          Effect.sync(() => alert(`保存失败: ${err.message}`))
        ),
      ),
    )

    // 如果需要取消，可以保存 fiber 引用
    // Fiber.interrupt(fiber)
  }

  return <button onClick={handleSave}>保存</button>
}
```

**何时使用 runFork vs runPromise:**

| 场景 | 推荐方式 | 原因 |
|------|----------|------|
| 组件加载数据 | `runPromise` | 与 useEffect 自然集成 |
| 事件处理器 | `runFork` | 可取消、不阻塞 UI |
| 需要 Fiber 控制 | `runFork` | 可中断、可观察 |
| 需要 Promise 结果 | `runPromise` | 与 async/await 兼容 |

---

## 四、Effect 生态概览

Effect-TS 不仅是一个库，更是一个完整的生态系统。本节介绍四个核心生态库。

### 4.1 @effect/platform

`@effect/platform` 提供跨运行时的平台抽象，包括 HTTP 客户端/服务器、文件系统、路径操作等。

**核心特性:**

- **HttpClient:** 类型安全的 HTTP 请求，支持中间件、重试、超时
- **FileSystem:** 统一的文件系统操作（Node.js 和 Bun 实现）
- **Path:** 跨平台路径操作
- **Terminal:** 终端输入输出

**使用模式:**

```typescript
import { HttpClient } from "@effect/platform"
import { Effect } from "effect"

const program = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  const response = yield* client.get("https://api.example.com/users")
  const body = yield* response.json
  return body
})
```

### 4.2 @effect/cli

`@effect/cli` 提供类型安全的命令行应用构建工具。

**核心特性:**

- 类型安全的参数解析（自动生成帮助信息）
- 命令树定义（支持子命令）
- 自动补全生成
- 与 Effect 无缝集成

**使用模式:**

```typescript
import { Command, Args } from "@effect/cli"
import { Effect, Console } from "effect"

const greet = Command.make("greet", {
  name: Args.text({ name: "name" }),
  verbose: Args.boolean({ name: "verbose" }).pipe(Args.withDefault(false)),
}, ({ name, verbose }) =>
  Effect.gen(function* () {
    if (verbose) yield* Console.log(`[INFO] 向 ${name} 打招呼`)
    yield* Console.log(`你好, ${name}!`)
  })
)
```

### 4.3 @effect/rpc

`@effect/rpc` 提供类型安全的远程过程调用框架。

**核心特性:**

- 基于 Schema 的协议定义（请求/响应类型自动推导）
- 支持多种传输层（HTTP、WebSocket）
- 自动序列化/反序列化
- 端到端类型安全

**使用模式:**

```typescript
import { RpcSchema, RpcRouter } from "@effect/rpc"
import { Schema } from "effect"

// 定义 RPC 协议
class GetUser extends RpcSchema<{ id: string }, { name: string; email: string }>()("GetUser", {
  id: Schema.String,
}, {
  name: Schema.String,
  email: Schema.String,
}) {}

// 定义路由
const router = RpcRouter.make(
  RpcRouter.effect(GetUser, (req) =>
    Effect.succeed({ name: "Alice", email: "alice@example.com" })
  ),
)
```

### 4.4 @effect/sql

`@effect/sql` 提供类型安全的 SQL 数据库访问。

**核心特性:**

- 基于模板字面量的 SQL 查询（自动参数化，防 SQL 注入）
- 数据库迁移管理
- 支持 PostgreSQL、SQLite、MySQL
- 与 Schema 无缝集成

**使用模式:**

```typescript
import { SqlClient } from "@effect/sql"
import { Effect, Schema } from "effect"

class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
}) {}

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const users = yield* sql`SELECT * FROM users WHERE id = ${"1"}`
    .pipe(SqlClient.mapRows(User))
  return users
})
```

### 4.5 更多生态库

| 库 | 用途 | 学习资源 |
|----|------|----------|
| `@effect/opentelemetry` | OpenTelemetry 集成 | 第 7 章 (Config) |
| `@effect/experimental` | 实验性 API | GitHub 仓库 |
| `@effect/typeclass` | 函数式类型类 | 文档站 |
| `@effect/printer` | 文档打印/格式化 | 文档站 |
| `@effect/serialization` | 序列化框架 | 文档站 |

---

## 五、常见迁移问题

### 5.1 如何处理第三方库?

**策略:** 在边界处使用 Adapter 模式。

```typescript
// 第三方库 (如 axios)
import axios from "axios"

// 创建 Effect 适配器
const axiosGet = (url: string): Effect.Effect<never, FetchError, unknown> =>
  Effect.tryPromise({
    try: () => axios.get(url).then((r) => r.data),
    catch: (e) => new FetchError((e as Error).message),
  })
```

### 5.2 如何与现有 Express/Fastify 集成?

**策略:** 在路由处理器中使用 `Effect.runPromise`。

```typescript
app.get("/users/:id", async (req, res) => {
  try {
    const user = await Effect.runPromise(fetchUser(req.params.id))
    res.json(user)
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})
```

### 5.3 如何与现有测试框架集成?

**策略:** 在测试中使用 `Effect.runPromise` 或 `Effect.runSync`。

```typescript
import { describe, it, expect } from "vitest"

describe("UserService", () => {
  it("should fetch user", async () => {
    const result = await Effect.runPromise(
      UserRepository.pipe(
        Effect.flatMap((repo) => repo.findById("1")),
        Effect.provide(MockUserRepoLayer),
      ),
    )
    expect(result.name).toBe("Alice")
  })
})
```

### 5.4 团队学习曲线如何管理?

**建议:**

1. **先学 Schema** — 侵入性最小，收益最直接
2. **再学 Effect 基础** — Effect.gen、Effect.pipe、错误处理
3. **逐步引入 Layer** — 从新模块开始，不重构旧代码
4. **代码审查** — 关注"是否利用了 Effect 的类型安全"而非"是否完全 Effect 化"
5. **内部培训** — 用本书作为教材，每个章节对应一次分享

---

## 六、从本书中学到的核心模式

回顾全书，以下是你在 20 章学习中掌握的核心模式：

### 6.1 类型安全模式

| 模式 | 章节 | 核心 API |
|------|------|----------|
| 类型化错误 | 第 2、5 章 | `Effect.fail`、`Effect.catchAll` |
| Schema 校验 | 第 3、9 章 | `Schema.decode`、`Schema.Class` |
| 编译期依赖检查 | 第 4、8 章 | `Context.Service`、`Layer.provide` |
| 类型化配置 | 第 7 章 | `Config.string`、`Config.all` |

### 6.2 并发模式

| 模式 | 章节 | 核心 API |
|------|------|----------|
| Fiber 管理 | 第 11 章 | `Effect.fork`、`Fiber.join` |
| 结构化并发 | 第 11 章 | `Scope`、`Effect.scoped` |
| 消息传递 | 第 13 章 | `Queue`、`Deferred` |
| 高级并发 | 第 14 章 | `SynchronizedRef`、`PubSub` |

### 6.3 数据流模式

| 模式 | 章节 | 核心 API |
|------|------|----------|
| 流式处理 | 第 12 章 | `Stream`、`Stream.runCollect` |
| 背压管理 | 第 12、13 章 | `Stream.buffer`、`Queue.bounded` |
| 缓存策略 | 第 10 章 | `Effect.cached`、`Effect.cachedWithTTL` |

### 6.4 资源管理模式

| 模式 | 章节 | 核心 API |
|------|------|----------|
| 作用域资源 | 第 6 章 | `Scope.addFinalizer`、`Effect.acquireRelease` |
| 分层架构 | 第 4、8 章 | `Layer.effect`、`Layer.provide` |
| 内存管理 | 第 16 章 | `WeakMap`、`Ref`、`SynchronizedRef` |

---

## 七、总结与下一步

### 7.1 全书回顾

Effect-TS 提供了一套完整的**类型安全、可组合、可测试**的编程框架。从第 1 章的"为什么需要 Effect-TS"到第 20 章的"迁移指南"，你学到的核心思想是：

1. **类型即文档** — 函数签名声明了所有可能的成功和失败路径
2. **可组合性** — 小 Effect 组合成大 Effect，小 Layer 组合成大 Layer
3. **关注点分离** — 业务逻辑、错误处理、依赖注入、副作用各司其职
4. **渐进式采用** — 可以从 Schema 开始，逐步引入更多 Effect 特性

### 7.2 学习路径建议

如果你希望继续深入学习：

1. **阅读源码** — Effect-TS 的源码是学习函数式编程设计的优秀教材
2. **参与社区** — GitHub Discussions、Discord 频道
3. **贡献生态** — 为 @effect/* 库贡献代码或文档
4. **实战项目** — 用 Effect-TS 重写一个小型服务，体验完整开发流程

### 7.3 资源链接

- **官方文档:** https://effect.website/
- **GitHub:** https://github.com/Effect-TS/effect
- **Discord:** https://discord.gg/effect-ts
- **API 参考:** https://effect-ts.github.io/effect/

---

> **全书完。** 感谢你阅读《Effect-TS 实战指南》。希望本书能帮助你在 TypeScript 项目中写出更安全、更可维护的代码。
