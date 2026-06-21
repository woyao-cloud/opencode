# @opencode/ProviderAuth — Provider OAuth 认证

## 概述

`@opencode/ProviderAuth` 是 OpenCode 的 **Provider OAuth 认证服务**，负责管理第三方 AI Provider 的 OAuth 认证流程。它从插件中加载认证方法定义，处理 OAuth 授权流程（生成授权 URL、处理回调），并将认证结果持久化到 Auth 服务。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Auth` | `@opencode/Auth` | 持久化认证结果（API key 或 OAuth token） |
| `Plugin` | `@opencode/Plugin` | 加载插件定义的认证方法 |

```typescript
// auth.ts layer 定义
export const layer: Layer.Layer<Service, never, Auth.Service | Plugin.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const auth = yield* Auth.Service
    const plugin = yield* Plugin.Service
  }),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly methods: () => Effect.Effect<Methods>                                      // 获取所有 Provider 的认证方法
  readonly authorize: (input: { providerID: ProviderID } & AuthorizeInput) =>
    Effect.Effect<Authorization | undefined, Error>                                    // 启动 OAuth 授权
  readonly callback: (input: { providerID: ProviderID } & CallbackInput) =>
    Effect.Effect<void, Error>                                                         // 处理 OAuth 回调
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/ProviderAuth") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取认证方法列表
yield* ProviderAuth.Service.methods()

// 启动授权
const auth = yield* ProviderAuth.Service.authorize({ providerID, method: 0, inputs: {} })

// 处理回调
yield* ProviderAuth.Service.callback({ providerID, method: 0, code: "..." })
```

## 数据结构

### 认证方法 (Method)

```typescript
export class Method extends Schema.Class<Method>("ProviderAuthMethod")({
  type: Schema.Literals(["oauth", "api"]),    // 认证类型
  label: Schema.String,                        // 显示标签
  prompts: optionalOmitUndefined(Schema.Array(Prompt)),  // 用户输入提示
}) {}
```

### 提示 (Prompt)

```typescript
// 文本输入
const TextPrompt = Schema.Struct({
  type: Schema.Literal("text"),
  key: Schema.String,            // 字段名
  message: Schema.String,        // 提示消息
  placeholder: optionalOmitUndefined(Schema.String),
  when: optionalOmitUndefined(When),  // 条件显示
})

// 下拉选择
const SelectPrompt = Schema.Struct({
  type: Schema.Literal("select"),
  key: Schema.String,
  message: Schema.String,
  options: Schema.Array(SelectOption),
  when: optionalOmitUndefined(When),
})
```

### 条件 (When)

```typescript
const When = Schema.Struct({
  key: Schema.String,                        // 依赖字段名
  op: Schema.Literals(["eq", "neq"]),        // 操作符
  value: Schema.String,                      // 比较值
})
```

### 授权结果 (Authorization)

```typescript
export class Authorization extends Schema.Class<Authorization>("ProviderAuthAuthorization")({
  url: Schema.String,                          // 授权 URL
  method: Schema.Literals(["auto", "code"]),   // 授权方法
  instructions: Schema.String,                 // 用户指引
}) {}
```

### 认证方法集合

```typescript
export const Methods = Schema.Record(Schema.String, Schema.Array(Method))
// key = ProviderID, value = 该 Provider 的认证方法数组
```

## 认证流程

### 1. 加载认证方法

`methods()` 从所有已加载插件中收集认证方法定义：

```typescript
const methods = Effect.fn("ProviderAuth.methods")(function* () {
  const hooks = (yield* InstanceState.get(state)).hooks
  return decode(
    Record.map(hooks, (item) =>
      item.methods.map((method) => ({
        type: method.type,
        label: method.label,
        ...(method.prompts && { prompts: /* 规范化 prompts */ }),
      })),
    ),
  )
})
```

### 2. 启动授权 (authorize)

```typescript
const authorize = Effect.fn("ProviderAuth.authorize")(function* (input) {
  const { hooks, pending } = yield* InstanceState.get(state)
  const method = hooks[input.providerID].methods[input.method]
  if (method.type !== "oauth") return

  // 验证用户输入
  if (method.prompts && input.inputs) {
    for (const prompt of method.prompts) {
      if (prompt.type === "text" && prompt.validate && input.inputs[prompt.key] !== undefined) {
        const error = prompt.validate(input.inputs[prompt.key])
        if (error) return yield* new ValidationFailed({ field: prompt.key, message: error })
      }
    }
  }

  // 调用插件授权函数
  const result = yield* Effect.promise(() => method.authorize(input.inputs))
  pending.set(input.providerID, result)
  return { url: result.url, method: result.method, instructions: result.instructions }
})
```

### 3. 处理回调 (callback)

```typescript
const callback = Effect.fn("ProviderAuth.callback")(function* (input) {
  const pending = (yield* InstanceState.get(state)).pending
  const match = pending.get(input.providerID)
  if (!match) return yield* new OauthMissing({ providerID: input.providerID })
  if (match.method === "code" && !input.code) {
    return yield* new OauthCodeMissing({ providerID: input.providerID })
  }

  const result = yield* Effect.promise(() =>
    match.method === "code" ? match.callback(input.code!) : match.callback(),
  )
  if (!result || result.type !== "success") return yield* new OauthCallbackFailed({})

  // 持久化 API key
  if ("key" in result) {
    yield* auth.set(input.providerID, {
      type: "api",
      key: result.key,
      ...(result.metadata ? { metadata: result.metadata } : {}),
    })
  }

  // 持久化 OAuth token
  if ("refresh" in result) {
    const { type: _, provider: __, refresh, access, expires, ...extra } = result
    yield* auth.set(input.providerID, {
      type: "oauth",
      access,
      refresh,
      expires,
      ...extra,
    })
  }
})
```

## 状态管理

使用 `InstanceState` 管理会话级状态：

```typescript
interface State {
  hooks: Record<ProviderID, Hook>        // Provider → 插件认证钩子
  pending: Map<ProviderID, AuthOAuthResult>  // 待完成的 OAuth 流程
}
```

- `hooks`：从插件列表中提取，初始化时构建
- `pending`：OAuth 授权流程中的临时状态，回调完成后清除

## 错误类型

| 错误类 | 说明 |
|--------|------|
| `OauthMissing` | 未找到待完成的 OAuth 流程 |
| `OauthCodeMissing` | code 模式的 OAuth 缺少授权码 |
| `OauthCallbackFailed` | OAuth 回调失败（结果非 success） |
| `ValidationFailed` | 用户输入验证失败 |
| `Auth.AuthError` | Auth 服务错误（联合类型） |

## 输入 Schema

### AuthorizeInput

```typescript
export const AuthorizeInput = Schema.Struct({
  method: Schema.Finite,                                              // 认证方法索引
  inputs: Schema.optional(Schema.Record(Schema.String, Schema.String)), // 提示输入
})
```

### CallbackInput

```typescript
export const CallbackInput = Schema.Struct({
  method: Schema.Finite,                      // 认证方法索引
  code: Schema.optional(Schema.String),       // OAuth 授权码（code 模式）
})
```

## 关键设计决策

1. **插件驱动认证**：认证方法完全由插件定义，ProviderAuth 只负责编排流程，不硬编码任何 Provider 的认证逻辑

2. **双模式支持**：支持 `oauth`（OAuth 流程）和 `api`（API key）两种认证类型，通过 `Method.type` 区分

3. **条件提示**：Prompt 支持 `when` 条件（eq/neq），实现动态表单（根据前一个输入决定是否显示后续字段）

4. **输入验证**：authorize 阶段对 text 类型的 prompt 执行 `validate` 函数，验证失败返回 `ValidationFailed` 错误

5. **临时状态管理**：pending Map 存储 OAuth 中间状态，回调完成后清除，不持久化到磁盘

6. **两种持久化方式**：回调结果分为 API key 类型（`key` in result）和 OAuth token 类型（`refresh` in result），分别以 `type: "api"` 和 `type: "oauth"` 存储到 Auth 服务

7. **auto/code 双方法**：OAuth 支持 `auto`（自动完成）和 `code`（需要用户提供授权码）两种回调方式
