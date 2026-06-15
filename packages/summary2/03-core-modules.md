# OpenCode 核心模块设计文档 — @opencode-ai/core

## 1. 包概览

`@opencode-ai/core`（`packages/core/`）是架构中最基础的核心包，提供数据模型、事件系统、认证服务、AI SDK 集成层和通用工具函数。不依赖于其他 OpenCode 包。

| 模块 | 文件路径 | 职责 |
|------|----------|------|
| Schema 系统 | `src/schema.ts` | Effect Schema 扩展和工具函数 |
| Event 系统 | `src/event.ts` | 基于 PubSub 的事件总线 |
| Auth 服务 | `src/auth.ts` | 账户管理、凭证存储、OAuth 流程 |
| Catalog 服务 | `src/catalog.ts` | npm 包解析和版本管理 |
| AI SDK 集成 | `src/aisdk.ts` | AI SDK 提供商抽象层 |
| Global | `src/global.ts` | 路径和状态管理 |
| Location | `src/location.ts` | 工作区位置跟踪 |
| Flag 系统 | `src/flag/flag.ts` | 特性开关和配置标识 |
| Effect 运行时 | `src/effect/runtime.ts` | Effect Runtime 工厂 |
| 工具函数 | `src/util/` | Identifier、Hash、Flock、Log 等 |

---

## 2. Schema 系统

### 2.1 核心接口

```typescript
// src/schema.ts — withStatics 工具
export const withStatics: <I extends Schema.Schema<any, any, any>>(
  schema: I,
  statics: (self: I) => Record<string, Function>
) => I
```

### 2.2 使用模式

所有的数据模型都使用 `Schema.brand` 创建品牌类型，保证类型安全：

```typescript
// Event ID 品牌类型
export const ID = Schema.String.pipe(
  Schema.brand("Event.ID"),
  withStatics((schema) => ({ create: () => schema.make("evt_" + Identifier.ascending()) })),
)
```

Schema 系统被以下模块广泛使用：
- **Event**: `Payload`, `ID`, `Definition` 类型
- **Auth**: `Account`, `Credential`, `ServiceID` 类型
- **Models**: `ModelID`, `ProviderID` 品牌类型
- **Location**: `Ref` 品牌类型

---

## 3. Event 事件系统

### 3.1 架构设计

Event 系统基于 Effect 的 `PubSub`（发布/订阅原语），支持三种订阅方式：

```
                             Event.Service
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
             typed          sync()           all()
           subscribe      (同步钩子)       (全量流)
               │             │             │
               ▼             ▼             ▼
          PubSub<type>   syncHandler[]   PubSub<all>
```

### 3.2 关键接口

```typescript
// 事件定义
export function define<Type extends string, Fields>(input: {
  readonly type: Type
  readonly version?: number
  readonly aggregate?: string
  readonly schema: Fields
}): Schema<Payload> & Definition

// 服务接口
interface Interface {
  readonly publish: <D>(definition: D, data: Data<D>, options?: PublishOptions) => Effect<Payload<D>>
  readonly publishEvent: <D>(event: Payload<D>) => Effect<Payload<D>>
  readonly subscribe: <D>(definition: D) => Stream<Payload<D>>
  readonly all: () => Stream<Payload>
  readonly sync: (handler: Sync) => Effect<Unsubscribe>
}
```

### 3.3 事件发布 → 订阅完整时序

```
ServiceA              Event.Service               PubSub<typeA>           PubSub<all>         ServiceB(subscriber)
   │                       │                           │                     │                      │
   │                       │                           │                     │        subscribe()     │
   │                       │                           │                     │◀─────────────────────│
   │  define({ type:       │                           │                     │                      │
   │   "session.created"}) │                           │                     │                      │
   │──────────────────────▶│  注册到 registry          │                     │                      │
   │                       │                           │                     │                      │
   │  publish(def, data)   │                           │                     │                      │
   │──────────────────────▶│                           │                     │                      │
   │                       │                           │                     │                      │
   │                       │  遍历 syncHandlers        │                     │                      │
   │                       │  for handler => sync(evt) │                     │                      │
   │                       │                           │                     │                      │
   │                       │  publish(evt)             │                     │                      │
   │                       │──────────────────────────▶│                     │                      │
   │                       │                           │  PubSub 通知        │                      │
   │                       │                           │────────────────────────────────────────────▶│
   │                       │  publish(evt)             │                     │                      │
   │                       │──────────────────────────▶│────────────────────▶│                      │
   │                       │                           │                     │  Stream 推送          │
   │                       │                           │                     │─────────────────────▶│
   │◀── Payload ◀─────────│                           │                     │                      │
```

---

## 4. Auth 认证服务

### 4.1 架构设计

Auth 服务管理多提供商账户和凭证，支持版本迁移：

```
Auth.Service
  │
  ├── accounts: Record<string, Account>
  │     ├── id: AccountID (品牌类型)
  │     ├── serviceID: ServiceID (品牌类型)
  │     └── credential: Credential (API Key / OAuth Token)
  │
  ├── active: Record<ServiceID, AccountID>
  │
  └── version: 2 (当前数据格式版本)
```

### 4.2 关键接口

```typescript
interface Interface {
  readonly get: (accountID: AccountID) => Effect<Account | undefined, AuthError>
  readonly set: (accountID: AccountID, account: Account) => Effect<void, AuthError>
  readonly remove: (accountID: AccountID) => Effect<void, AuthError>
  readonly forService: (serviceID: ServiceID) => Effect<Account[], AuthError>
  readonly list: () => Effect<Account[], AuthError>
  readonly login: (serviceID: ServiceID) => Effect<Account, AuthError>
  readonly logout: (serviceID?: ServiceID) => Effect<void, AuthError>
}
```

### 4.3 认证获取 → 刷新时序

```
Service              Auth.Service            Storage (Config)           Provider API
  │                       │                       │                        │
  │  Auth.forService()    │                       │                        │
  │──────────────────────▶│                       │                        │
  │                       │  读取凭证数据          │                        │
  │                       │──────────────────────▶│                        │
  │                       │◀── credential ◀───────│                        │
  │                       │                       │                        │
  │                       │  校验是否过期          │                        │
  │                       │  (token expired?)     │                        │
  │                       │         │             │                        │
  │                       │    ┌────┴────┐        │                        │
  │                       │    │ 过期     │不过期   │                        │
  │                       │    └────┬────┘        │                        │
  │                       │         │             │                        │
  │                       │  刷新 token           │                        │
  │                       │  login()              │                        │
  │                       │──────────────────────────────────────────────▶│
  │                       │                       │                        │
  │                       │◀── new token ◀────────│◀── OAuth / API Key ───│
  │                       │                       │                        │
  │                       │  更新存储              │                        │
  │                       │──────────────────────▶│                        │
  │                       │                       │                        │
  │◀── Account[] ◀───────│                       │                        │
```

---

## 5. AI SDK 集成层

### 5.1 架构设计

`aisdk.ts` 层包装 Vercel AI SDK 的 `@ai-sdk/*` 提供商包，提供统一的 `streamText` 接口：

```
                    上层调用 (opencode/session/llm.ts)
                              │
                              ▼
                     @opencode-ai/core/aisdk.ts
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
            createXxx()          streamText()
          (提供商初始化)          (流式文本生成)
                    │                   │
                    ▼                   ▼
         @ai-sdk/anthropic      @ai-sdk/openai
         @ai-sdk/google         @ai-sdk/mistral
         @ai-sdk/... (20+)      @ai-sdk/... (20+)
                    │                   │
                    ▼                   ▼
            Anthropic API        OpenAI API
            Google API           Mistral API
```

### 5.2 提供商初始化调用链

```
LLM.Service            aisdk.ts              @ai-sdk/provider          Provider HTTP API
  │                       │                       │                        │
  │  streamText(model,    │                       │                        │
  │   messages, tools)    │                       │                        │
  │──────────────────────▶│                       │                        │
  │                       │  根据 model 选择提供商   │                        │
  │                       │  resolve(modelId)     │                        │
  │                       │         │             │                        │
  │                       │    ┌────┴────┐        │                        │
  │                       │    │anthropic │openai  │                        │
  │                       │    │ google   │...     │                        │
  │                       │    └────┬────┘        │                        │
  │                       │         │             │                        │
  │                       │  createAnthropic()    │                        │
  │                       │  createOpenAI() ...   │                        │
  │                       │         │             │                        │
  │                       │  LanguageModelV1      │                        │
  │                       │         │             │                        │
  │                       │  streamText({         │                        │
  │                       │    model,             │───────────── HTTP ────▶│
  │                       │    messages,          │                        │
  │                       │    tools,             │                        │
  │                       │    maxSteps,          │                        │
  │                       │    ...                │◀──── SSE Stream ──────│
  │                       │  })                   │                        │
  │                       │         │             │                        │
  │                       │  textDelta events     │                        │
  │                       │  toolCall events      │                        │
  │                       │  finish event         │                        │
  │◀── Stream ◀──────────│                       │                        │
```

---

## 6. Effect 运行时

### 6.1 makeRuntime

`makeRuntime`（`src/effect/runtime.ts`）是所有服务层的 Effect Runtime 工厂：

```typescript
export function makeRuntime(options?: {
  readonly memoMap?: <R>(self: Layer.Layer<never, never, R>) => R
  readonly hooks?: ...
}): {
  runPromise: <E, A>(effect: Effect<A, E>) => Promise<A>
  runFork: <E, A>(effect: Effect<A, E>) => Fiber<A, E>
  runCallback: <E, A>(effect: Effect<A, E>, onExit: (exit: Exit<A, E>) => void) => void
  memoMap: ...
}
```

### 6.2 运行时初始化流

```
Application          makeRuntime               Layer Pipeline          Effect Runtime (Fiber)
  │                      │                          │                        │
  │ makeRuntime()        │                          │                        │
  │─────────────────────▶│                          │                        │
  │                      │ 创建 memoMap              │                        │
  │                      │ (Layer 去重缓存)          │                        │
  │                      │                          │                        │
  │                      │ 创建 Runtime             │                        │
  │                      │ (Fiber 管理 + 调度)      │                        │
  │                      │                          │                        │
  │                      │ 创建三层 run 方法         │                        │
  │                      │ - runPromise (Promise)   │                        │
  │                      │ - runFork   (Fiber)      │                        │
  │                      │ - runCallback (Callback)  │                        │
  │                      │                          │                        │
  │◀── { runPromise,     │                          │                        │
  │      runFork,        │                          │                        │
  │      runCallback }  ─│                          │                        │
  │                      │                          │                        │
  │  runFork(effect)     │                          │                        │
  │─────────────────────▶│                          │                        │
  │                      │  memoMap.get(layer)      │                        │
  │                      │  (去重初始化)             │                        │
  │                      │─────────────────────────▶│                        │
  │                      │                          │  Layer.build()         │
  │                      │                          │───────────────────────▶│
  │                      │                          │                        │  Service.init()
  │                      │                          │                        │  Effect.gen ...
  │                      │                          │◀── Fiber ◀────────────│
  │                      │◀── Service ◀────────────│                        │
  │◀── Fiber ◀──────────│                          │                        │
```

---

## 7. 工具函数模块

| 模块 | 文件 | 关键类型/函数 |
|------|------|---------------|
| Identifier | `src/util/identifier.ts` | `Identifier.ascending()` — ULID 风格唯一 ID |
| Hash | `src/util/hash.ts` | 内容哈希函数 |
| Flock | `src/util/flock.ts` | `Flock.withLock()` — 文件级别互斥锁 |
| Log | `src/util/log.ts` | 结构化日志工具 |
| Filesystem | (core 外部使用) | 异步文件操作 |

---

## 8. 模块文件清单

| 文件 | 导出 | 说明 |
|------|------|------|
| `src/aisdk.ts` | `streamText`, `createXxx` | AI SDK 提供商包装 |
| `src/auth.ts` | `Auth.Service`, `Interface`, `layer` | 认证服务 |
| `src/catalog.ts` | `Catalog.Service`, `Interface`, `layer` | 包目录服务 |
| `src/event.ts` | `EventV2.Service`, `define()`, `layer` | 事件系统 |
| `src/global.ts` | `Global.Path` | 全局路径 |
| `src/location.ts` | `Location.Ref` | 位置跟踪 |
| `src/schema.ts` | `withStatics` | Schema 工具 |
| `src/flag/flag.ts` | `Flag.*` | 特性开关 |
| `src/effect/runtime.ts` | `makeRuntime` | Runtime 工厂 |
| `src/util/identifier.ts` | `Identifier` | ID 生成 |
| `src/util/hash.ts` | `Hash` | 哈希工具 |
| `src/util/flock.ts` | `Flock` | 文件锁 |