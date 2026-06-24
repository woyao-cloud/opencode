# 第 19 章: OpenCode 实战案例剖析

## 1. 本章目标

完成本章学习后，你将能够：

- 理解 OpenCode 项目如何使用 `ManagedRuntime` + `Layer.mergeAll` 构建大型应用依赖图
- 使用 `Context.Service` + `Layer.effect` 模式实现可插拔的服务注册系统
- 使用 `Stream` + `Queue` 处理实时消息流（如 MCP 协议）
- 使用 `Fiber` + `Scope` 管理后台监听任务的生命周期
- 使用 `Schema` + `Deferred` 实现异步审批流程

## 2. 前置知识

阅读本章前，你需要掌握：

- **第 4 章 (Context & Layer):** `Context.Tag`、`Layer.effect`、`Layer.provide`、`Layer.mergeAll`
- **第 8 章 (Layer 进阶):** `Layer.provideMerge`、`ManagedRuntime`
- **第 11 章 (Fiber):** `Effect.fork`、`Effect.forkScoped`、`Fiber.interrupt`
- **第 12 章 (Stream):** `Stream.fromQueue`、`Stream.runForEach`
- **第 13 章 (Queue & Deferred):** `Queue.bounded`、`Queue.unbounded`、`Deferred.make`、`Deferred.await`
- **第 14 章 (高级并发):** `Effect.acquireUseRelease`、结构化并发

## 3. 概念讲解

### 3.1 OpenCode 项目概览

[OpenCode](https://github.com/opencode-ai/opencode) 是一个基于 Effect-TS 构建的开源 AI 编码助手。它深度使用了 Effect-TS 的核心特性来管理复杂的依赖图、并发任务和资源生命周期。

OpenCode 的架构围绕以下几个核心模式展开：

| 模式 | 使用场景 | 对应 Effect-TS API |
|------|----------|-------------------|
| **Runtime 架构** | 管理 50+ 服务的依赖注入 | `ManagedRuntime` + `Layer.mergeAll` |
| **工具系统** | 可插拔的工具注册与执行 | `Context.Service` + `Layer.effect` |
| **MCP 客户端** | 多服务器连接与消息流 | `Stream` + `Queue` + `Effect.acquireUseRelease` |
| **文件监听器** | 后台文件变更监听 | `Fiber` + `Scope` + `Effect.addFinalizer` |
| **权限系统** | 异步审批流程 | `Schema` + `Deferred` + `Layer` |

本章通过五个简化但真实的案例，逐一剖析这些模式。

### 3.2 ManagedRuntime + Layer.mergeAll 模式

OpenCode 的 `app-runtime.ts` 是 Effect-TS 依赖注入模式的典型应用。它使用 `Layer.mergeAll` 将 50+ 个服务层合并为一个巨大的 `AppLayer`，然后通过 `ManagedRuntime.make` 创建运行时。

```typescript
// OpenCode 源码 (简化)
export const AppLayer = Layer.mergeAll(
  Bus.defaultLayer,
  Auth.defaultLayer,
  Config.defaultLayer,
  Git.defaultLayer,
  File.defaultLayer,
  FileWatcher.defaultLayer,
  // ... 50+ 个服务层
).pipe(
  Layer.provideMerge(InstanceLayer.layer),
  Layer.provideMerge(Observability.layer),
)

const rt = ManagedRuntime.make(AppLayer, { memoMap })
```

**关键设计决策：**

1. **每个服务独立提供依赖** — 每个 `defaultLayer` 通过 `Layer.provide` 自包含其所有依赖，确保 `Layer.mergeAll` 合并时没有缺失。

2. **`Layer.provideMerge` 注入全局依赖** — `InstanceLayer` 和 `Observability` 是全局共享的，通过 `provideMerge` 注入到所有服务中。

3. **`ManagedRuntime` 封装运行时** — 提供 `runSync`、`runPromise`、`runFork`、`runCallback` 等统一入口，并支持 `dispose` 清理。

4. **类型安全的服务提取** — 使用 `ManagedRuntime.ManagedRuntime.Services<typeof rt>` 提取运行时提供的所有服务类型。

### 3.3 Context.Service + Layer.effect 模式

OpenCode 的工具注册系统 (`tool/registry.ts`) 展示了 `Context.Service` 的典型用法。每个工具（Shell、Read、Grep 等）都是一个独立的 `ToolDef`，通过 `Layer.effect` 注册到 `ToolRegistry` 服务中。

```typescript
// OpenCode 源码 (简化)
export class Service extends Context.Service<Service, Interface>()("@opencode/ToolRegistry") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const plugin = yield* Plugin.Service
    // ... 初始化工具列表
    return Service.of({ ids, all, named, tools })
  }),
)
```

**`Context.Service` 的优势：**

- **类型安全** — 服务标识符和接口类型绑定在一起，编译时检查
- **唯一标识** — 字符串标识符（如 `"@opencode/ToolRegistry"`）确保运行时唯一性
- **自动推断** — TypeScript 自动推断服务类型，无需手动声明

### 3.4 Stream + Queue 模式

OpenCode 的 MCP 客户端 (`mcp/index.ts`) 使用 `Stream` 和 `Queue` 处理实时消息流。当 MCP 服务器工具列表变更时，通过 `Bus`（基于 `Queue`）发送通知，其他组件通过 `Stream` 消费这些事件。

```typescript
// OpenCode 源码 (简化)
export const ToolsChanged = BusEvent.define(
  "mcp.tools.changed",
  Schema.Struct({ server: Schema.String }),
)

// 发送通知
yield* bus.publish(ToolsChanged, { server: name })

// 消费通知 — 通过 Stream
```

**`Effect.acquireUseRelease` 管理连接生命周期：**

```typescript
// OpenCode 源码 (简化)
const connectTransport = (transport, timeout) =>
  Effect.acquireUseRelease(
    Effect.succeed(transport),
    (t) => Effect.tryPromise(() => client.connect(t)),
    (t, exit) => Exit.isFailure(exit) ? Effect.tryPromise(() => t.close()) : Effect.void,
  )
```

这个模式确保：
- **获取** — 创建传输层对象
- **使用** — 连接客户端
- **释放** — 连接失败时自动关闭传输层

### 3.5 Fiber + Scope 模式

OpenCode 的文件监听器 (`file/watcher.ts`) 使用 `Fiber` + `Scope` 管理后台监听任务的生命周期。通过 `Effect.forkScoped` 在 Scope 中派生 Fiber，当 Scope 结束时自动中断所有监听 Fiber。

```typescript
// OpenCode 源码 (简化)
yield* Effect.forkScoped(
  subscribe(ctx.directory, [...FileIgnore.PATTERNS, ...cfgIgnores]),
)

// 注册清理逻辑
yield* Effect.addFinalizer(() =>
  Effect.promise(() => Promise.allSettled(subs.map((sub) => sub.unsubscribe()))),
)
```

**结构化并发的优势：**

- **自动清理** — Scope 结束时，所有 `forkScoped` 的 Fiber 自动中断
- **资源安全** — `addFinalizer` 确保清理逻辑始终执行
- **错误隔离** — 单个 Fiber 失败不会影响其他 Fiber

### 3.6 Schema + Deferred 模式

OpenCode 的权限系统 (`permission/index.ts`) 使用 `Schema` 定义权限请求/回复的数据结构，使用 `Deferred` 实现异步审批流程。当 AI 需要执行需要权限的操作时，系统创建一个 `Deferred`，等待用户审批。

```typescript
// OpenCode 源码 (简化)
const deferred = yield* Deferred.make<void, RejectedError | CorrectedError>()
pending.set(id, { info, deferred })
yield* bus.publish(Event.Asked, info)

// 等待用户回复
return yield* Effect.ensuring(
  Deferred.await(deferred),
  Effect.sync(() => pending.delete(id)),
)
```

**异步审批流程：**

1. **请求** — AI 发起权限请求，创建 `Deferred`
2. **通知** — 通过 `Bus` 发布 `Event.Asked` 事件
3. **等待** — `Deferred.await` 挂起当前 Effect
4. **回复** — 用户批准/拒绝，通过 `Deferred.succeed` / `Deferred.fail` 恢复 Effect
5. **清理** — `Effect.ensuring` 确保无论成功还是失败都清理 pending 状态

## 4. 代码示例

### 4.1 Runtime 架构 (`01-runtime-arch.ts`)

本示例模拟 OpenCode 的 `app-runtime.ts`，展示如何使用 `ManagedRuntime` + `Layer.mergeAll` 构建应用依赖图。

**核心流程：**

1. 使用 `Context.Service` 定义 4 个服务接口：`ConfigService`、`LoggerService`、`DatabaseService`、`AppService`
2. 使用 `Layer.effect` 实现每个服务，通过 `Layer.provide` 注入依赖
3. 使用 `Layer.mergeAll` 合并所有服务层
4. 使用 `ManagedRuntime.make` 创建运行时
5. 通过运行时执行 Effect，自动注入所有依赖

**运行方式：**
```bash
bun run demo:runtime
```

**预期输出：**
```
[INFO] 应用启动于 localhost:8080
[DB] 查询 localhost:8080 — SELECT * FROM users
[INFO] 查询到 2 条记录
应用启动完成!
```

### 4.2 工具系统 (`02-tool-system.ts`)

本示例模拟 OpenCode 的 `tool/registry.ts`，展示如何使用 `Context.Service` + `Layer.effect` 实现可插拔的工具注册系统。

**核心流程：**

1. 定义 `ToolDef` 类型和 `ToolRegistryInterface` 接口
2. 使用 `Context.Service` 定义 `ToolRegistry` 服务
3. 实现 `ToolRegistryLayer` 管理工具注册和查询
4. 创建 `InitLayer` 注册内置工具（Shell、Read、Grep）
5. 通过 `Effect.provide` 注入服务层

**运行方式：**
```bash
bun run demo:tool
```

**预期输出：**
```
已注册 3 个工具:
  - shell: 执行 shell 命令
  - read: 读取文件内容
  - grep: 搜索文件内容

[Shell] 执行命令: ls -la
结果: 命令 "ls -la" 执行成功
[Read] 读取文件: /tmp/test.txt
结果: 文件 /tmp/test.txt 的内容: Hello, World!
[Grep] 在 ./src 中搜索: TODO
结果: 在 ./src 中找到 3 处匹配
```

### 4.3 MCP 客户端 (`03-mcp-client.ts`)

本示例模拟 OpenCode 的 `mcp/index.ts`，展示如何使用 `Stream` + `Queue` 处理 MCP 协议消息流。

**核心流程：**

1. 定义 MCP 消息类型和 `MCPInterface` 接口
2. 使用 `Queue.unbounded` 创建工具变更通知队列
3. 使用 `Stream.fromQueue` 将队列转换为流
4. 使用 `Effect.forkScoped` 启动后台 Fiber 消费流
5. 使用 `Queue.offer` 发送通知事件

**运行方式：**
```bash
bun run demo:mcp
```

**预期输出：**
```
[MCP] 正在连接 filesystem (http://localhost:3001/mcp)...
[MCP] filesystem 已连接，3 个工具可用
filesystem 状态: connected
...
[Watcher] 工具变更通知: filesystem
...
filesystem 工具列表:
  - read_file: 读取文件
  - write_file: 写入文件
  - list_dir: 列出目录
...
```

### 4.4 文件监听器 (`04-file-watcher.ts`)

本示例模拟 OpenCode 的 `file/watcher.ts`，展示如何使用 `Fiber` + `Scope` 管理后台监听任务的生命周期。

**核心流程：**

1. 使用 `Queue.unbounded` 创建文件事件队列
2. 使用 `Effect.forkScoped` 在 Scope 中启动后台监听 Fiber
3. 使用 `Effect.addFinalizer` 注册清理逻辑
4. 使用 `Stream.fromQueue` 消费文件事件
5. 使用 `Effect.scoped` 提供 Scope，确保 Fiber 自动清理

**运行方式：**
```bash
bun run demo:watcher
```

**预期输出：**
```
[Watcher] 初始化文件监听器...
[Main] 开始监听文件变更...
[Watcher] 后台监听已启动
[Watcher] 检测到变更: change /project/src/main.ts
[Main] 处理事件: change — /project/src/main.ts
...
[Main] 监听完成
[Watcher] 监听器已关闭
```

### 4.5 权限系统 (`05-permission-system.ts`)

本示例模拟 OpenCode 的 `permission/index.ts`，展示如何使用 `Schema` + `Deferred` 实现异步审批流程。

**核心流程：**

1. 使用 `Schema.Struct` 和 `Schema.Class` 定义权限数据结构
2. 使用 `Schema.TaggedErrorClass` 定义权限错误类型
3. 使用 `Deferred.make` 创建异步等待点
4. 使用 `Deferred.await` 挂起 Effect 等待审批
5. 使用 `Deferred.succeed` / `Deferred.fail` 恢复 Effect

**运行方式：**
```bash
bun run demo:permission
```

**预期输出：**
```
--- 场景 1: 读取文件 (已批准) ---
[权限] 评估 read:/project/src/main.ts → allow
读取操作已通过

--- 场景 2: 执行 shell 命令 (需要审批) ---
[权限] 评估 shell:/project/package.json → ask
[权限] 需要审批: shell /project/package.json (请求ID: req_...)
[权限] 批准: shell (once)
Shell 操作已通过!

--- 场景 3: 被拒绝的操作 ---
[权限] 评估 shell:/other/secret.txt → ask
[权限] 需要审批: shell /other/secret.txt (请求ID: req_...)
[权限] 拒绝: shell
被拒绝: 用户拒绝了此权限请求
```

## 5. 本章小结

### 5.1 模式对比

| 模式 | 核心 API | 适用场景 | 复杂度 |
|------|----------|----------|--------|
| Runtime 架构 | `ManagedRuntime` + `Layer.mergeAll` | 大型应用依赖注入 | 高 |
| 工具系统 | `Context.Service` + `Layer.effect` | 可插拔服务注册 | 中 |
| MCP 客户端 | `Stream` + `Queue` | 实时消息流处理 | 高 |
| 文件监听器 | `Fiber` + `Scope` | 后台任务生命周期管理 | 中 |
| 权限系统 | `Schema` + `Deferred` | 异步审批流程 | 中 |

### 5.2 关键设计原则

1. **依赖自包含** — 每个服务层通过 `Layer.provide` 自包含其依赖，确保可组合性
2. **资源安全** — 使用 `Effect.acquireUseRelease` 和 `Scope` 确保资源正确释放
3. **类型安全** — 使用 `Context.Service` 和 `Schema` 在编译时捕获类型错误
4. **结构化并发** — 使用 `Fiber` + `Scope` 管理并发任务，避免资源泄漏
5. **异步解耦** — 使用 `Deferred` 解耦请求和响应，支持异步审批流程

### 5.3 与 OpenCode 源码的对应关系

| 本案例 | OpenCode 源码 | 核心差异 |
|--------|---------------|----------|
| `01-runtime-arch.ts` | `src/effect/app-runtime.ts` | 简化了 50+ 服务为 4 个 |
| `02-tool-system.ts` | `src/tool/registry.ts` | 简化了工具定义和插件系统 |
| `03-mcp-client.ts` | `src/mcp/index.ts` | 简化了 OAuth 和传输层 |
| `04-file-watcher.ts` | `src/file/watcher.ts` | 简化了 Parcel watcher 集成 |
| `05-permission-system.ts` | `src/permission/index.ts` | 简化了数据库持久化 |

## 6. 扩展阅读

- [OpenCode 源码仓库](https://github.com/opencode-ai/opencode) — 完整的 Effect-TS 大型项目实践
- [Effect-TS Layer 文档](https://effect.website/docs/guides/layer) — Layer 组合的详细指南
- [Effect-TS Stream 文档](https://effect.website/docs/guides/stream) — 流式数据处理
- [Effect-TS Concurrent 文档](https://effect.website/docs/guides/concurrency) — 并发与 Fiber

## 7. 练习

1. **扩展 Runtime 架构** — 在 `01-runtime-arch.ts` 中添加一个 `CacheService`，使用 `Layer.mergeAll` 合并，并让 `AppService` 使用缓存
2. **添加新工具** — 在 `02-tool-system.ts` 中注册一个 `WebFetchTool`，模拟 HTTP 请求
3. **实现 MCP 重连** — 在 `03-mcp-client.ts` 中添加自动重连逻辑，使用 `Schedule` 控制重试策略
4. **文件过滤** — 在 `04-file-watcher.ts` 中添加文件过滤功能，只监听 `.ts` 文件变更
5. **批量审批** — 在 `05-permission-system.ts` 中添加"always"支持，一次性批准所有待处理的同类型请求
