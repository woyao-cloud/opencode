# @opencode/Auth — 认证凭据服务

## 概述

`@opencode/Auth` 是 OpenCode 的**认证凭据管理服务**，负责存储、读取和管理 AI Provider 的认证信息。它将认证凭据持久化到本地 JSON 文件（`auth.json`），支持三种认证类型：OAuth、API Key 和 Well-Known Token。该服务被 `@opencode/Config` 依赖，用于在配置加载流程中获取认证信息以请求远程配置。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统抽象，读写 `auth.json` 凭据文件 |

```typescript
// index.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fsys = yield* AppFileSystem.Service   // 文件读写
    // ...
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer))
```

## 核心接口

```typescript
export interface Interface {
  readonly get: (providerID: string) => Effect.Effect<Info | undefined, AuthError>
  readonly all: () => Effect.Effect<Record<string, Info>, AuthError>
  readonly set: (key: string, info: Info) => Effect.Effect<void, AuthError>
  readonly remove: (key: string) => Effect.Effect<void, AuthError>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Auth") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取指定 provider 的认证信息
yield* Auth.Service.get("openai")

// 获取所有认证信息
yield* Auth.Service.all()

// 设置认证凭据
yield* Auth.Service.set("openai", new Api({ type: "api", key: "sk-xxx" }))

// 移除认证凭据
yield* Auth.Service.remove("openai")
```

## 数据结构

### 认证类型

| 类型 | Schema | 字段 | 说明 |
|------|--------|------|------|
| `Oauth` | `"oauth"` | `refresh`, `access`, `expires`, `accountId?`, `enterpriseUrl?` | OAuth 2.0 凭据，含 refresh/access token 和过期时间 |
| `Api` | `"api"` | `key`, `metadata?` | API Key 凭据，含可选的元数据 |
| `WellKnown` | `"wellknown"` | `key`, `token` | Well-Known 端点凭据 |

```typescript
export class Oauth extends Schema.Class<Oauth>("OAuth")({
  type: Schema.Literal("oauth"),
  refresh: Schema.String,
  access: Schema.String,
  expires: NonNegativeInt,
  accountId: Schema.optional(Schema.String),
  enterpriseUrl: Schema.optional(Schema.String),
}) {}

export class Api extends Schema.Class<Api>("ApiAuth")({
  type: Schema.Literal("api"),
  key: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
}) {}

export class WellKnown extends Schema.Class<WellKnown>("WellKnownAuth")({
  type: Schema.Literal("wellknown"),
  key: Schema.String,
  token: Schema.String,
}) {}

export const Info = Schema.Union([Oauth, Api, WellKnown])
```

### 错误类型

```typescript
export class AuthError extends Schema.TaggedErrorClass<AuthError>()("AuthError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}
```

### 存储文件

凭据存储在 `~/.local/share/opencode/auth.json`（通过 `Global.Path.data` 拼接），文件权限为 `0o600`（仅 owner 可读写）。

## 关键实现细节

### 凭据读取

`all()` 方法从 `auth.json` 读取 JSON 对象，然后使用 `Schema.decodeUnknownOption` 对每个值进行解码校验。解码失败的条目被静默过滤掉（`Record.filterMap`），不会抛出异常。读取失败时返回空对象。

同时支持通过 `OPENCODE_AUTH_CONTENT` 环境变量直接注入认证内容，优先级高于文件读取：

```typescript
const all = Effect.fn("Auth.all")(function* () {
  if (process.env.OPENCODE_AUTH_CONTENT) {
    try {
      return JSON.parse(process.env.OPENCODE_AUTH_CONTENT)
    } catch (err) {}
  }
  const data = (yield* fsys.readJson(file).pipe(Effect.orElseSucceed(() => ({}))))
  return Record.filterMap(data, (value) => Result.fromOption(decode(value), () => undefined))
})
```

### Key 规范化

`set()` 和 `remove()` 方法会对 key 进行规范化处理：移除尾部斜杠。这是为了兼容历史上可能写入的 `"provider/"` 形式的 key。设置新 key 时会同时清理旧格式的 key：

```typescript
const set = Effect.fn("Auth.set")(function* (key: string, info: Info) {
  const norm = key.replace(/\/+$/, "")
  const data = yield* all()
  if (norm !== key) delete data[key]
  delete data[norm + "/"]
  yield* fsys.writeJson(file, { ...data, [norm]: info }, 0o600)
})
```

## 关键设计决策

1. **Effect Service 模式**：使用 Effect 的 `Context.Service` 实现依赖注入，所有凭据访问通过 Effect 生成器，天然支持并发和错误处理

2. **联合类型 + 鉴别字段**：三种认证类型通过 `Schema.Union` 统一为 `Info` 类型，使用 `type` 字段（`"oauth"` / `"api"` / `"wellknown"`）作为鉴别器，支持运行时类型区分

3. **静默过滤无效数据**：读取时对解码失败的值静默过滤而非抛错，保证服务在部分数据损坏时仍可正常工作

4. **环境变量注入**：支持 `OPENCODE_AUTH_CONTENT` 环境变量直接注入凭据，跳过文件读取，适用于 CI/CD 和容器化场景

5. **Key 兼容性处理**：自动规范化 key 并清理尾部斜杠的旧格式条目，保证向后兼容

6. **安全文件权限**：写入凭据文件时使用 `0o600` 权限，防止其他用户读取敏感信息
