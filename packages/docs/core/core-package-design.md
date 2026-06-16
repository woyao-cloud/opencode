# @opencode-ai/core 包设计文档

## 1. 包概述

### 1.1 这个包解决什么问题

`@opencode-ai/core`（`packages/core/`）是 OpenCode 架构的**地基**。它不依赖同仓库中任何其他包，所有上层模块（opencode 服务层、app 应用层、console 前端层）都建立在它之上。

它的核心职责可以用三句话概括：

1. **提供共享数据类型**——整个系统使用的 Model、Provider、Session 等 Schema 定义都在这里，保证类型安全
2. **提供基础设施服务**——事件总线、认证管理、文件系统抽象、Effect 运行时，这些是所有上层模块都要用的公共服务
3. **提供 AI SDK 集成桥梁**——连接 20+ AI 提供商 SDK 和上层的 LLM 调用层

```
┌──────────────────────────────────────────────────────────────────┐
│ 上层模块: opencode / app / console / desktop                     │
│                                                                  │
│  它们依赖 core 的:  Schema · Auth · Event · FileSystem · Log    │
└──────────────────────────┬───────────────────────────────────────┘
                           │ Layer.provide
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  @opencode-ai/core                                               │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │  服务模块   │  │  数据模型   │  │ 基础设施    │  │  工具函数  │  │
│  │            │  │            │  │            │  │           │  │
│  │ EventV2    │  │ ModelV2    │  │ Global(路径)│  │ Identifier│  │
│  │ AuthV2     │  │ ProviderV2 │  │ FileSystem  │  │ Flock     │  │
│  │ Catalog    │  │ SessionV2  │  │ Flag        │  │ Log       │  │
│  │ AISDK      │  │ MessageV2  │  │ Location    │  │ Hash/Glob │  │
│  │ PluginV2   │  │ ...        │  │ Effect      │  │ Retry     │  │
│  └────────────┘  └────────────┘  └────────────┘  └───────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计思想

core 包贯穿始终的设计原则：

| 原则 | 体现 | 为什么 |
|------|------|--------|
| **类型安全优先** | 所有数据用 Effect Schema 定义，用 `Schema.brand` 做品牌类型 | 编译阶段就捕获 API Key 和 SessionID 混用的错误 |
| **Effect 驱动** | 所有服务用 `Context.Service` + `Layer` 注册 | 依赖显式、可替换、可测试 |
| **可观测性** | 每个 Effect 用 `Effect.fn("Name")` 命名 | 方便 OpenTelemetry 追踪和调试 |
| **线程安全** | Auth 用 `SynchronizedRef`，文件操作用 `Flock` | 多进程/多纤程环境数据不损坏 |

---

## 2. 模块清单与设计动机

> 本节逐一介绍每个模块的定位和设计动机。可以把它看作一张"地图"——阅读时先了解每个模块存在的理由，后续章节会有深入展开。

### 2.1 服务类模块

这些模块提供有状态的服务，通过 Effect `Layer` 注入到系统中：

#### EventV2 (`src/event.ts`)
- **设计动机**：系统各部分需要解耦通信。当用户创建会话时，可能有 3 个模块需要知道这个事件（同步到云端、更新 UI、写审计日志）。如果用直接函数调用，新增一个消费者就要改发布者的代码。EventV2 让发布者和消费者完全解耦。
- **与同类对比**：不同于 Node.js `EventEmitter`（单进程、无类型），EventV2 是类型安全的、支持按类型订阅的 Stream，天然与 Effect 的并发模型集成。

#### AuthV2 (`src/auth.ts`)
- **设计动机**：用户可能有多个 AI 提供商账户（比如同时使用 Anthropic 和 OpenAI），每个提供商可能有多个账户（个人 API Key 和公司 OAuth）。AuthV2 管理这些账户的凭证，并提供版本迁移（v1 到 v2 格式）。
- **典型场景**：用户执行 `opencode providers add anthropic --api-key sk-xxx` → 调用 `AuthV2.create()` → 写入 `auth-v2.json` → 后续 LLM 调用时通过 `AuthV2.active("anthropic")` 获取凭证。

#### Catalog (`src/catalog.ts`)
- **设计动机**：20+ AI 提供商各有不同的模型（Claude Sonnet、GPT-4o、Gemini 2.5……）。需要统一管理这些模型的可获取性和配置。Catalog 还支持插件动态注册新模型（如 GitHub Copilot 模型）。
- **关键概念**：`available()` vs `all()`——`all` 包括不可用的模型（提供商离线），`available` 只返回当前可用的。

#### AISDK (`src/aisdk.ts`)
- **设计动机**：Vercel AI SDK 的 `@ai-sdk/*` 包为每个提供商提供了独立的初始化函数。AISDK 统一了获取 `LanguageModelV3` 实例的过程，加上缓存（避免重复初始化）、SSE 超时保护（防止流卡死）、自定义 fetch（支持 provider-level timeout）。
- **性能说明**：创建 AI SDK 实例涉及动态 `import()`，每次需要 50-200ms。缓存确保同一个模型只初始化一次。

#### PluginV2 (`src/plugin.ts`)
- **设计动机**：系统功能需要可扩展。外部插件需要能注册新模型、修改 LLM 请求参数、添加自定义事件处理器。PluginV2 提供了 `trigger()` 钩子系统，让插件在不修改核心代码的情况下改变行为。

### 2.2 数据模型类模块

这些模块定义 Effect Schema 类型，不包含业务逻辑：

| 文件 | 定义的类型 | 设计动机（什么时候用到） |
|------|-----------|------------------------|
| `model.ts` | `ModelV2.Info`, `ModelV2.ID`, `ModelV2.Capabilities` | 需要序列化/反序列化模型配置时。品牌类型 `ModelV2.ID` 防止把 ProviderID 当 ModelID 用 |
| `provider.ts` | `ProviderV2.Info`, `ProviderV2.ID` | 需要存储/传输提供商信息时 |
| `session.ts` | `SessionV2` | 会话的 HTTP API 请求/响应 Schema，用于 SDK 和服务端接口 |
| `session-message.ts` | `MessageV2` | 消息的 Schema 定义 |
| `session-prompt.ts` | Prompt 请求/响应 | `/v2/sessions/:id/prompt` API 的 Schema |
| `session-event.ts` | 会话生命周期事件 | 定义 `SessionEvent.Created`、`SessionEvent.Text.Started` 等事件类型 |
| `tool-output.ts` | 工具输出 | 工具执行结果的 Schema |
| `v2-schema.ts` | 通用类型 | v2 API 共享类型 |

### 2.3 基础设施类模块

| 文件 | 设计动机 | 典型使用场景 |
|------|----------|-------------|
| `global.ts` | 统一管理所有数据目录，避免各模块各自计算路径 | 任何需要读/写文件的模块都通过 `Global.Path.data` 获取基础目录 |
| `filesystem.ts` | 封装 Effect `FileSystem`，增加 JSON 读写、向上查找等高频操作 | 读写配置文件、存储数据、搜索文件 |
| `flag.ts` | 环境变量驱动的特性开关 | 开发调试时禁用插件、覆盖配置路径 |
| `location.ts` | 标记事件产生的位置上下文 | 事件系统中标注事件发生在哪个目录 |
| `effect/runtime.ts` | 提供 Effect Runtime 工厂 | 上层应用的 `main()` 入口创建 Runtime |
| `effect/memo-map.ts` | 避免 Layer 重复初始化 | 多个服务共享同一个 Database Layer |

### 2.4 工具函数类模块

| 文件 | 设计动机 | 类比 |
|------|----------|------|
| `identifier.ts` | 生成全局唯一的、按时间排序的 ID | 类似 ULID，但更轻量 |
| `flock.ts` | 跨进程文件操作互斥 | 类似 Linux `flock` 系统调用 |
| `hash.ts` | 内容哈希用于文件指纹 | 类似 `sha256sum` |
| `log.ts` | 结构化日志，支持标签和耗时追踪 | 类似 `pino`，但更简单 |
| `glob.ts` | 文件模式匹配 | 类似 `fast-glob` |
| `retry.ts` | 指数退避重试策略 | 类似 `promise-retry` |

---

## 3. EventV2 — 事件总线 (`src/event.ts`)

### 3.1 为什么需要这个模块

假设用户输入一条消息，系统需要：

1. 保存到数据库
2. 推送到 Web UI
3. 同步到企业审计日志
4. 更新会话状态

如果用直接函数调用：

```typescript
// 坏味道 —— 每新增一个接收者都要改这里
function onUserMessage(msg) {
  await db.save(msg)
  await websocket.push(msg)
  await audit.log(msg)
  await session.updateStatus(msg)
}
```

用 EventV2，发布者只负责发布，不关心谁在听：

```typescript
// 发布者只做一件事
yield* EventV2.Service.publish(MessageReceived, msg)

// 消费者各自注册，互不干扰
yield* EventV2.Service.subscribe(MessageReceived).pipe(
  Stream.tap(db.save),
  Stream.runDrain  // fork 到独立 Fiber
)

yield* EventV2.Service.subscribe(MessageReceived).pipe(
  Stream.tap(websocket.push),
  Stream.runDrain
)
```

### 3.2 三种订阅模式的选择

EventV2 提供三种订阅方式，适用不同场景：

| 模式 | 方法 | 特征 | 什么时候用 |
|------|------|------|-----------|
| **按类型订阅** | `subscribe(definition)` | 只接收特定事件类型的 Stream | 大多数情况。比如只关心 `session.created` 事件 |
| **全量流** | `all()` | 接收所有事件的 Stream | 审计日志、全量同步、调试观察 |
| **同步钩子** | `sync(handler)` | 发布者在同一 Effect 中同步执行 | 需要在发布完成前确保某些操作执行（如写审计日志后才允许返回） |

**sync vs subscribe 的决策指南：**

```
事件发布
    │
    ├── sync handlers ── 同步执行 ── 发布者等待完成
    │     用途: "发布前必须完成" 的操作
    │     示例: 审计日志（必须在响应返回前写入）
    │     缺点: 阻塞发布者
    │
    └── typed subscribe ── 异步 Stream ── 发布者不等待
          用途: "发布后处理即可" 的操作
          示例: WebSocket 推送、UI 更新
          优点: 不阻塞主流程
```

### 3.3 完整使用模式

**步骤 1：定义事件类型**

```typescript
// event-definitions.ts（通常在业务模块中定义）
import { EventV2 } from "@opencode-ai/core/event"

// define() 返回一个既是 Schema 又是 Definition 的对象
export const SessionCreated = EventV2.define({
  type: "session.created",
  version: 1,                    // 可选的版本号，用于消费者做向前兼容
  aggregate: "session",          // 可选的聚合标识，方便按聚合查询
  schema: {
    sessionID: Schema.String,
    title: Schema.String,
    createdBy: Schema.String,
  },
})
```

**步骤 2：发布事件**

```typescript
// 在 session 创建成功后发布
yield* EventV2.Service.publish(SessionCreated, {
  sessionID: "ses_01JQXR...",
  title: "Fix login bug",
  createdBy: "user_abc",
}, {
  metadata: { source: "cli" },  // 附加元数据
})
```

**步骤 3：订阅事件**

```typescript
// 方式 A：按类型订阅（推荐）
yield* EventV2.Service.subscribe(SessionCreated).pipe(
  Stream.tap((event) => Effect.log(`New session: ${event.data.title}`)),
  Stream.runDrain,                // 消费流
)

// 方式 B：全量流（所有事件）
yield* EventV2.Service.all().pipe(
  Stream.filter((event) => event.type.startsWith("session.")),
  Stream.tap((event) => auditLog.write(event)),
  Stream.runDrain,
)

// 方式 C：同步钩子（发布者等待完成）
yield* EventV2.Service.sync((event) =>
  Effect.gen(function* () {
    yield* auditLog.write(event)  // 在响应返回前必须写入审计
  })
)
```

### 3.4 发布→投递完整时序

```
ServiceA              EventV2.Service              PubSub<session.created>     PubSub<all>          ServiceB (subscriber)
  │                        │                              │                       │                       │
  │  define({ type:        │                              │                       │                       │
  │   "session.created" }) │                              │                       │                       │
  │───────────────────────▶│  注册到 registry              │                       │                       │
  │                        │                              │                       │                       │
  │  subscribe(            │                              │                       │                       │
  │   SessionCreated)      │                              │                       │                       │
  │───────────────────────▶│                              │                       │                       │
  │                        │  getOrCreate("session.       │                       │                       │
  │                        │   created")                  │                       │                       │
  │                        │  → 如果不存在则新建 PubSub   │                       │                       │
  │                        │────────────────────────────▶│                       │                       │
  │                        │◀── PubSub ◀────────────────│                       │                       │
  │                        │                              │                       │                       │
  │                        │  Stream.fromPubSub(pubsub)    │                       │                       │
  │                        │  → 返回 Stream<Payload>      │                       │                       │
  │                        │──────────────────────────────────────────────────────────────────────────▶│
  │                        │                              │                       │                       │
  │  publish(              │                              │                       │                       │
  │   SessionCreated,      │                              │                       │                       │
  │   { sessionID,         │                              │                       │                       │
  │     title,             │                              │                       │                       │
  │     createdBy })       │                              │                       │                       │
  │───────────────────────▶│                              │                       │                       │
  │                        │                              │                       │                       │
  │                        │  ① 遍历 syncHandlers         │                       │                       │
  │                        │  for (handler of             │                       │                       │
  │                        │   syncHandlers) {            │                       │                       │
  │                        │    yield* handler(event)     │                       │                       │
  │                        │  }                           │                       │                       │
  │                        │  (同步执行，所有 handler       │                       │                       │
  │                        │   完成才继续)                 │                       │                       │
  │                        │                              │                       │                       │
  │                        │  ② PubSub.publish(typed)     │                       │                       │
  │                        │────────────────────────────▶│                       │                       │
  │                        │                              │  ③ Stream 推送到      │                       │
  │                        │                              │     subscriber        │                       │
  │                        │                              │──────────────────────────────────────────────▶│
  │                        │                              │                       │                       │
  │                        │  ④ PubSub.publish(all)       │                       │                       │
  │                        │────────────────────────────▶│──────────────────────▶│                       │
  │                        │                              │                       │  ⑤ 全量流也收到      │
  │                        │                              │                       │─────────────────────▶│
  │                        │                              │                       │                       │
  │◀── Payload ◀──────────│                              │                       │                       │
  │  (发布完成)            │                              │                       │                       │
```

### 3.5 错误处理

事件发布是 Effect，所以错误处理遵循 Effect 模式：

```typescript
// 如果 sync handler 中某个失败，
// publish 会返回第一个失败的错误
yield* EventV2.Service.publish(MyEvent, data).pipe(
  Effect.catchTags({
    // 处理特定错误
  })
)

// 如果不需要等待 sync handler 完成，可以 fork
yield* Effect.forkIn(scope)(
  EventV2.Service.publish(MyEvent, data)
)
```

---

## 4. AuthV2 — 认证管理 (`src/auth.ts`)

### 4.1 为什么需要这个模块

用户可能：

- 同时使用 Anthropic 和 OpenAI 两个提供商
- 每个提供商有多个账户（个人 API Key + 公司 OAuth）
- API Key 会过期需要轮换
- OAuth token 需要定期刷新

AuthV2 就是解决这些问题的——一个结构化的多账户凭证管理服务。

### 4.2 数据模型

```
AuthV2 的数据结构（JSON 文件格式）：
{
  "version": 2,
  "accounts": {
    "acc_01JQXR...": {
      "id": "acc_01JQXR...",
      "serviceID": "anthropic",     ← 品牌类型 ServiceID
      "description": "personal",
      "credential": {
        "type": "api",              ← 联合类型，按 type 区分
        "key": "sk-ant-..."
      }
    },
    "acc_01JQYS...": {
      "id": "acc_01JQYS...",
      "serviceID": "openai",
      "description": "work account",
      "credential": {
        "type": "oauth",
        "refresh": "r1_xxx...",
        "access": "a1_yyy...",
        "expires": 1712345678
      }
    }
  },
  "active": {
    "anthropic": "acc_01JQXR...",   ← 每个提供商的活动账户
    "openai": "acc_01JQYS..."
  }
}
```

**为什么用品牌类型？**

```typescript
// 如果不用品牌类型，这两个函数调用不会报错：
function getModel(id: ModelID) { ... }
function getAccount(id: AccountID) { ... }

getModel("acc_xxx")  // 编译器不会发现错误

// 用了品牌类型：
getModel("acc_xxx")  // ❌ 编译错误！ModelID 不能赋值给字符串
getModel(modelID)    // ✅ AccountID 是品牌 String，不能赋值给 ModelID
```

### 4.3 完整使用场景

**场景：用户添加 Anthropic API Key**

```bash
# CLI 命令
opencode providers add anthropic --api-key sk-ant-xxx
```

**背后的代码流程：**

```typescript
// providers 命令处理函数
const account = yield* AuthV2.Service.create({
  serviceID: ServiceID.make("anthropic"),     // 品牌类型化
  credential: new ApiKeyCredential({
    type: "api",
    key: "sk-ant-xxx",
  }),
  description: "personal",
  active: true,                                // 设为提供商的活动账户
})
```

**场景：LLM 调用时获取凭证**

```typescript
// session/llm.ts 中获取提供商凭证
const credential = yield* AuthV2.Service.active(ServiceID.make("anthropic"))

// credential 可能是：
// - ApiKeyCredential: { type: "api", key: "sk-..." }
// - OAuthCredential: { type: "oauth", access: "...", expires: ... }

// 根据类型决定认证方式
if (credential.credential.type === "api") {
  // 使用 API Key
} else {
  // 检查 OAuth 是否过期，过期则刷新
}
```

**场景：切换账户**

```typescript
// 如果用户有多个 OpenAI 账户，可以切换
yield* AuthV2.Service.activate(anotherAccountID)

// 此后 active("openai") 返回新账户
```

### 4.4 认证操作时序

```
Service(CLI/provider)     AuthV2.Service               auth-v2.json (磁盘)       

  create(anthropic, key)
  │
  │  ① SynchronizedRef.modifyEffect(state)
  │    → 生成新的 AccountID ("acc_" + ULID)
  │    → 创建 Account 对象
  │    → 更新 active 映射
  │
  │  ② yield* write(next)
  │     → JSON.stringify + fs.writeFile(0o600)
  │─────────────────────────────────────────────▶
  │                                               写入 { version, accounts, active }
  │◀────────────────── ok ───────────────────────
  │
  │ ③ 返回 Account
  │◀── Account ─────
  │
  │
  active("anthropic")
  │
  │  ① SynchronizedRef.get(state)
  │    → data.active["anthropic"] → "acc_xxx"
  │    → data.accounts["acc_xxx"] → Account
  │
  │◀── Account ─────
  │
  │
  update(accID, { credential: newKey })
  │
  │  ① SynchronizedRef.modifyEffect(state)
  │    → 不可变更新: 克隆 → 替换 credential
  │    → write(next) 持久化
  │─────────────────────────────────────────────▶
  │                                               覆写文件
  │◀────────────────── ok ───────────────────────
  │
  │
  remove(accID)
  │
  │  ① SynchronizedRef.modifyEffect(state)
  │    → 删除 accounts[accID]
  │    → 如果它是 active，也删除 active 映射
  │    → write(next)
  │─────────────────────────────────────────────▶
  │◀────────────────── ok ───────────────────────
```

### 4.5 版本迁移

AuthV2 支持从旧格式（v1）自动迁移。v1 格式是简单的键值对：

```typescript
// v1 格式（旧版本遗留数据）
{
  "anthropic": { "type": "api", "key": "sk-ant-xxx" },
  "openai": { "type": "api", "key": "sk-proj-yyy" }
}

// v2 格式（当前版本）
{
  "version": 2,
  "accounts": {
    "acc_xxx": {
      "id": "acc_xxx",
      "serviceID": "anthropic",
      "description": "default",
      "credential": { "type": "api", "key": "sk-ant-xxx" }
    },
    ...
  },
  "active": { "anthropic": "acc_xxx", "openai": "acc_yyy" }
}
```

加载流程自动检测版本：

```typescript
const load = Effect.fnUntraced(function* () {
  // 1. 优先读环境变量（用于 CI/CD 注入）
  if (process.env.OPENCODE_AUTH_CONTENT) {
    return parseAndMigrate(process.env.OPENCODE_AUTH_CONTENT)
  }

  // 2. 尝试读旧版文件 auth.json（v1 格式）
  const legacy = yield* fsys.readJson("auth.json")
  if (legacy) return migrate(legacy)  // v1 → v2

  // 3. 尝试读新版文件 auth-v2.json
  const raw = yield* fsys.readJson("auth-v2.json")
  if (raw) return checkVersion(raw)

  // 4. 都不存在 → 返回空数据
  return { version: 2, accounts: {}, active: {} }
})
```

---

## 5. AISDK — AI SDK 集成 (`src/aisdk.ts`)

### 5.1 为什么需要这个模块

OpenCode 支持 20+ AI 提供商（Anthropic、OpenAI、Google……）。每个提供商的 SDK 初始化方式和调用接口都不同。直接在上层 LLM 服务中做这些适配会导致：

- 每次 LLM 调用都要重复 import SDK + 初始化
- 没有统一的超时和重试机制
- 新增提供商需要修改多个文件

AISDK 层把这些问题都封装了：

```
open code/session/llm.ts
        │
        │  AISDK.language(modelInfo)
        ▼
packages/core/src/aisdk.ts
        │
        ├── 缓存: 相同(model, provider, variant) 只初始化一次
        ├── 超时: SSE chunk-level timeout 防止流卡死
        ├── 自定义 fetch: 支持 provider-level timeout
        └── 插件钩子: 允许外部插件覆盖 SDK 行为
        │
        ▼
@ai-sdk/anthropic / @ai-sdk/openai / @ai-sdk/google / ...
```

### 5.2 LanguageModel 获取流程

```typescript
// 上层调用方
const language = yield* AISDK.Service.language(model)

// 内部实现（简化）
language: Effect.fn("AISDK.language")(function* (model) {
  const key = `${model.providerID}/${model.id}/${model.options.variant}`

  // 1. 缓存命中 → 直接返回
  const existing = languages.get(key)
  if (existing) return existing

  // 2. 准备选项（timeout、baseURL、fetch 包装）
  const options = prepareOptions(model, model.endpoint.package)

  // 3. 通过插件获取 SDK 实例
  const sdk = yield* plugin.trigger("aisdk.sdk", { model, options })

  // 4. 通过插件获取 LanguageModel
  const language = yield* plugin.trigger("aisdk.language", { model, sdk, options })

  // 5. 缓存并返回
  languages.set(key, language)
  return language
})
```

### 5.3 LanguageModel 获取时序

```
LLM.Service            AISDK.Service               PluginV2                 @ai-sdk/anthropic
(session/llm.ts)       (core/aisdk.ts)             (core/plugin.ts)          (外部包)
     │                      │                          │                        │
     │ AISDK.language(      │                          │                        │
     │  { providerID:       │                          │                        │
     │    "anthropic",      │                          │                        │
     │    id: "claude-      │                          │                        │
     │    sonnet-4",        │                          │                        │
     │    variant: "default"│                          │                        │
     │  })                  │                          │                        │
     │────────────────────▶│                          │                        │
     │                      │                          │                        │
     │                      │  ① 计算 key:             │                        │
     │                      │  "anthropic/claude-      │                        │
     │                      │   sonnet-4/default"     │                        │
     │                      │                          │                        │
     │                      │  ② languages.get(key)    │                        │
     │                      │  → miss（首次调用）      │                        │
     │                      │                          │                        │
     │                      │  ③ prepareOptions(model, │                        │
     │                      │    "@ai-sdk/anthropic") │                        │
     │                      │    → 设置 baseURL        │                        │
     │                      │    → 包装 fetch（加 timeout）│                       │
     │                      │    → 返回 options         │                        │
     │                      │                          │                        │
     │                      │  ④ plugin.trigger(       │                        │
     │                      │    "aisdk.sdk",          │                        │
     │                      │    { model, options })   │                        │
     │                      │────────────────────────▶│                        │
     │                      │                          │  import("@ai-sdk/     │
     │                      │                          │    anthropic")        │
     │                      │                          │  → createAnthropic(   │
     │                      │                          │      options)         │
     │                      │                          │  → SDK 实例           │
     │                      │◀── { sdk } ◀───────────│                        │
     │                      │                          │                        │
     │                      │  ⑤ plugin.trigger(       │                        │
     │                      │    "aisdk.language",     │                        │
     │                      │    { model, sdk,         │                        │
     │                      │      options })          │                        │
     │                      │────────────────────────▶│                        │
     │                      │                          │  sdk.languageModel(   │
     │                      │                          │    model.apiID)       │
     │                      │                          │  → claude-sonnet-4    │
     │                      │                          │────────────────────▶│  创建 LanguageModelV3
     │                      │                          │◀── LanguageModelV3 ─│
     │                      │◀── { language } ◀───────│                        │
     │                      │                          │                        │
     │                      │  ⑥ languages.set(key,    │                        │
     │                      │     language)            │                        │
     │                      │  (缓存，下次直接返回)     │                        │
     │                      │                          │                        │
     │◀── LanguageModelV3 ─│                          │                        │
     │                      │                          │                        │
     │  ▲ 第二次调用同一     │                          │                        │
     │  ▲ 模型：            │                          │                        │
     │  AISDK.language(     │                          │                        │
     │   same model)        │                          │                        │
     │────────────────────▶│                          │                        │
     │                      │  languages.get(key)      │                        │
     │                      │  → HIT! 直接返回          │                        │
     │◀── (cached) ────────│  (跳过 ③④⑤⑥)            │                        │
```

### 5.4 SSE 超时保护（解决什么实际问题）

AI 提供商的 SSE 流可能因为网络抖动或服务端异常而卡住——API 连接建立后，中间的某个 chunk 迟迟不发。默认 fetch 没有 chunk-level timeout，只能等到整个请求超时（可能几分钟）。

AISDK 的 `wrapSSE` 解决了这个问题：

```typescript
function wrapSSE(res: Response, ms: number, ctl: AbortController) {
  // 只对 SSE 响应生效
  if (!res.headers.get("content-type")?.includes("text/event-stream")) return res

  const reader = res.body.getReader()

  // 返回一个新 Response，对每个 read() 设置 ms 超时
  return new Response(new ReadableStream({
    async pull(ctrl) {
      const chunk = await Promise.race([
        reader.read(),
        timeout(ms).then(() => { throw new Error("SSE chunk timeout") })
      ])
      // ... 正常推流
    }
  }), res)
}
```

这样如果某个 chunk 超过 `chunkTimeout` 毫秒没有到达，连接会被及时关闭并触发重试，而不是无限等待。

---

## 6. Catalog — 提供商/模型目录 (`src/catalog.ts`)

### 6.1 为什么需要这个模块

Catalog 管理"现在有哪些可用的 AI 模型"这个信息。它解决的问题：

- **注册**：各提供商插件把它们的模型注册到 Catalog
- **查询**：上层代码需要查找模型、获取模型配置
- **变更**：模型可用性会变化（插件加载/卸载、提供商上线/下线）
- **默认值**：需要一个默认模型和一键使用的"小模型"

### 6.2 核心概念

```typescript
ProviderRecord = {
  provider: ProviderV2.Info,                // 提供商元数据
  models: HashMap<ModelV2.ID, ModelV2.Info> // 该提供商的模型列表
}
```

**`available()` vs `all()` 的区别：**

| 方法 | 返回 | 什么时候用 |
|------|------|-----------|
| `all()` | 注册的所有模型 | 显示模型列表配置页，无论是否可用 |
| `available()` | 当前可用的模型 | 运行时的模型选择器，排除离线提供商 |

**`default` vs `small` 的区别：**

| 方法 | 返回 | 什么时候用 |
|------|------|-----------|
| `default()` | 用户设置的默认模型 | 用户没指定模型时的回退 |
| `small(provider)` | 该提供商下的轻量模型 | 会话摘要、快速任务等不需要大模型的场景 |

### 6.3 端到端使用场景

**场景：用户打开模型选择器**

```typescript
// 模型选择器获取可用模型列表
const models = yield* Catalog.Service.model.available()

// models 返回: [
//   ModelV2.Info { providerID: "anthropic", id: "claude-sonnet-4", ... },
//   ModelV2.Info { providerID: "openai", id: "gpt-4o", ... },
//   ModelV2.Info { providerID: "openai", id: "gpt-4o-mini", small: true },
//   ...
// ]

// 找到默认模型
const defaultModel = yield* Catalog.Service.model.default()

// 找到"小模型"用于不重要的任务
const small = yield* Catalog.Service.model.small("anthropic")
// → Option<ModelV2.Info>（可能是 claude-haiku）
```

**场景：插件注册新模型**

```typescript
// GitHub Copilot 插件的注册逻辑
// 通过 PluginV2 的 "catalog.models" 钩子注入
{
  trigger: "catalog.models",
  handler: () => [
    {
      providerID: "github-copilot",
      id: "copilot-gpt-4",
      // ... 模型配置
    }
  ]
}
```

### 6.4 模型解析时序

```
Service           Catalog.Service               PluginV2                Provider Registration
  │                    │                            │                        │
  │ model.available()  │                            │                        │
  │───────────────────▶│                            │                        │
  │                    │  遍历内部 records           │                        │
  │                    │  (已注册的提供商)            │                        │
  │                    │                            │                        │
  │                    │  PluginV2.trigger(          │                        │
  │                    │   "catalog.models")         │                        │
  │                    │───────────────────────────▶│                        │
  │                    │                            │                        │
  │                    │                            │  各插件返回自己的模型    │
  │                    │                            │  GitHub Copilot 插件   │
  │                    │                            │  → [{ providerID:     │
  │                    │                            │      "github-copilot", │
  │                    │                            │      ... }]           │
  │                    │                            │                        │
  │                    │                            │  Cloudflare 插件       │
  │                    │                            │  → [{ providerID:     │
  │                    │                            │      "cf", ... }]     │
  │                    │                            │                        │
  │                    │◀── models[] ◀─────────────│                        │
  │                    │                            │                        │
  │                    │  合并 + 去重 + 过滤可用     │                        │
  │                    │                            │                        │
  │◀── ModelV2.Info[] │                            │                        │
```

---

## 7. 基础设施模块

### 7.1 Global — 全局路径 (`src/global.ts`)

#### 为什么需要

应用需要决定"配置文件放哪里"、"日志文件放哪里"、"缓存数据放哪里"。如果每个模块各自决定路径，迁移和调试都会很麻烦。Global 模块遵循 XDG Base Directory 规范，集中管理所有路径。

#### 路径一览

```typescript
// XDG 基础路径（Linux/macOS 示例）
export const Path = {
  home:  process.env.HOME,                          // /home/user
  data:  "~/.local/share/opencode",                  // DB、日志、仓库
  config: "~/.config/opencode",                      // opencode.json
  cache: "~/.cache/opencode",                        // 缓存、二进制文件
  state: "~/.local/state/opencode",                  // 运行时状态
  log:   "~/.local/share/opencode/log",              // 日志文件
  tmp:   "/tmp/opencode",                            // 临时文件
  bin:   "~/.cache/opencode/bin",                    // 可执行文件
  repos: "~/.local/share/opencode/repos",            // Git 仓库
}
```

```typescript
// Windows 示例
// data:  C:\Users\xxx\AppData\Local\opencode
// config: C:\Users\xxx\AppData\Roaming\opencode
// cache: C:\Users\xxx\AppData\Local\opencode\cache
```

#### 模块加载时自动创建

```typescript
// 在模块顶层执行，import 时自动运行
await Promise.all([
  fs.mkdir(Path.data, { recursive: true }),
  fs.mkdir(Path.config, { recursive: true }),
  fs.mkdir(Path.state, { recursive: true }),
  fs.mkdir(Path.tmp, { recursive: true }),
  fs.mkdir(Path.log, { recursive: true }),
  fs.mkdir(Path.bin, { recursive: true }),
  fs.mkdir(Path.repos, { recursive: true }),
])
```

#### 测试时覆盖路径

```typescript
// 测试用：用临时目录替代真实路径
const testLayer = Global.layerWith({
  data: "/tmp/test-opencode/data",
  config: "/tmp/test-opencode/config",
})

// 注入测试层
const testRuntime = makeRuntime()
testRuntime.runPromise(
  someEffect.pipe(Layer.provide(testLayer))
)
```

### 7.2 AppFileSystem — 文件系统抽象 (`src/filesystem.ts`)

#### 为什么需要

Effect 自带的 `FileSystem.FileSystem` 提供了基础的文件操作（read/write/stat），但缺少一些高频使用的操作：
- 读 JSON 文件并解析
- 写 JSON 文件（含自动序列化）
- 向上查找文件（找最近的 `opencode.json`）
- 安全地读取（不存在时返回 undefined 而非抛异常）

AppFileSystem 扩展了这些能力。

#### 方法速查表

| 方法 | 返回 | 典型场景 | 和 fs 的区别 |
|------|------|----------|-------------|
| `isDir(path)` | `Effect<boolean>` | 检查目标路径是否是目录 | 不存在返回 false，不抛异常 |
| `isFile(path)` | `Effect<boolean>` | 检查文件是否存在 | 同上 |
| `existsSafe(path)` | `Effect<boolean>` | 检查路径是否存在 | 比 `fs.exists` 更安全（捕获所有错误） |
| `readFileStringSafe(path)` | `Effect<string \| undefined>` | 读取可能是可选的文件 | 不存在返回 `undefined` |
| `readJson(path)` | `Effect<unknown>` | 读取 JSON 配置文件 | 自动 JSON.parse + 错误包装 |
| `writeJson(path, data, mode?)` | `Effect<void>` | 保存 JSON 配置 | 自动 JSON.stringify + 可选权限 |
| `ensureDir(path)` | `Effect<void>` | 确保目录存在 | `mkdir -p` 的 Effect 版本 |
| `writeWithDirs(path, content)` | `Effect<void>` | 写入新文件 | 自动创建父目录 |
| `findUp(target, start, stop?)` | `Effect<string[]>` | 找最近的上层文件 | 从 start 向上搜索到 stop |
| `glob(pattern, options?)` | `Effect<string[]>` | 搜索匹配模式的文件 | 基于 Glob.scan |

#### 完整代码模式

```typescript
// 模式 1：安全读取可选配置文件
const config: unknown = yield* AppFileSystem.Service.use(
  (fs) => fs.readJson("/path/to/opencode.json")
).pipe(
  Effect.catchAll(() => Effect.succeed({})) // 不存在就用默认
)

// 模式 2：向上查找
const found = yield* AppFileSystem.Service.use(
  (fs) => fs.findUp("opencode.json", process.cwd())
)
// 从当前目录向上搜索，找到最近的那个

// 模式 3：原子写入
yield* AppFileSystem.Service.use(
  (fs) => fs.writeJson(file, data, 0o600)  // 只有 owner 可读
)
```

### 7.3 Location — 位置跟踪 (`src/location.ts`)

Location 是一个极简模块，为 Event 提供位置上下文：

```typescript
export const Ref = Schema.Struct({
  directory: Schema.String,       // 事件产生的目录
  workspaceID: Schema.optional(Schema.String),  // 工作区 ID
})
```

在 Event 发布时自动注入：

```typescript
function publish(definition, data, options?) {
  const location = yield* Effect.serviceOption(Location.Service)
  const event = {
    ...data,
    location: location ?? undefined,  // 自动注入位置
  }
  return publishEvent(event)
}
```

这样每个事件都知道自己来自哪个目录——在多工作区场景下特别有用。

---

## 8. Effect 基础设施 (`src/effect/`)

### 8.1 makeRuntime — Effect 运行时工厂 (`src/effect/runtime.ts`)

#### 为什么需要

Effect 代码需要一个 `Runtime` 来执行。Runtime 管理 Fiber 调度、资源回收、依赖注入。`makeRuntime` 提供了一个方便的工厂函数，返回三种执行模式：

```typescript
const runtime = makeRuntime()

// 模式 1：Promise 风格（适合应用入口）
const result = await runtime.runPromise(myEffect)

// 模式 2：Fiber 风格（适合后台任务）
const fiber = runtime.runFork(backgroundTask)
// 之后可以 fiber.await() 或 fiber.interrupt()

// 模式 3：Callback 风格（适合事件回调）
runtime.runCallback(myEffect, (exit) => {
  if (Exit.isSuccess(exit)) console.log("done")
})
```

#### Effect vs Promise 对比

```typescript
// Promise 写法
async function process(input) {
  const data = await db.query(input)
  const result = await transform(data)
  await notify(result)
  return result
}

// Effect 写法
function process(input) {
  return Effect.gen(function* () {
    const data = yield* db.query(input)    // 类型安全
    const result = yield* transform(data)  // 可组合
    yield* notify(result)                  // 可 fork
    return result                          // 可重试
  }).pipe(
    Effect.retry(SessionRetry.policy()),   // 声明式重试
    Effect.timeout("30 seconds"),          // 声明式超时
  )
}
```

#### MemoMap 解决的问题

```typescript
// 问题：两个服务各自需要 Database Layer
const serviceA = Layer.effect(ServiceA, ...Database.layer)
const serviceB = Layer.effect(ServiceB, ...Database.layer)

// 没有 MemoMap：Database 会被初始化两次
// 有 MemoMap：自动去重，只初始化一次
const runtime = makeRuntime({ memoMap })
runtime.runFork(Layer.build(serviceA))
runtime.runFork(Layer.build(serviceB))
// Database.layer 只 build 一次，两个服务共享同一连接
```

### 8.2 Runtime 初始化时序

```
Application Entry          makeRuntime                 MemoMap                Fiber Runtime
(main.ts)                      │                          │                       │
     │                         │                          │                       │
     │  makeRuntime()          │                          │                       │
     │────────────────────────▶│                          │                       │
     │                         │                          │                       │
     │                         │  ① 创建 MemoMap          │                       │
     │                         │     (Map<Layer,           │                       │
     │                         │      ScopedRef>)         │                       │
     │                         │─────────────────────────▶│                       │
     │                         │                          │                       │
     │                         │  ② 创建 Runtime          │                       │
     │                         │     (FiberSet +          │                       │
     │                         │      Scheduler)          │                       │
     │                         │────────────────────────────────────────────────▶│
     │                         │                          │                       │
     │◀── { runPromise,       │                          │                       │
     │       runFork,          │                          │                       │
     │       runCallback }    │                          │                       │
     │                         │                          │                       │
     │  runFork(               │                          │                       │
     │   Layer.build(          │                          │                       │
     │    ServiceA.layer       │                          │                       │
     │   ))                    │                          │                       │
     │────────────────────────▶│                          │                       │
     │                         │                          │                       │
     │                         │  ③ MemoMap.get(layer)    │                       │
     │                         │     → miss               │                       │
     │                         │─────────────────────────▶│                       │
     │                         │                          │  Layer.build()        │
     │                         │                          │  → ServiceA.init()    │
     │                         │                          │──────────────────────▶│
     │                         │                          │                       │  Effect.gen
     │                         │                          │                       │  → 初始化数据库
     │                         │                          │                       │  → 注册服务
     │                         │                          │◀── Fiber ◀───────────│
     │                         │                          │                       │
     │                         │◀── ServiceA ◀───────────│                       │
     │◀── Fiber ◀─────────────│                          │                       │
     │                         │                          │                       │
     │  runFork(               │                          │                       │
     │   Layer.build(          │                          │                       │
     │    ServiceB.layer       │                          │                       │
     │     (共享 Database      │                          │                       │
     │      Layer)             │                          │                       │
     │   ))                    │                          │                       │
     │────────────────────────▶│                          │                       │
     │                         │  MemoMap.get(layer)      │                       │
     │                         │  → HIT! 返回已缓存的     │                       │
     │                         │    Database Service      │                       │
     │◀── Fiber ◀─────────────│  (不重新初始化)           │                       │
```

### 8.3 Effect 日志层 (`src/effect/logger.ts`)

提供 Effect 版本的 Logger，自动注入 Effect 上下文的 Span 和标签：

```typescript
// 在 Effect 代码中使用
yield* EffectLogger.info("session created", {
  sessionID: "ses_xxx",
  model: "claude-sonnet-4",
})

// 输出中包含 Effect 上下文中的标签
// (如 OpenTelemetry trace ID, session ID 等)
```

---

## 9. Flag 标志系统 (`src/flag/flag.ts`)

### 9.1 为什么需要

应用中有些行为需要在不改代码的情况下调整——调试模式、特性开关、路径覆盖。如果这些都用配置文件，启动时还没读到配置就已经需要知道路径了。所以 Flag 使用环境变量，在进程启动时就能生效。

### 9.2 Flag 分类

```typescript
export const Flag = {
  // ─── 路径覆盖（测试/调试用） ───
  OPENCODE_CONFIG_DIR,          // 替代 Global.Path.config
  OPENCODE_PLUGIN_META_FILE,    // 替代插件元数据文件路径

  // ─── 认证注入（CI/CD 用） ───
  OPENCODE_AUTH_CONTENT,        // 在环境变量中注入完整的认证数据

  // ─── 调试开关 ───
  OPENCODE_PURE,                // 设为 "1" 禁用所有外部插件

  // ─── 功能标志 ───
  // ... 20+ 其他标志
}
```

### 9.3 使用示例

```bash
# 禁用插件运行（排查插件问题）
OPENCODE_PURE=1 opencode run

# 覆盖认证数据（CI 环境注入）
OPENCODE_AUTH_CONTENT='{"version":2,"accounts":{...}}' opencode run

# 使用测试路径
OPENCODE_CONFIG_DIR=/tmp/test-config opencode run
```

---

## 10. 工具函数模块 (`src/util/`)

### 10.1 Identifier — ID 生成 (`src/util/identifier.ts`)

**解决的问题**：系统中需要大量唯一 ID（会话、消息、事件、账户）。用自增整数不适合分布式场景，用 UUID 不能按时间排序，用 ULID 需要外部依赖。

**实现**：自实现的 ULID 风格 ID，时间有序、26 字符、无需全局协调。

```typescript
Identifier.ascending()
// → "01JQXRMYK9A8B3C4D5E6F7G8H9"
//   ↑ 时间戳部分 (10 char)    ↑ 随机部分 (16 char)

// 用于哪些 ID
// - SessionID: "ses_" + Identifier.ascending()
// - EventID:   "evt_" + Identifier.ascending()
// - AccountID: "acc_" + Identifier.ascending()
// - PartID:    Identifier.ascending() 直接使用
// - MessageID: Identifier.ascending() 直接使用
```

### 10.2 Flock — 文件锁 (`src/util/flock.ts`)

**解决的问题**：多个 opencode 进程可能同时写同一个文件（比如插件元数据 `plugin-meta.json`）。如果没有互斥，数据会损坏。

```typescript
// 实际使用场景：插件管理器并发安装插件时
async function touchMany(items: Touch[]) {
  return Flock.withLock("plugin-meta", async () => {
    const store = await read(file)
    // ... 更新 store ...
    await writeJson(file, store)
    // 锁自动释放
  })
}

// Flock 基于文件的 advisory lock
// - 同一进程内：互斥
// - 跨进程：互斥（基于操作系统文件锁）
// - 崩溃安全：进程退出时操作系统自动释放锁
```

### 10.3 Log — 结构化日志 (`src/util/log.ts`)

**解决的问题**：在终端程序和后台服务中都需要日志，但输出方式不同（终端打印到 stderr，后台写到文件）。日志系统统一了这个差异。

```typescript
// 创建带标签的 Logger
const log = Log.create({ service: "session.processor" })

// 基础日志（带结构化字段）
log.info("process started", {
  sessionID: "ses_xxx",
  modelID: "claude-sonnet-4",
})
// 输出: INFO  service=session.processor sessionID=ses_xxx modelID=claude-sonnet-4 process started

// 克隆并添加标签（在长生命周期对象中携带上下文）
const slog = log.clone().tag("session.id", "ses_xxx")

// 耗时追踪
using _ = log.time("LLM.stream")
// INFO  service=llm LLM.stream status=started
// ... (LLM 流处理) ...
// INFO  service=llm LLM.stream status=completed duration=12345

// 自动清理：只保留最近 10 个日志文件
async function cleanup(dir: string) {
  const files = await Glob.scan("????-??-??T??????.log", { cwd: dir })
  // 删除最旧的超过 10 个的文件
}
```

**日志级别使用建议：**

```typescript
// DEBUG: 详细的调试信息（开发时关注）
log.debug("tool call args", { tool: "read", args })

// INFO: 重要的业务流程节点（生产环境默认）
log.info("session created", { sessionID, title })

// WARN: 可恢复的异常（不影响主流程）
log.warn("retry attempt", { attempt: 2 })

// ERROR: 不可恢复的错误（需要人工关注）
log.error("LLM stream failed", { error: err.message })
```

### 10.4 Hash — 内容哈希 (`src/util/hash.ts`)

```typescript
// 用于文件快照的指纹计算
const fingerprint = Hash.sha256(fileContent)
// → "e3b0c44298fc1c149afbf4c8996fb924..."
```

### 10.5 Glob — 文件模式匹配 (`src/util/glob.ts`)

```typescript
// 搜索所有 JSON 日志文件
const files = await Glob.scan("*.json", {
  cwd: "/path/to/data",
  include: "file",
})
```

### 10.6 Retry — 重试策略 (`src/util/retry.ts`)

```typescript
// 指数退避 + 最大重试限制
const policy = Retry.policy({
  maxAttempts: 3,
  baseDelay: 1000,       // 首次等待 1s
  maxDelay: 10000,       // 最多等待 10s
})
```

---

## 11. 数据模型 Schema 的模式

### 11.1 品牌类型模式

用 `Schema.brand` 创建类型安全的"新类型"，防止原始类型混用：

```typescript
// 定义品牌类型
const AccountID = Schema.String.pipe(Schema.brand("AccountID"))
const ModelID = Schema.String.pipe(Schema.brand("ModelID"))

// 使用效果
function getAccount(id: AccountID) { ... }
function getModel(id: ModelID) { ... }

getAccount(modelID)  // ❌ 编译错误！ModelID 不是 AccountID
getAccount(AccountID.make("acc_xxx"))  // ✅
```

### 11.2 withStatics 模式

给 Schema 对象附加静态方法：

```typescript
// 不这样做的话：
const ID = Schema.String.pipe(Schema.brand("Event.ID"))
// 调用者需要: ID.make("evt_" + Identifier.ascending())

// 用 withStatics:
const ID = Schema.String.pipe(
  Schema.brand("Event.ID"),
  withStatics((schema) => ({
    create: () => schema.make("evt_" + Identifier.ascending()),
  })),
)

// 调用者只需：
ID.create()  // → "evt_01JQXR..."
```

### 11.3 TaggedError 模式

```typescript
// 定义类型安全的自定义错误
export class ProviderNotFoundError extends Schema.TaggedErrorClass<ProviderNotFoundError>()(
  "CatalogV2.ProviderNotFound",
  {
    providerID: ProviderV2.ID,
  },
) {}

// 使用
yield* Effect.fail(new ProviderNotFoundError({
  providerID: ProviderV2.ID.make("unknown-provider")
}))

// 捕获
yield* someEffect.pipe(
  Effect.catchTag("CatalogV2.ProviderNotFound", (err) =>
    Effect.log(`Provider ${err.providerID} not found`)
  )
)
```

---

## 12. 文件清单速查

```
packages/core/src/
│
├── 服务类 (有状态，通过 Layer 注入)
│   ├── aisdk.ts            — AI SDK LanguageModel 集成 + 缓存
│   ├── auth.ts             — 多账户认证管理 (v1→v2 迁移)
│   ├── catalog.ts          — 提供商/模型目录 (插件可动态注册)
│   ├── event.ts            — 事件总线 (PubSub + sync + Stream)
│   ├── filesystem.ts       — 文件系统抽象 (+JSON/查找/安全读取)
│   ├── plugin.ts           — 插件触发系统 (钩子模式)
│   └── npm.ts              — npm 包管理器
│
├── 数据模型类 (Schema 定义，无业务逻辑)
│   ├── model.ts            — ModelV2.Info / ID / Capabilities
│   ├── provider.ts         — ProviderV2.Info / ID
│   ├── session.ts          — 会话 Schema
│   ├── session-message.ts  — 消息 Schema
│   ├── session-message-updater.ts
│   ├── session-prompt.ts   — Prompt API Schema
│   ├── session-event.ts    — 会话事件定义
│   ├── tool-output.ts      — 工具输出 Schema
│   ├── location.ts         — 位置 Ref Schema
│   └── v2-schema.ts        — 通用 v2 类型
│
├── 基础设施类
│   ├── global.ts           — XDG 路径管理 (自动创建目录)
│   ├── location-layer.ts   — 位置层服务
│   ├── schema.ts           — Schema 工具 (withStatics/Newtype)
│   ├── flag/flag.ts        — 环境变量特性开关
│   ├── effect/             — Effect 运行时
│   │   ├── runtime.ts      — makeRuntime 工厂
│   │   ├── memo-map.ts     — Layer 去重缓存
│   │   ├── logger.ts       — Effect 日志层
│   │   └── observability.ts— OpenTelemetry
│   └── installation/version.ts — 版本号
│
├── 工具函数类
│   ├── util/identifier.ts  — ULID 风格唯一 ID
│   ├── util/flock.ts       — 文件级互斥锁
│   ├── util/hash.ts        — sha256 哈希
│   ├── util/log.ts         — 结构化日志 (级别/标签/耗时)
│   ├── util/glob.ts        — 文件模式匹配
│   ├── util/retry.ts       — 指数退避重试
│   └── util/... (共 17 个工具文件)
│
├── 其他
│   ├── npm-config.ts       — npm 配置读取
│   ├── cross-spawn-spawner.ts — 子进程管理器
│   ├── process.ts          — 进程元数据
│   ├── github-copilot/     — GitHub Copilot 模型提供
│   ├── plugin/             — 插件定义扩展
│   ├── models.ts           — 模型列表管理
│   └── models-snapshot.js  — 模型快照数据
```