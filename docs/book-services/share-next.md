# @opencode/ShareNext — 分享数据同步服务

## 概述

`@opencode/ShareNext` 是分享功能的底层数据同步服务，负责与分享 API 服务器通信（创建、同步、删除分享），管理分享数据的分发，以及维护本地的分享记录。它通过 Bus 事件订阅 Session、Message、Part 和 Diff 的变更，自动将增量数据推送到分享服务器，并在创建分享时执行全量同步。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Account` | `@opencode/Account` | 获取账户信息和 API token |
| `Bus` | `@opencode/Bus` | 订阅事件（Session.Updated、MessageV2.Updated、PartUpdated、Session.Diff、Session.Deleted） |
| `Config` | `@opencode/Config` | 读取 `enterprise.url` 配置 |
| `HttpClient` | `effect/unstable/http` | HTTP 客户端，与分享 API 通信 |
| `Provider` | `@opencode/Provider` | 获取模型信息（`getModel`） |
| `Session` | `@opencode/Session` | 读取会话信息和消息 |

```typescript
// share-next.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const account = yield* Account.Service
  const bus = yield* Bus.Service
  const cfg = yield* Config.Service
  const http = yield* HttpClient.HttpClient
  const provider = yield* Provider.Service
  const session = yield* Session.Service
  // ...
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly init: () => Effect.Effect<void, unknown>
  readonly url: () => Effect.Effect<string, unknown>
  readonly request: () => Effect.Effect<Req, unknown>
  readonly create: (sessionID: SessionID) => Effect.Effect<Share, unknown>
  readonly remove: (sessionID: SessionID) => Effect.Effect<void, unknown>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/ShareNext") {}
```

使用示例：

```typescript
// 初始化分享服务（启动事件监听）
yield* ShareNext.Service.init()

// 创建分享
const share = yield* ShareNext.Service.create("ses_abc123")

// 移除分享
yield* ShareNext.Service.remove("ses_abc123")

// 获取分享服务器 URL
const baseUrl = yield* ShareNext.Service.url()
```

## 数据结构

### Share（分享凭证）

```typescript
const ShareSchema = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  secret: Schema.String,
})
```

| 字段 | 说明 |
|------|------|
| `id` | 分享 ID（服务端生成） |
| `url` | 分享链接 |
| `secret` | 分享密钥（用于后续同步操作认证） |

### Data（同步数据类型）

```typescript
type Data =
  | { type: "session"; data: SDK.Session }
  | { type: "message"; data: SDK.Message }
  | { type: "part"; data: SDK.Part }
  | { type: "session_diff"; data: SDK.SnapshotFileDiff[] }
  | { type: "model"; data: SDK.Model[] }
```

### Req（API 请求配置）

```typescript
type Req = {
  headers: Record<string, string>
  api: Api                    // API 端点路径
  baseUrl: string             // 服务器基 URL
}
```

### Api（API 端点）

```typescript
type Api = {
  create: string              // POST /api/shares
  sync: (shareID: string) => string   // POST /api/shares/:id/sync
  remove: (shareID: string) => string // DELETE /api/shares/:id
  data: (shareID: string) => string   // GET /api/shares/:id/data
}
```

### State（内部状态）

```typescript
type State = {
  queue: Map<SessionID, Map<string, Data>>
  scope: Scope.Closeable
  shared: Map<SessionID, Share | null>
}
```

| 字段 | 说明 |
|------|------|
| `queue` | 待同步数据队列（按 sessionID → key → Data 组织） |
| `scope` | 异步任务的 Scope |
| `shared` | 已缓存的分享凭证（null 表示确认未分享） |

## 关键实现细节

### API 端点选择

根据账户状态选择不同的 API 端点：

```typescript
const request = Effect.fn("ShareNext.request")(function* () {
  const active = yield* account.active()
  if (Option.isNone(active) || !active.value.active_org_id) {
    // 无组织账户 → 使用 legacy API
    return { headers: {}, api: legacyApi, baseUrl: enterpriseUrl ?? "https://opncd.ai" }
  }
  // 有组织账户 → 使用 console API
  const token = yield* account.token(active.value.id)
  return {
    headers: { authorization: `Bearer ${token}`, "x-org-id": active.value.active_org_id },
    api: consoleApi,
    baseUrl: active.value.url,
  }
})
```

- Legacy API：`/api/share`（无组织账户）
- Console API：`/api/shares`（有组织账户，带 Bearer token 和 org-id 头）

### 事件驱动的增量同步

服务在 `init` 时订阅 5 类 Bus 事件，自动触发增量同步：

```typescript
// Session 更新
yield* watch(Session.Event.Updated, (evt) =>
  sync(evt.properties.info.id, [{ type: "session", data: evt.properties.info }])
)

// Message 更新（包含关联的 Model 信息）
yield* watch(MessageV2.Event.Updated, (evt) =>
  Effect.gen(function* () {
    sync(info.sessionID, [{ type: "message", data: info }])
    if (info.role === "user") {
      const model = yield* provider.getModel(info.model.providerID, info.model.modelID)
      sync(info.sessionID, [{ type: "model", data: [model] }])
    }
  })
)

// Part 更新
yield* watch(MessageV2.Event.PartUpdated, (evt) =>
  sync(evt.properties.part.sessionID, [{ type: "part", data: evt.properties.part }])
)

// Session Diff 更新
yield* watch(Session.Event.Diff, (evt) =>
  sync(evt.properties.sessionID, [{ type: "session_diff", data: evt.properties.diff }])
)

// Session 删除 → 自动取消分享
yield* watch(Session.Event.Deleted, (evt) => remove(evt.properties.sessionID))
```

### 批量延迟刷新

增量数据先进入队列，1 秒后批量发送：

```typescript
function sync(sessionID: SessionID, data: Data[]): Effect.Effect<void> {
  return Effect.gen(function* () {
    const share = yield* getCached(sessionID)
    if (!share) return

    const s = yield* InstanceState.get(state)
    const existing = s.queue.get(sessionID)
    if (existing) {
      // 已有待发送队列 → 合并数据
      for (const item of data) existing.set(key(item), item)
      return
    }

    // 新建队列 → 1 秒后批量发送
    const next = new Map(data.map((item) => [key(item), item]))
    s.queue.set(sessionID, next)
    yield* flush(sessionID).pipe(
      Effect.delay(1000),
      Effect.forkIn(s.scope),
    )
  })
}
```

- 多次快速变更合并到一个队列中
- 延迟 1 秒批量发送，避免高频 API 调用
- `key()` 函数确保同一 key 的数据覆盖而非追加

### flush 批量发送

```typescript
const flush = Effect.fn("ShareNext.flush")(function* (sessionID: SessionID) {
  const s = yield* InstanceState.get(state)
  const queued = s.queue.get(sessionID)
  if (!queued) return
  s.queue.delete(sessionID)

  const share = yield* getCached(sessionID)
  if (!share) return

  const req = yield* request()
  yield* HttpClientRequest.post(`${req.baseUrl}${req.api.sync(share.id)}`).pipe(
    HttpClientRequest.setHeaders(req.headers),
    HttpClientRequest.bodyJson({ secret: share.secret, data: Array.from(queued.values()) }),
    Effect.flatMap((r) => http.execute(r)),
  )
  // 4xx 以上状态码仅记录 warning，不重试
})
```

### 全量同步

创建分享后执行一次全量同步，将所有历史数据推送到服务器：

```typescript
const full = Effect.fn("ShareNext.full")(function* (sessionID: SessionID) {
  const info = yield* session.get(sessionID)
  const diffs = yield* session.diff(sessionID)
  const messages = yield* session.messages({ sessionID })
  const models = yield* Effect.forEach(
    // 去重：只收集 user 消息中不重复的 model 组合
    Array.from(new Map(
      messages.filter((msg) => msg.info.role === "user")
        .map((msg) => (msg.info as SDK.UserMessage).model)
        .map((item) => [`${item.providerID}/${item.modelID}`, item])
    ).values()),
    (item) => provider.getModel(ProviderID.make(item.providerID), ModelID.make(item.modelID)),
    { concurrency: 8 },
  )

  yield* sync(sessionID, [
    { type: "session", data: info },
    ...messages.map((item) => ({ type: "message", data: item.info })),
    ...messages.flatMap((item) => item.parts.map((part) => ({ type: "part", data: part }))),
    { type: "session_diff", data: diffs },
    { type: "model", data: models },
  ])
})
```

### 本地缓存与持久化

分享凭证同时缓存在内存（`shared` Map）和数据库（`SessionShareTable`）中：

```typescript
// 内存缓存
const getCached = Effect.fnUntraced(function* (sessionID: SessionID) {
  const s = yield* InstanceState.get(state)
  if (s.shared.has(sessionID)) {
    return s.shared.get(sessionID) ?? undefined
  }
  const share = yield* get(sessionID)  // 从数据库读取
  s.shared.set(sessionID, share ?? null)
  return share
})

// 数据库持久化
yield* db((db) =>
  db.insert(SessionShareTable).values({ session_id: sessionID, id, secret, url })
    .onConflictDoUpdate({ target: SessionShareTable.session_id, set: { id, secret, url } })
    .run()
)
```

### 禁用开关

通过环境变量 `OPENCODE_DISABLE_SHARE=true` 可完全禁用分享功能，所有操作变为 no-op：

```typescript
const disabled = process.env["OPENCODE_DISABLE_SHARE"] === "true" || process.env["OPENCODE_DISABLE_SHARE"] === "1"
```

## 关键设计决策

1. **事件驱动的增量同步**：通过订阅 Bus 事件自动捕获所有数据变更，无需调用方手动触发同步，降低漏同步风险

2. **批量延迟刷新**：1 秒的延迟窗口将高频变更合并为一次 API 调用，减少网络开销

3. **Key 去重覆盖**：使用 `key()` 函数生成数据唯一标识（如 `message/msg_123`、`part/msg_123/part_456`），后续同 key 数据覆盖前值

4. **全量 + 增量模式**：创建时全量同步历史数据，运行时增量推送变更，兼顾完整性和实时性

5. **内存 + 数据库双缓存**：内存缓存加速读取，数据库持久化确保重启后不丢失分享凭证

6. **Legacy/Console 双 API**：根据账户状态自动切换 API 端点和认证方式，兼容旧版和新版后端

7. **环境变量总开关**：`OPENCODE_DISABLE_SHARE` 提供紧急关闭分享功能的途径

8. **Session 删除自动取消分享**：监听 `Session.Event.Deleted` 事件，自动调用 `remove` 清理分享

9. **容错设计**：事件订阅处理函数内的错误被 catch 并记录日志，不会因单个事件处理失败导致整个订阅链崩溃
