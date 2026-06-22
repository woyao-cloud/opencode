# @opencode/AccountRepo — 账户持久化服务
> 源文件: `opencode/packages/opencode/src/account/repo.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/account/repo.ts`

## 概述

`@opencode/AccountRepo` 是 OpenCode 的**账户数据持久化层**，负责管理 SQLite 数据库中的账户表（`account`）和账户状态表（`account_state`）。它向上层 `@opencode/Account` 提供 CRUD 操作，封装了所有数据库访问细节，包括事务、冲突处理和活跃账户追踪。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Database` | `@/storage/db` | SQLite 数据库访问（Drizzle ORM） |

```typescript
// repo.ts layer 定义
export const layer: Layer.Layer<Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    // 直接使用 Database.use / Database.transaction
    // 无需显式 yield* 其他 Service
    // ...
  }),
)
```

`AccountRepo` 不通过 Effect `yield*` 依赖其他 Service，而是直接调用 `Database.use()` 和 `Database.transaction()` 全局函数。

## 核心接口

```typescript
export interface Interface {
  readonly active: () => Effect.Effect<Option.Option<Info>, AccountRepoError>
  readonly list: () => Effect.Effect<Info[], AccountRepoError>
  readonly remove: (accountID: AccountID) => Effect.Effect<void, AccountRepoError>
  readonly use: (accountID: AccountID, orgID: Option.Option<OrgID>) => Effect.Effect<void, AccountRepoError>
  readonly getRow: (accountID: AccountID) => Effect.Effect<Option.Option<AccountRow>, AccountRepoError>
  readonly persistToken: (input: {
    accountID: AccountID
    accessToken: AccessToken
    refreshToken: RefreshToken
    expiry: Option.Option<number>
  }) => Effect.Effect<void, AccountRepoError>
  readonly persistAccount: (input: {
    id: AccountID
    email: string
    url: string
    accessToken: AccessToken
    refreshToken: RefreshToken
    expiry: number
    orgID: Option.Option<OrgID>
  }) => Effect.Effect<void, AccountRepoError>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/AccountRepo") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取当前活跃账户
const active = yield* AccountRepo.Service.active()

// 列出所有账户
const accounts = yield* AccountRepo.Service.list()

// 切换活跃账户
yield* AccountRepo.Service.use(accountId, Option.none())

// 移除账户
yield* AccountRepo.Service.remove(accountId)
```

## 数据结构

### 数据库表

**`account` 表**（`AccountTable`）：

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | `text` (PK) | 账户 ID（品牌化 `AccountID`） |
| `email` | `text` | 用户邮箱 |
| `url` | `text` | Console 服务端 URL |
| `access_token` | `text` | 访问令牌（品牌化 `AccessToken`） |
| `refresh_token` | `text` | 刷新令牌（品牌化 `RefreshToken`） |
| `token_expiry` | `integer` | Token 过期时间戳（毫秒） |
| `time_created` | `text` | 创建时间 |
| `time_updated` | `text` | 更新时间 |

**`account_state` 表**（`AccountStateTable`）：

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | `integer` (PK) | 固定为 `1`（单行状态表） |
| `active_account_id` | `text` (FK → account.id) | 当前活跃账户 ID |
| `active_org_id` | `text` | 当前活跃组织 ID（品牌化 `OrgID`） |

### 导出类型

```typescript
export type AccountRow = (typeof AccountTable)["$inferSelect"]
```

`AccountRow` 是 Drizzle ORM 从 `AccountTable` 自动推导的查询结果类型，包含数据库中的所有列。

## 关键实现细节

### 数据库操作模式

所有数据库操作通过两种模式执行：

- **`query`**：使用 `Database.use()`，直接执行查询操作
- **`tx`**：使用 `Database.transaction()`，在事务中执行写操作

错误统一捕获并包装为 `AccountRepoError`：

```typescript
const query = <A>(f: DbTransactionCallback<A>) =>
  Effect.try({
    try: () => Database.use(f),
    catch: (cause) => new AccountRepoError({ message: "Database operation failed", cause }),
  })

const tx = <A>(f: DbTransactionCallback<A>) =>
  Effect.try({
    try: () => Database.transaction(f),
    catch: (cause) => new AccountRepoError({ message: "Database operation failed", cause }),
  })
```

### 活跃账户管理

使用**单行状态表**模式：`account_state` 表固定只有一行（`id = 1`），存储当前活跃账户 ID 和组织 ID。`use()` 方法使用 `onConflictDoUpdate`（UPSERT）更新该行。

`active()` 方法通过 JOIN 逻辑读取活跃账户：

```typescript
const current = (db: DbClient) => {
  const state = db.select().from(AccountStateTable)
    .where(eq(AccountStateTable.id, ACCOUNT_STATE_ID)).get()
  if (!state?.active_account_id) return
  const account = db.select().from(AccountTable)
    .where(eq(AccountTable.id, state.active_account_id)).get()
  if (!account) return
  return { ...account, active_org_id: state.active_org_id ?? null }
}
```

### 账户持久化

`persistAccount()` 使用 `onConflictDoUpdate` 实现 INSERT OR UPDATE 语义：

- 新账户：插入完整记录
- 已存在的账户：更新 email、url、access_token、refresh_token、token_expiry

同时在事务中调用 `state()` 将新账户设为活跃：

```typescript
const persistAccount = Effect.fn("AccountRepo.persistAccount")((input) =>
  tx((db) => {
    const url = normalizeServerUrl(input.url)
    db.insert(AccountTable).values({...}).onConflictDoUpdate({...}).run()
    void state(db, input.id, input.orgID)
  }).pipe(Effect.asVoid),
)
```

### Token 刷新

`persistToken()` 仅更新 token 相关字段（`access_token`、`refresh_token`、`token_expiry`），不修改其他账户信息。使用 `query` 而非 `tx`，因为这是单表更新操作。

### 账户移除

`remove()` 在事务中执行两步操作：
1. 清理 `account_state` 中的活跃引用（将匹配的 `active_account_id` 设为 null）
2. 从 `account` 表删除记录

这防止了外键约束导致的状态不一致。

## 关键设计决策

1. **单行状态表**：`account_state` 固定只有一行（`id = 1`），简化活跃账户追踪，避免多行状态管理复杂性

2. **UPSERT 语义**：`persistAccount` 和 `use` 使用 `onConflictDoUpdate` 实现 INSERT OR UPDATE，避免先查后写的竞态条件

3. **品牌化类型的数据库映射**：Drizzle ORM 的 `$type<>()` 泛型将品牌化类型映射到 SQLite 基础类型，编译时类型安全，运行时存储为普通字符串/整数

4. **事务中维护外键一致性**：`remove()` 在事务中先清理引用再删除记录，`persistAccount()` 在事务中同时写入账户和更新活跃状态

5. **Schema 解码校验**：`active()` 和 `list()` 从数据库读取后通过 `Schema.decodeUnknownSync(Info)` 进行校验，确保数据完整性
