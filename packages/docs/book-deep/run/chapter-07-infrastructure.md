# 第 7 章 · 基础设施

## 7.1 场景概述

基础设施层涵盖数据库初始化、文件监听、OAuth 认证、版本检查/升级、Git 仓库克隆等底层操作。这些操作的共同特点是：在应用启动时或特定时机被触发，通常不依赖完整的全局运行时，而是使用 `Effect.runSync`（同步初始化）、`Effect.promise`（包装外部 Promise）或 `makeRuntime`（轻量运行时）。

为什么需要 Effect？基础设施操作虽然"底层"，但同样可能失败——数据库文件可能损坏、网络请求可能超时、文件系统可能不可访问。Effect 的类型安全错误处理让这些失败被明确建模，而不是被忽略或粗暴地 `try-catch`。

## 7.2 触发流程

```text
应用启动
    │
    ▼
┌─ 数据库初始化 (storage/db.ts) ─────────────────────────────┐
│  Effect.runSync(                                           │
│    RuntimeFlags.Service.useSync((flags) => flags)          │
│      .pipe(Effect.provide(RuntimeFlags.defaultLayer))      │
│  )                                                          │
│  同步读取运行时标志，决定数据库行为                          │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ 文件监听 (file/watcher.ts) ───────────────────────────────┐
│  Effect.gen(function* () {                                  │
│    const bridge = yield* EffectBridge.make()                │
│    // 监听文件系统事件                                       │
│    const sub = yield* Effect.promise(() => pending)         │
│    // 取消订阅                                               │
│    yield* Effect.promise(() =>                              │
│      Promise.allSettled(subs.map(s => s.unsubscribe()))     │
│    )                                                        │
│  })                                                         │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ OAuth 认证 (mcp/oauth-provider.ts) ───────────────────────┐
│  多次 Effect.runPromise 调用:                                │
│  · auth.getForUrl() → 检查认证状态                           │
│  · auth.updateCodeVerifier() → 更新 PKCE 验证码              │
│  · auth.updateOAuthState() → 更新 OAuth 状态                 │
│  · auth.set() / auth.remove() → 存储/删除 token              │
│                                                             │
│  整个 OAuth 流程是多个独立 Effect 的顺序调用                  │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ 版本检查 (installation/index.ts) ─────────────────────────┐
│  const { runPromise } = makeRuntime(Service, defaultLayer)   │
│  export const latest = (...) =>                              │
│    runPromise((s) => s.latest(...))                          │
│  export const upgrade = (...) =>                             │
│    runPromise((s) => s.upgrade(...))                         │
│                                                             │
│  轻量运行时 + 服务方法访问                                    │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ Git 仓库克隆 (reference/repository-cache.ts) ─────────────┐
│  Effect.promise((signal) =>                                 │
│    Flock.acquire(`repo-clone:${localPath}`, { signal })     │
│  )                                                          │
│  文件锁 → Effect 包装                                        │
└────────────────────────────────────────────────────────────┘
```

## 7.3 关键触发点详解

### 触发点 1：Effect.runSync — 数据库同步初始化

**文件**：`storage/db.ts:29`

```typescript
Effect.runSync(
  RuntimeFlags.Service.useSync((flags) => flags)
    .pipe(Effect.provide(RuntimeFlags.defaultLayer))
)
```

**自然语言解释**：数据库初始化需要在任何异步操作之前完成——必须在应用启动的最早阶段确定数据库行为（如是否使用内存数据库）。`Effect.runSync` 同步执行 Effect——它要求 Effect 内部没有异步操作，执行期间阻塞调用线程。这里用 `useSync`（同步版服务访问器）读取运行时标志，然后 `Effect.provide` 手动注入 `RuntimeFlags.defaultLayer`。这是 opencode 中少数使用 `runSync` 的场景——大多数场景用 `runPromise` 处理异步操作。

### 触发点 2：EffectBridge + Effect.promise — 文件监听

**文件**：`file/watcher.ts:92-110`

```typescript
const bridge = yield* EffectBridge.make()

// 取消所有订阅
yield* Effect.promise(() =>
  Promise.allSettled(subs.map((sub) => sub.unsubscribe()))
)

// 创建新订阅
const sub = yield* Effect.promise(() => pending)
```

**自然语言解释**：文件监听器需要与 Node.js 的文件系统事件 API 交互——这些 API 返回 Promise，不是 Effect。`Effect.promise` 将 Promise 包装为 Effect，使其可以参与 Effect 的错误处理和取消传播。`EffectBridge.make()` 创建桥接器，让文件监听器可以在 Effect 上下文中运行，同时与外部 Promise 世界交互。

### 触发点 3：OAuth 流程 — 多次 Effect.runPromise 的顺序调用

**文件**：`mcp/oauth-provider.ts:66-189`

```typescript
// 步骤 1: 检查认证状态
const entry = await Effect.runPromise(
  this.auth.getForUrl(this.mcpName, this.serverUrl)
)

// 步骤 2: 更新 PKCE 验证码
await Effect.runPromise(
  this.auth.updateCodeVerifier(this.mcpName, codeVerifier)
)

// 步骤 3: 获取当前状态
const entry = await Effect.runPromise(
  this.auth.get(this.mcpName)
)

// 步骤 4: 更新 OAuth 状态
await Effect.runPromise(
  this.auth.updateOAuthState(this.mcpName, state)
)

// ... 更多步骤 ...
```

**自然语言解释**：OAuth 认证流程是一个多步骤的顺序操作——每一步依赖前一步的结果。每一步都用 `Effect.runPromise` 执行一个独立的 Effect（数据库读写），然后用 `await` 等待结果。这种"多个独立 Effect 顺序执行"的模式在需要与外部系统交互的流程中很常见——每个步骤是独立的 Effect（有自己的错误处理），但整体流程是顺序的 Promise 链。

### 触发点 4：makeRuntime — 版本检查的轻量运行时

**文件**：`installation/index.ts:321-325`

```typescript
const { runPromise } = makeRuntime(Service, defaultLayer)

export const latest = (...args) =>
  runPromise((s) => s.latest(...args))
export const method = () =>
  runPromise((s) => s.method())
export const upgrade = (...args) =>
  runPromise((s) => s.upgrade(...args))
```

**自然语言解释**：版本检查和升级是独立的功能，不需要完整的全局运行时。`makeRuntime` 从 `Service` + `defaultLayer` 创建轻量运行时，然后为每个服务方法生成对应的导出函数。这些导出函数可以在应用的任何地方调用——它们内部通过 `runPromise` 执行 Effect，对外表现为普通的异步函数。

### 触发点 5：Effect.promise — 文件锁包装

**文件**：`reference/repository-cache.ts:65,143`

```typescript
// 获取文件锁
Effect.promise((signal) =>
  Flock.acquire(`repo-clone:${localPath}`, { signal })
)

// 释放文件锁
(lock) => Effect.promise(() => lock.release()).pipe(Effect.ignore)
```

**自然语言解释**：Git 仓库克隆需要文件锁——防止多个进程同时克隆同一个仓库。`Flock.acquire` 返回 Promise，`Effect.promise` 将其包装为 Effect。注意 `signal` 参数——这是 Effect 的 `AbortSignal`，当 Effect 被中断时，signal 被触发，`Flock.acquire` 收到中断信号后释放锁等待。释放锁时用 `Effect.ignore` 忽略结果——锁释放失败不应该中断主流程。

## 7.4 涉及的 Effect 方法

### `Effect.runSync(effect)`
**作用**：同步执行 Effect。阻塞调用线程直到 Effect 完成。要求 Effect 内部没有异步操作。

**本章使用场景**：数据库初始化——必须在任何异步操作之前完成。

### `Effect.runPromise(effect)`
**作用**：将 Effect 转换为 Promise 并异步执行。

**本章使用场景**：OAuth 流程中每个步骤的独立执行。

### `Effect.promise(() => promise)`
**作用**：将 Promise 包装为 Effect。支持接收 `AbortSignal` 参数——当 Effect 被中断时，signal 被触发。

**本章使用场景**：文件锁（Flock）、文件系统事件订阅——将外部 Promise API 包装为 Effect。

### `Effect.ignore`
**作用**：忽略 Effect 的结果（成功或失败都转为成功）。

**本章使用场景**：文件锁释放——释放失败不中断主流程。

### `EffectBridge.make()`
**作用**：创建 Effect 桥接器。

**本章使用场景**：文件监听器——在 Effect 上下文中与 Promise 世界交互。

### `makeRuntime(service, layer)`
**作用**：从单个服务+Layer 创建轻量运行时。

**本章使用场景**：版本检查/升级——独立功能不需要全局运行时。

### `Effect.provide(layer)`
**作用**：手动注入 Layer 依赖。

**本章使用场景**：数据库初始化——手动注入 `RuntimeFlags.defaultLayer`。

### `Effect.sync(() => value)`
**作用**：创建同步 Effect（不会失败）。

**本章使用场景**：纯计算或已知不会失败的操作。

## 7.5 本章小结

基础设施层的 Effect 触发以"轻量、独立、同步优先"为特点。`Effect.runSync` 用于必须在启动早期同步完成的初始化，`Effect.runPromise` 用于多步骤的顺序操作（如 OAuth），`Effect.promise` 将外部 Promise API 包装为 Effect，`makeRuntime` 为独立功能创建轻量运行时。这些模式共同构成了 opencode 的"地基"——在应用启动和运行期间，以类型安全的方式处理底层副作用。
