# 第 2 章 · HTTP 服务端

## 2.1 场景概述

opencode 的 HTTP API 服务端是 Web 应用、SDK 客户端和外部集成的通信中枢。当 HTTP 请求到达时，服务端需要：解析路由参数、加载实例上下文、注入依赖、执行 Handler 的 Effect 逻辑、返回响应。整个过程由 Effect-TS 的 Layer 系统和中间件链驱动。

为什么需要 Effect？HTTP 请求处理涉及多层依赖——实例上下文（哪个项目）、认证信息（哪个用户）、数据库连接、文件系统访问等。Effect 的 Layer 系统让这些依赖以声明式的方式层层注入，中间件只需声明"我需要什么"，运行时自动提供。

## 2.2 触发流程

```text
HTTP Request 到达
    │
    ▼
┌─ server.ts: Effect.runPromise(listenEffect(opts)) ─────────┐
│  服务启动时：将 HTTP 监听器的创建包装为 Effect               │
│  返回 { listener, stop: () => Effect.runPromiseExit(...) }  │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ 路由匹配 → 中间件链 ──────────────────────────────────────┐
│                                                            │
│  ① workspace-routing.ts                                    │
│     解析 URL 中的 directory/workspace 参数                  │
│     → 提供 WorkspaceRouteContext                            │
│                                                            │
│  ② instance-context.ts                                     │
│     Effect.gen(function* () {                               │
│       const route = yield* WorkspaceRouteContext            │
│       const ctx = yield* store.load({ directory })          │
│       return effect.pipe(                                  │
│         Effect.provideService(InstanceRef, ctx),            │
│         Effect.provideService(WorkspaceRef, workspaceID)    │
│       )                                                    │
│     })                                                      │
│     加载项目实例，注入 InstanceRef + WorkspaceRef            │
│                                                            │
│  ③ authorization.ts                                        │
│     检查认证 token，注入用户身份信息                         │
│                                                            │
│  ④ error.ts / fence.ts                                     │
│     错误处理、并发请求栅栏                                   │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ Handler 执行 (如 session.ts handler) ─────────────────────┐
│  Effect.gen(function* () {                                  │
│    const session = yield* SessionPrompt.Service             │
│    const result = yield* session.prompt(input)              │
│    return HttpServerResponse.json(result)                   │
│  })                                                         │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ 响应返回 ─────────────────────────────────────────────────┐
│  Effect 执行结果 → HTTP Response (JSON)                     │
└────────────────────────────────────────────────────────────┘
```

## 2.3 关键触发点详解

### 触发点 1：服务启动

**文件**：`server/server.ts:76-81`

```typescript
const listener = await Effect.runPromise(listenEffect(opts))

return {
  listener,
  stop: (close?: boolean) =>
    Effect.runPromiseExit(listener.stop(close)).then(() => undefined),
}
```

**自然语言解释**：服务启动时，`listenEffect(opts)` 返回一个 Effect（创建 HTTP 监听器可能失败——端口被占用、权限不足等）。`Effect.runPromise` 执行这个 Effect，成功则返回 listener 对象。停止服务时使用 `Effect.runPromiseExit`——与 `runPromise` 不同，它不抛出异常，而是返回 `Exit` 对象（包含成功或失败信息），然后 `.then(() => undefined)` 忽略结果。这种设计让服务的启停都以类型安全的方式处理错误。

### 触发点 2：实例上下文中间件

**文件**：`server/routes/instance/httpapi/middleware/instance-context.ts:23-35`

```typescript
function provideInstanceContext(
  effect: Effect.Effect<HttpServerResponse, E>,
  store: InstanceStore.Interface,
): Effect.Effect<HttpServerResponse, E, WorkspaceRouteContext> {
  return Effect.gen(function* () {
    const route = yield* WorkspaceRouteContext
    const ctx = yield* store.load({ directory: decode(route.directory) })
    return yield* effect.pipe(
      Effect.provideService(InstanceRef, ctx),
      Effect.provideService(WorkspaceRef, route.workspaceID),
    )
  })
}
```

**自然语言解释**：这是 HTTP 服务端最关键的中间件。它做了三件事：第一，从 `WorkspaceRouteContext` 中获取当前请求对应的项目目录和 Workspace ID（这些信息从 URL 参数中解析出来）；第二，调用 `store.load()` 加载完整的项目实例上下文（包括 directory、worktree、project info）；第三，将加载到的上下文通过 `Effect.provideService` 注入到下游 Handler 的 Effect 环境中。这样 Handler 就可以直接 `yield* InstanceRef` 获取当前项目信息，而不需要手动解析 URL 参数。

### 触发点 3：并发请求栅栏

**文件**：`server/shared/fence.ts:73`

```typescript
await AppRuntime.runPromise(waitEffect(workspaceID, state, signal))
```

**自然语言解释**：栅栏（Fence）机制防止同一个 Session 的多个请求并发执行导致竞态条件。`waitEffect` 返回一个 Effect——如果当前 Session 正在处理其他请求，这个 Effect 会等待（阻塞）直到前一个请求完成。`AppRuntime.runPromise` 执行这个等待 Effect。这是 Effect 在并发控制场景中的典型应用——将"等待某个条件"建模为 Effect，由运行时管理阻塞和唤醒。

### 触发点 4：中间件 Layer 组装

**文件**：`server/routes/instance/httpapi/server.ts`

```typescript
// 中间件以 Layer 形式组装
const middlewareLayer = Layer.provideMerge(
  InstanceContextMiddleware.layer,
  AuthorizationMiddleware.layer,
  ErrorMiddleware.layer,
  // ...
)
```

**自然语言解释**：每个中间件被定义为 Effect Layer。`Layer.provideMerge` 将多个中间件 Layer 合并为一个完整的中间件链。当 HTTP 请求进入时，Effect 运行时按 Layer 的顺序依次执行中间件，每个中间件可以注入新的服务到 Effect 环境中。这种设计让中间件的组合是类型安全的——如果某个中间件需要的前置服务没有被提供，编译器会报错。

## 2.4 涉及的 Effect 方法

### `Effect.runPromise(effect)`
**作用**：将 Effect 转换为 Promise 并执行。成功返回结果，失败抛出异常。

**本章使用场景**：服务启动时执行 `listenEffect`。

### `Effect.runPromiseExit(effect)`
**作用**：与 `runPromise` 类似，但不抛出异常。返回 `Exit` 对象——`Exit.Success(value)` 或 `Exit.Failure(cause)`。适合需要自己处理成功和失败两种情况的场景。

**本章使用场景**：服务停止时——无论停止成功还是失败，都忽略结果继续执行。

### `Layer.effect(tag, effect)`
**作用**：从 Effect 创建 Layer。Effect 的执行结果作为该 Layer 提供的服务实例。

**本章使用场景**：`instance-context.ts` 中创建 `InstanceContextMiddleware` 的 Layer。

### `Layer.provideMerge(layer1, layer2, ...)`
**作用**：合并多个 Layer，后一个 Layer 的依赖由前一个 Layer 提供。用于构建中间件链。

**本章使用场景**：组装中间件链。

### `Effect.provideService(tag, value)`
**作用**：向 Effect 环境注入服务实例。

**本章使用场景**：中间件将 `InstanceRef` 和 `WorkspaceRef` 注入到 Handler 的 Effect 环境。

### `Effect.gen(function* () { ... })`
**作用**：创建生成器风格的 Effect，使用 `yield*` 访问依赖和执行子 Effect。

**本章使用场景**：中间件逻辑、Handler 逻辑。

### `Effect.orDie`
**作用**：将 Effect 的错误通道转为缺陷通道——即"这个操作不应该失败，如果失败了就是 bug"。

**本章使用场景**：某些中间件操作（如读取已确认存在的配置）使用 `orDie` 表示"这里不可能失败"。

## 2.5 本章小结

HTTP 服务端的 Effect 触发围绕"中间件链"展开。每个中间件是一个 Effect Layer，按顺序注入依赖：路由解析 → 实例上下文加载 → 认证检查 → 错误处理。Handler 在完整的依赖环境中执行，通过 `yield*` 访问所有注入的服务。`Effect.runPromise` 和 `Effect.runPromiseExit` 分别用于服务启动（需要捕获错误）和停止（忽略错误）场景。
