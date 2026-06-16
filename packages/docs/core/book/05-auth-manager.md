# AuthV2：多凭证管理

> **目标读者**：熟悉 OAuth2、API Key 管理、Spring Security 的开发者。
> **本章目标**：理解 AuthV2 如何管理多提供商多账户的凭证，以及品牌类型和不可变更新的实战用法。

---

## 5.1 场景设定

假设用户 Alice 使用 OpenCode 进行 AI 编码。她的凭证配置可能是这样的：

```
OpenAI:   一个个人账户（API Key）
Anthropic:一个公司账户（OAuth，需定期刷新）
Google:   切换到不同的 API Key（因为旧 Key 快过期了）
```

AuthV2 要解决的核心问题就是：**怎么组织、存储和切换这些凭证**？

### 5.1.1 数据结构设计

```typescript
// 核心结构（简化）
type AuthStore = {
  version: 2,
  accounts: Record<string, Account>,    // 所有账户
  active: Record<string, AccountID>,    // 每个提供商当前用哪个账户
}

Account = {
  id: AccountID,          // 唯一标识
  serviceID: ServiceID,   // 提供商（如 "anthropic"）
  credential: Credential, // API Key 或 OAuth Token
  description: string,    // 备注（如 "个人账户"）
}
```

**对比 Java 的设计**：

```java
// Java：如果用 HashMap 管理
Map<String, Account> accounts = new HashMap<>();
Map<String, String> active = new HashMap<>();

// 问题：key 是 String，容易写错
active.put("Anthropic", "acc_001");  // 拼写错误，和 accounts 中的不一致
active.put("anthropic", "acc_001");  // ✅ 保持一致性很麻烦
```

**TypeScript 的品牌类型**：

```typescript
// 品牌类型编译器帮你保证一致性
const serviceID = ServiceID.make("anthropic")
active.set(serviceID, accountID)     // ✅ 类型正确
active.set("Anthropic", accountID)   // ❌ 编译错误！string 不是 ServiceID
```

---

## 5.2 凭证类型

AuthV2 支持两种凭证类型，用联合类型表示：

```typescript
// 联合类型：凭证可以是 API Key 或 OAuth
type Credential = ApiKeyCredential | OAuthCredential

// API Key
class ApiKeyCredential {
  type: "api"                    // 区分标签
  key: string                    // API Key 本身
  metadata?: Record<string, string>  // 可选元数据
}

// OAuth
class OAuthCredential {
  type: "oauth"                  // 区分标签
  refresh: string                // refresh token
  access: string                 // access token
  expires: number                // 过期时间戳
}
```

**联合类型的优势**（对比 Java 继承体系）：

```typescript
// TypeScript：根据 type 字段精准分工
function useCredential(cred: Credential) {
  if (cred.type === "api") {
    // TypeScript 知道：cred 是 ApiKeyCredential
    console.log(cred.key)         // ✅ 只有 api 类型有 key
    // console.log(cred.refresh)  // ❌ 编译错误！api 类型没有 refresh
  }

  if (cred.type === "oauth") {
    // TypeScript 知道：cred 是 OAuthCredential
    const expired = cred.expires < Date.now()
    if (expired) refreshToken(cred.refresh)
  }
}

// Java：需要 instance of + 类型转换
if (cred instanceof ApiKeyCredential) {
  String key = ((ApiKeyCredential) cred).getKey();  // 强制转换
}
```

---

## 5.3 完整使用场景

### 5.3.1 场景 1：用户添加 Anthropic API Key

```bash
# CLI 命令
opencode providers add anthropic --api-key sk-ant-xxx
```

背后的代码：

```typescript
// CLI 命令处理器
const account = yield* AuthV2.Service.create({
  serviceID: ServiceID.make("anthropic"),
  credential: new ApiKeyCredential({
    type: "api",
    key: "sk-ant-xxx",
  }),
  description: "personal",
  active: true,           // 设为 Anthropic 的默认账户
})
```

### 5.3.2 场景 2：LLM 调用时获取凭证

```typescript
// session/llm.ts — 真正的 LLM 调用
function getCredentials(providerID: string) {
  return Effect.gen(function* () {
    // 1. 获取该提供商的活动账户
    const account = yield* AuthV2.Service.active(
      ServiceID.make(providerID)
    )

    if (!account) {
      return yield* Effect.fail(
        new NoCredentialError(providerID)
      )
    }

    // 2. 根据凭证类型决定认证方式
    const credential = account.credential
    if (credential.type === "api") {
      return { type: "apiKey", key: credential.key }
    }

    // 3. OAuth：检查是否过期，过期则刷新
    if (credential.expires < Date.now()) {
      const newTokens = yield* refreshOAuth(credential.refresh)
      yield* AuthV2.Service.update(account.id, {
        credential: new OAuthCredential({
          type: "oauth",
          access: newTokens.access,
          refresh: newTokens.refresh,
          expires: newTokens.expires,
        }),
      })
      return { type: "bearer", token: newTokens.access }
    }

    return { type: "bearer", token: credential.access }
  })
}
```

### 5.3.3 场景 3：切换默认账户

```typescript
// 用户有多个 OpenAI 账户
// Account A: "personal" — API Key sk-xxx
// Account B: "work" — OAuth

// 切换到 work 账户
yield* AuthV2.Service.activate(workAccountID)

// 现在 active("openai") 返回 workAccount
const activeAccount = yield* AuthV2.Service.active(
  ServiceID.make("openai")
)
// → Account { description: "work", credential: OAuthCredential, ... }
```

---

## 5.4 线程安全：SynchronizedRef

### 5.4.1 为什么需要线程安全

多个 Effect Fiber 可能同时操作 AuthV2：

```
Fiber A: read active("anthropic")  → 准备使用
Fiber B: activate(newAccount)      → 切换账户
Fiber A: 继续使用旧的凭证（可能已被 Fiber B 删除）
```

### 5.4.2 SynchronizedRef 的解决方案

```typescript
// packages/core/src/auth.ts:153
// 用 SynchronizedRef 包裹状态，所有操作都是原子的
const state = SynchronizedRef.makeUnsafe(yield* load())

// 改造 create 操作（线程安全版本）
create: Effect.fn("AuthV2.add")(function* (input) {
  return yield* SynchronizedRef.modifyEffect(
    state,                    // 共享状态
    function* (data) {        // 原子操作块
      // 这里执行的代码不会被其他 Fiber 打断
      const account = new Account({ ... })
      const next = {
        ...data,
        accounts: { ...data.accounts, [account.id]: account },
        active: { ...data.active, [input.serviceID]: account.id },
      }
      yield* write(next)      // 持久化到磁盘
      return [account, next]  // [返回值, 新状态]
    },
  )
})
```

**SynchronizedRef vs Java 的 synchronized**：

| Java | Effect | 说明 |
|------|--------|------|
| `synchronized` 块 | `SynchronizedRef.modifyEffect` | 原子操作 |
| `ReentrantReadWriteLock` | `SynchronizedRef` + `get` | 读写分离 |
| `synchronized(this)` | 不需要，Effect Fiber 是协作式的 | 没有死锁风险 |
| `AtomicReference` | `SynchronizedRef` | 不可变更新 |

---

## 5.5 版本迁移：v1 → v2

### 5.5.1 为什么需要迁移

旧版本的 Auth 数据是简单的键值对格式，不支持多账户：

```typescript
// v1 格式（旧版本）
{
  "anthropic": { "type": "api", "key": "sk-ant-xxx" },
  "openai": { "type": "api", "key": "sk-proj-yyy" }
}

// v2 格式（当前版本，支持多账户）
{
  "version": 2,
  "accounts": {
    "acc_001": {
      "id": "acc_001",
      "serviceID": "anthropic",
      "description": "default",
      "credential": { "type": "api", "key": "sk-ant-xxx" }
    },
    "acc_002": {
      "id": "acc_002",
      "serviceID": "openai",
      "description": "default",
      "credential": { "type": "api", "key": "sk-proj-yyy" }
    }
  },
  "active": {
    "anthropic": "acc_001",
    "openai": "acc_002"
  }
}
```

### 5.5.2 迁移逻辑

```typescript
// packages/core/src/auth.ts:61-80
function migrate(old: Record<string, unknown>): Writable {
  const accounts: Record<string, Account> = {}
  const active: Record<string, AccountID> = {}

  for (const [serviceID, value] of Object.entries(old)) {
    // 解析旧格式的凭证
    const parsed = decodeV1({ [serviceID]: value })?.[serviceID]
    if (!parsed) continue

    // 创建新格式的 Account
    const id = Identifier.ascending()
    const accountID = AccountID.make(id)
    accounts[id] = new Account({
      id: accountID,
      serviceID: ServiceID.make(serviceID),
      description: "default",
      credential: parsed,
    })
    active[serviceID] = accountID
  }

  return { version: 2, accounts, active }
}
```

### 5.5.3 自动检测流程

```typescript
const load = Effect.fnUntraced(function* () {
  // 1. 环境变量：CI/CD 注入
  if (process.env.OPENCODE_AUTH_CONTENT) {
    const raw = JSON.parse(process.env.OPENCODE_AUTH_CONTENT)
    if (raw.version === 2) return raw       // 已经是 v2
    return migrate(raw)                       // v1 → v2 迁移
  }

  // 2. 旧版文件 auth.json
  const legacy = yield* fsys.readJson("auth.json")
  if (legacy) return migrate(legacy)

  // 3. 新版文件 auth-v2.json
  const raw = yield* fsys.readJson("auth-v2.json")
  if (raw?.version === 2) return raw

  // 4. 都没有 → 空数据
  return { version: 2, accounts: {}, active: {} }
})
```

---

## 5.6 ⚠️ 常见错误

**错误 1：创建账户后忘记持久化**

AuthV2 使用 `SynchronizedRef` 管理内存中的状态，并自动持久化到 `auth-v2.json`。但如果你**直接修改**了 `state` 而不是通过 `SynchronizedRef.modifyEffect`，修改只会在内存中生效，重启后丢失。

```typescript
// ❌ 错误：直接修改内部状态
const state = SynchronizedRef.makeUnsafe(loaded)
state.accounts["new_acc"] = newAccount  // 只改内存，没写磁盘

// ✅ 正确：通过 Service 方法修改
yield* AuthV2.Service.create({
  serviceID: ServiceID.make("anthropic"),
  credential: new ApiKeyCredential({ type: "api", key: "sk-xxx" }),
})
// → 自动 modifyEffect → 持久化
```

**错误 2：忘记品牌类型——在函数签名中用 string 代替品牌类型**

```typescript
// ❌ 错误——品牌类型白定义了
function getAccount(id: string) { ... }  // 用 string 代替 AccountID
// 调用者还是可以传任何字符串

// ✅ 正确——函数签名使用品牌类型
function getAccount(id: AccountID) { ... }
```

---

## 5.7 试试看

**练习**：实现一个简化的凭证管理系统，支持两个提供商（anthropic 和 openai）的 API Key 管理。

1. 定义 Account 和 ApiKeyCredential 的 Schema
2. 实现 `create` 和 `active` 两个方法（用 `SynchronizedRef`）
3. 验证：创建两个账户后，`active("anthropic")` 返回正确的账户
4. 验证：创建账户时 `active: true` 是否正确设置了默认账户

**期望输出**：

```typescript
const auth = createAuthManager()
yield* auth.create({ serviceID: "anthropic", key: "sk-ant-xxx", active: true })
yield* auth.create({ serviceID: "openai", key: "sk-proj-yyy", active: true })

const current = yield* auth.active("anthropic")
// current.key === "sk-ant-xxx" ✅
```

---

## 5.8 本章小结

| Java 概念 | AuthV2 对应 | 优势 |
|-----------|------------|------|
| `ConcurrentHashMap` | `SynchronizedRef` | 不可变更新，无锁竞争 |
| 多个账户/提供商 | `accounts` + `active` 映射 | 灵活的多对多关系 |
| `instanceof ApiKeyCredential` | `credential.type === "api"` | 联合类型编译期安全 |
| 数据迁移脚本 | `migrate()` 函数 | 自动在加载时执行 |
| `enum CredentialType` | `Schema.Literal("api"\|"oauth")` | 自动联合类型 |

**下一章预告**：AISDK——如何用一个统一的接口对接 20+ AI 提供商。