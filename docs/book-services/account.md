# @opencode/Account — 账户服务
> 源文件: `opencode/packages/opencode/src/account/account.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/account/account.ts`

## 概述

`@opencode/Account` 是 OpenCode 的**账户管理与远程认证服务**，负责处理用户登录、Token 刷新、组织查询和设备授权码（Device Code）OAuth 流程。它封装了与 OpenCode Console 服务端的 HTTP 通信，通过 `@opencode/AccountRepo` 持久化账户信息到本地 SQLite 数据库，被 `@opencode/Config` 依赖以获取 Console 组织级远程配置。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AccountRepo` | `@opencode/AccountRepo` | 账户数据持久化，管理 SQLite 中的账户和状态表 |
| `HttpClient` | `effect/unstable/http` | HTTP 客户端，与 Console 服务端通信 |

```typescript
// account.ts layer 定义
export const layer: Layer.Layer<Service, never, AccountRepo.Service | HttpClient.HttpClient> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const repo = yield* AccountRepo.Service      // 账户持久化
    const http = yield* HttpClient.HttpClient     // HTTP 通信
    // ...
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(AccountRepo.layer), Layer.provide(FetchHttpClient.layer))
```

## 核心接口

```typescript
export interface Interface {
  readonly active: () => Effect.Effect<Option.Option<Info>, AccountError>
  readonly activeOrg: () => Effect.Effect<Option.Option<ActiveOrg>, AccountError>
  readonly list: () => Effect.Effect<Info[], AccountError>
  readonly orgsByAccount: () => Effect.Effect<readonly AccountOrgs[], AccountError>
  readonly remove: (accountID: AccountID) => Effect.Effect<void, AccountError>
  readonly use: (accountID: AccountID, orgID: Option.Option<OrgID>) => Effect.Effect<void, AccountError>
  readonly orgs: (accountID: AccountID) => Effect.Effect<readonly Org[], AccountError>
  readonly config: (accountID: AccountID, orgID: OrgID) => Effect.Effect<Option.Option<Record<string, unknown>>, AccountError>
  readonly token: (accountID: AccountID) => Effect.Effect<Option.Option<AccessToken>, AccountError>
  readonly login: (url: string) => Effect.Effect<Login, AccountError>
  readonly poll: (input: Login) => Effect.Effect<PollResult, AccountError>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Account") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取当前活跃账户
yield* Account.Service.active()

// 登录
const login = yield* Account.Service.login("https://console.opencode.ai")
console.log(login.url) // 用户打开此 URL 完成浏览器授权

// 轮询登录结果
const result = yield* Account.Service.poll(login)

// 获取账户的访问 token
const token = yield* Account.Service.token(accountId)

// 获取账户的组织列表
const orgs = yield* Account.Service.orgs(accountId)
```

## 数据结构

### 账户信息

```typescript
export class Info extends Schema.Class<Info>("Account")({
  id: AccountID,            // 品牌化的字符串 ID
  email: Schema.String,
  url: Schema.String,       // Console 服务端 URL
  active_org_id: Schema.NullOr(OrgID),
}) {}

export class Org extends Schema.Class<Org>("Org")({
  id: OrgID,
  name: Schema.String,
}) {}

export type AccountOrgs = {
  account: Info
  orgs: readonly Org[]
}

export type ActiveOrg = {
  account: Info
  org: Org
}
```

### 品牌化类型（Branded Types）

所有敏感标识符使用 Effect Schema 的 `brand` 进行品牌化，防止类型混淆：

| 类型 | 基类型 | 用途 |
|------|--------|------|
| `AccountID` | `string` | 账户唯一标识 |
| `OrgID` | `string` | 组织唯一标识 |
| `AccessToken` | `string` | 访问令牌 |
| `RefreshToken` | `string` | 刷新令牌 |
| `DeviceCode` | `string` | 设备授权码 |
| `UserCode` | `string` | 用户验证码 |

### 登录流程数据结构

```typescript
export class Login extends Schema.Class<Login>("Login")({
  code: DeviceCode,         // 设备码
  user: UserCode,           // 用户码（展示给用户）
  url: Schema.String,       // 浏览器授权 URL
  server: Schema.String,    // 服务端地址
  expiry: Schema.Duration,  // 过期时间
  interval: Schema.Duration,// 轮询间隔
}) {}
```

### 轮询结果（联合类型）

```typescript
export const PollResult = Schema.Union([
  PollSuccess,   // { email: string } — 登录成功
  PollPending,   // 等待用户授权
  PollSlow,      // 授权速度较慢
  PollExpired,   // 设备码已过期
  PollDenied,    // 用户拒绝授权
  PollError,     // 轮询错误
])
```

### 错误类型

| 错误类 | 说明 |
|--------|------|
| `AccountRepoError` | 数据库操作失败 |
| `AccountServiceError` | 服务端返回非预期响应 |
| `AccountTransportError` | 网络传输层错误（DNS/连接失败等） |

## 关键实现细节

### Device Code OAuth 流程

1. **`login(url)`**：向 `<server>/auth/device/code` 发送 POST 请求，获取 `device_code`、`user_code`、验证 URL 和轮询参数
2. **`poll(login)`**：轮询 `<server>/auth/device/token`，根据服务端返回的错误码映射为不同的 `PollResult`：
   - `authorization_pending` → `PollPending`
   - `slow_down` → `PollSlow`
   - `expired_token` → `PollExpired`
   - `access_denied` → `PollDenied`
3. 成功后并发获取用户信息和组织列表，通过 `AccountRepo.persistAccount` 持久化

### Token 刷新与缓存

Token 管理采用**惰性刷新 + 缓存**策略：

- **`isTokenFresh`**：如果 token 距离过期还有 5 分钟以上（`eagerRefreshThreshold`），视为新鲜，直接返回
- **`refreshToken`**：向 `<server>/auth/device/token` 发送 `refresh_token` grant，获取新 token 后通过 `AccountRepo.persistToken` 更新
- **`refreshTokenCache`**：使用 Effect 的 `Cache`（无限容量、零 TTL），同一 `AccountID` 的并发刷新请求自动合并为一次

```typescript
const refreshTokenCache = yield* Cache.make<AccountID, AccessToken, AccountError>({
  capacity: Number.POSITIVE_INFINITY,
  timeToLive: Duration.zero,
  lookup: Effect.fnUntraced(function* (accountID) {
    const maybeAccount = yield* repo.getRow(accountID)
    // ...检查新鲜度，不新鲜则刷新
  }),
})
```

### HTTP 客户端分层

使用三种不同配置的 HTTP 客户端实例：

| 客户端 | 配置 | 用途 |
|--------|------|------|
| `httpRead` | `withTransientReadRetry` | 读操作，带瞬时错误重试 |
| `httpOk` | `filterStatusOk` | 写操作，仅接受 2xx 状态码 |
| `httpReadOk` | 两者结合 | 读操作 + 状态码过滤 |

### 组织查询

`orgsByAccount()` 并发查询所有账户的组织列表（`concurrency: 3`），单个账户查询失败时静默返回空数组，不影响其他账户。

## 关键设计决策

1. **Device Code OAuth 流程**：使用 OAuth 2.0 Device Authorization Grant（RFC 8628），用户在浏览器完成授权，CLI 轮询获取 token，适用于无浏览器环境的 CLI 工具

2. **品牌化类型（Branded Types）**：所有敏感标识符使用 `Schema.brand` 品牌化，编译时防止 `AccountID` 和 `OrgID` 等类型混用

3. **惰性 Token 刷新**：仅在 token 距离过期不足 5 分钟时才发起刷新请求，减少不必要的网络调用

4. **并发刷新合并**：使用 Effect Cache 合并同一 account 的并发 token 刷新请求，避免多个调用者同时触发刷新

5. **错误分层**：区分 `AccountRepoError`（数据库）、`AccountServiceError`（服务端）、`AccountTransportError`（网络）三层错误，`AccountTransportError` 提供友好的诊断信息（"检查网络、代理或 VPN 配置"）

6. **组织容错**：组织列表查询失败时静默返回空数组，不阻断账户列表的整体展示

7. **URL 规范化**：`normalizeServerUrl` 移除 query string、hash 和尾部斜杠，确保同一个服务端地址的一致性
