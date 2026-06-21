# @opencode/McpAuth — MCP OAuth 认证持久化

## 概述

`@opencode/McpAuth` 是 OpenCode 的 **MCP OAuth 认证持久化服务**，负责管理 MCP 服务器的 OAuth 凭证（token、client 信息、code verifier、OAuth state）的读写和生命周期。它将认证数据持久化到 `mcp-auth.json` 文件中（权限 0600），提供完整的 CRUD 操作和 token 过期检查。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 读写 `mcp-auth.json` 文件 |

```typescript
// auth.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly all: () => Effect.Effect<Record<string, Entry>>                                   // 所有认证条目
  readonly get: (mcpName: string) => Effect.Effect<Entry | undefined>                        // 获取单个条目
  readonly getForUrl: (mcpName: string, serverUrl: string) => Effect.Effect<Entry | undefined>  // 按 URL 获取
  readonly set: (mcpName: string, entry: Entry, serverUrl?: string) => Effect.Effect<void>   // 设置条目
  readonly remove: (mcpName: string) => Effect.Effect<void>                                  // 删除条目
  readonly updateTokens: (mcpName: string, tokens: Tokens, serverUrl?: string) => Effect.Effect<void>
  readonly updateClientInfo: (mcpName: string, clientInfo: ClientInfo, serverUrl?: string) => Effect.Effect<void>
  readonly updateCodeVerifier: (mcpName: string, codeVerifier: string) => Effect.Effect<void>
  readonly clearCodeVerifier: (mcpName: string) => Effect.Effect<void>
  readonly updateOAuthState: (mcpName: string, oauthState: string) => Effect.Effect<void>
  readonly getOAuthState: (mcpName: string) => Effect.Effect<string | undefined>
  readonly clearOAuthState: (mcpName: string) => Effect.Effect<void>
  readonly isTokenExpired: (mcpName: string) => Effect.Effect<boolean | null>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/McpAuth") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取所有认证数据
yield* McpAuth.Service.all()

// 设置 token
yield* McpAuth.Service.updateTokens("my-server", { accessToken, refreshToken, expiresAt, scope })

// 检查 token 是否过期
yield* McpAuth.Service.isTokenExpired("my-server")
```

## 数据结构

### Tokens

```typescript
export const Tokens = Schema.Struct({
  accessToken: Schema.mutableKey(Schema.String),              // 访问 token
  refreshToken: Schema.mutableKey(Schema.optional(Schema.String)), // 刷新 token
  expiresAt: Schema.mutableKey(Schema.optional(Schema.Number)),     // 过期时间戳（秒）
  scope: Schema.mutableKey(Schema.optional(Schema.String)),         // 权限范围
})
```

所有字段使用 `mutableKey` 修饰，允许运行时修改。

### ClientInfo

```typescript
export const ClientInfo = Schema.Struct({
  clientId: Schema.mutableKey(Schema.String),                        // 客户端 ID
  clientSecret: Schema.mutableKey(Schema.optional(Schema.String)),   // 客户端密钥
  clientIdIssuedAt: Schema.mutableKey(Schema.optional(Schema.Number)),     // 客户端 ID 签发时间
  clientSecretExpiresAt: Schema.mutableKey(Schema.optional(Schema.Number)), // 客户端密钥过期时间
})
```

### Entry

```typescript
export const Entry = Schema.Struct({
  tokens: Schema.mutableKey(Schema.optional(Tokens)),              // OAuth token
  clientInfo: Schema.mutableKey(Schema.optional(ClientInfo)),      // 客户端注册信息
  codeVerifier: Schema.mutableKey(Schema.optional(Schema.String)), // PKCE code verifier
  oauthState: Schema.mutableKey(Schema.optional(Schema.String)),   // OAuth state（防 CSRF）
  serverUrl: Schema.mutableKey(Schema.optional(Schema.String)),    // 服务器 URL（用于多 URL 区分）
})
```

### AuthData

```typescript
type AuthData = Record<string, Entry>
```

顶层结构：MCP 服务器名称 → Entry 的映射。

## 文件存储

认证数据存储在全局数据目录下的 `mcp-auth.json`：

```typescript
const filepath = path.join(Global.Path.data, "mcp-auth.json")
```

文件权限为 `0o600`（仅所有者可读写）：

```typescript
yield* fs.writeJson(filepath, { ...data, [mcpName]: entry }, 0o600).pipe(Effect.orDie)
```

## 数据读取与验证

`all()` 方法读取文件并使用 Schema 解码验证：

```typescript
const all = Effect.fn("McpAuth.all")(function* () {
  return yield* fs.readJson(filepath).pipe(
    Effect.map((data): AuthData =>
      Option.getOrElse(decodeAuthData(data), () => ({}) as AuthData) as AuthData
    ),
    Effect.catch(() => Effect.succeed({} as AuthData)),
  )
})
```

- 解码失败时 fallback 为空对象（不抛出错误）
- 文件不存在时返回空对象

## URL 感知查询

`getForUrl()` 按服务器 URL 精确匹配条目，防止同一 MCP 名称下不同 URL 的凭证混淆：

```typescript
const getForUrl = Effect.fn("McpAuth.getForUrl")(function* (mcpName, serverUrl) {
  const entry = yield* get(mcpName)
  if (!entry) return undefined
  if (!entry.serverUrl) return undefined
  if (entry.serverUrl !== serverUrl) return undefined
  return entry
})
```

## 字段级更新

使用 `updateField` 和 `clearField` 工厂函数生成字段级更新方法，避免代码重复：

### updateField

```typescript
const updateField = <K extends keyof Entry>(field: K, spanName: string) =>
  Effect.fn(`McpAuth.${spanName}`)(function* (mcpName, value, serverUrl?) {
    const entry = (yield* get(mcpName)) ?? {}
    entry[field] = value
    yield* set(mcpName, entry, serverUrl)
  })
```

生成的更新方法：
- `updateTokens(mcpName, tokens, serverUrl?)`
- `updateClientInfo(mcpName, clientInfo, serverUrl?)`
- `updateCodeVerifier(mcpName, codeVerifier)`
- `updateOAuthState(mcpName, oauthState)`

### clearField

```typescript
const clearField = (field: keyof Entry, spanName: string) =>
  Effect.fn(`McpAuth.${spanName}`)(function* (mcpName) {
    const entry = yield* get(mcpName)
    if (entry) {
      delete entry[field]
      yield* set(mcpName, entry)
    }
  })
```

生成的清除方法：
- `clearCodeVerifier(mcpName)`
- `clearOAuthState(mcpName)`

## Token 过期检查

`isTokenExpired()` 检查 access token 是否过期：

```typescript
const isTokenExpired = Effect.fn("McpAuth.isTokenExpired")(function* (mcpName) {
  const entry = yield* get(mcpName)
  if (!entry?.tokens) return null         // 无 token → null
  if (!entry.tokens.expiresAt) return false  // 无过期时间 → 永不过期
  return entry.tokens.expiresAt < Date.now() / 1000  // 秒级时间戳比较
})
```

返回值语义：
- `null`：无 token 信息（未认证）
- `false`：token 未过期或无过期时间
- `true`：token 已过期

## OAuth State 管理

OAuth state 用于 CSRF 防护。`McpAuth` 提供独立的 state 读写：

```typescript
// 写入 state（授权流程开始时）
yield* McpAuth.Service.updateOAuthState(mcpName, oauthState)

// 读取 state（回调验证时）
const storedState = yield* McpAuth.Service.getOAuthState(mcpName)

// 清除 state（验证完成后）
yield* McpAuth.Service.clearOAuthState(mcpName)
```

## 关键设计决策

1. **单文件持久化**：所有 MCP 认证数据存储在单个 `mcp-auth.json` 文件中，简化管理和备份

2. **0600 权限**：文件权限严格限制为仅所有者可读写，保护敏感凭证

3. **Schema 解码容错**：读取时使用 `Option.getOrElse` 处理解码失败，fallback 为空对象，确保文件损坏不导致崩溃

4. **URL 感知查询**：`getForUrl()` 按 serverUrl 精确匹配，防止同一 MCP 名称不同 URL 的凭证混淆（例如同一服务器的不同实例）

5. **字段级更新工厂**：`updateField`/`clearField` 工厂函数减少样板代码，所有更新方法共享相同的读-改-写模式

6. **mutableKey Schema**：所有 Entry 字段使用 `Schema.mutableKey` 修饰，支持运行时直接修改（Effect Schema 默认不可变）

7. **PKCE 支持**：`codeVerifier` 字段支持 PKCE (Proof Key for Code Exchange) 流程，增强 OAuth 安全性

8. **OAuth State 独立管理**：state 与 token 分离管理，state 仅在授权流程中临时存在，验证后立即清除

9. **token 过期检查容错**：无 `expiresAt` 时视为永不过期（`false`），无 token 时返回 `null` 区分"未认证"和"未过期"两种状态
