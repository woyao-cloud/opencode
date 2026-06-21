# @opencode/DataMigration — 数据迁移服务
> 婧愭枃浠? `opencode/packages/opencode/src/data-migration.ts`

## 概述

`@opencode/DataMigration` 是 OpenCode 的**数据库数据迁移服务**，负责在应用启动时执行必要的数据修复和迁移任务。它通过 `data_migration` 表追踪已完成的迁移，确保每个迁移只执行一次，并在后台 Fiber 中以可恢复的方式运行，不阻塞应用启动流程。

### 依赖的 Services

`DataMigration` 不通过 Effect `yield*` 依赖其他 Service，而是直接使用全局的 `Database.use()` 和 `Database.transaction()` 函数操作 SQLite 数据库，以及 `Effect.sleep` 等 Effect 原语。

```typescript
// data-migration.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const migrations: Migration[] = [
      // 迁移定义...
    ]
    // 执行迁移...
    return Service.of({})
  }),
)

export const defaultLayer = layer
```

## 核心接口

```typescript
export type Migration<R = never> = {
  name: string
  run: Effect.Effect<void, unknown, R>
}

export interface Interface {}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/DataMigration") {}
```

`DataMigration` 的接口为空（`Interface {}`），它不对外暴露任何方法。所有迁移逻辑在 `layer` 构造时自动执行，对调用方完全透明。

## 数据结构

### 迁移追踪表

```typescript
export const DataMigrationTable = sqliteTable("data_migration", {
  name: text().primaryKey(),         // 迁移名称（主键）
  time_completed: integer().notNull(), // 完成时间戳（毫秒）
})
```

### 迁移定义

```typescript
export type Migration<R = never> = {
  name: string
  run: Effect.Effect<void, unknown, R>
}
```

每个迁移包含一个唯一名称和一个 `run` Effect，运行结果无返回值（`void`），失败类型为 `unknown`。

## 关键实现细节

### 迁移执行流程

1. 在 `layer` 构造时，遍历 `migrations` 数组
2. 对每个迁移，查询 `data_migration` 表检查是否已完成（`name` 已存在则跳过）
3. 未完成的迁移通过 `migration.run` 执行
4. 执行成功后向 `data_migration` 表插入完成记录（`onConflictDoNothing` 防止重复）
5. 整个迁移过程在 `forkScoped` 中异步运行，不阻塞应用启动

```typescript
yield* Effect.gen(function* () {
  if (migrations.length === 0) return

  for (const migration of migrations) {
    const completed = Database.use((db) =>
      db.select({ name: DataMigrationTable.name })
        .from(DataMigrationTable)
        .where(eq(DataMigrationTable.name, migration.name))
        .get(),
    )
    if (completed) continue

    log.info("running data migration", { name: migration.name })
    yield* migration.run.pipe(Effect.withSpan("DataMigration", { attributes: { name: migration.name } }))
    Database.use((db) =>
      db.insert(DataMigrationTable)
        .values({ name: migration.name, time_completed: Date.now() })
        .onConflictDoNothing()
        .run(),
    )
  }
}).pipe(
  Effect.tapCause((cause) =>
    Effect.logError("failed to run data migrations").pipe(Effect.annotateLogs("cause", cause)),
  ),
  Effect.ignore,       // 迁移失败不阻断应用
  Effect.forkScoped,   // 在后台 Fiber 中运行
)
```

### 错误处理

迁移过程采用多层容错：

- **`Effect.ignore`**：迁移失败不抛出错误，不阻断应用启动
- **`Effect.tapCause`**：失败时记录详细日志（含 cause），便于排查
- **`Effect.forkScoped`**：在后台 Fiber 中运行，不阻塞 layer 构造

### 当前迁移：session_usage_from_messages

目前仅有一个迁移任务 `session_usage_from_messages`，用于从 `message` 表的 JSON 数据中提取使用量统计并回填到 `session` 表：

**目的**：将存储在 `message.data` JSON 字段中的 token 使用量和成本信息，聚合计算后写入 `session` 表的对应列。

**执行方式**：分页处理，每页 100 个 session，通过游标（cursor）遍历：

```typescript
for (let cursor: SessionID | undefined, page = 1; ; page++) {
  const next = yield* Effect.gen(function* () {
    const sessions = yield* Effect.sync(() =>
      Database.use((db) =>
        db.select({ id: SessionTable.id })
          .from(SessionTable)
          .where(cursor ? gt(SessionTable.id, cursor) : undefined)
          .orderBy(asc(SessionTable.id))
          .limit(100)
          .all(),
      ),
    )
    if (sessions.length === 0) return
    // 聚合 message 表中的使用量...
    // 更新 session 表...
    return sessions.at(-1)?.id
  })
  if (!next) return
  cursor = next
  yield* Effect.sleep("10 millis")  // 批次间暂停 10ms
}
```

**聚合逻辑**：

- 从 `message` 表按 `session_id` 分组，筛选 `role = 'assistant'` 的消息
- 使用 `json_extract` SQL 函数从 `data` JSON 字段提取 `cost`、`tokens.input`、`tokens.output`、`tokens.reasoning`、`tokens.cache.read`、`tokens.cache.write`
- 使用 `COALESCE(SUM(...), 0)` 聚合计算
- 在事务中批量更新 `session` 表

## 关键设计决策

1. **幂等迁移**：通过 `data_migration` 表追踪已完成的迁移，`onConflictDoNothing` 和启动时的 `completed` 检查双重保障，确保每个迁移只执行一次

2. **后台 Fiber 执行**：迁移在 `forkScoped` 中运行，不阻塞应用启动，用户可以在迁移执行期间正常使用应用

3. **容错设计**：迁移失败使用 `Effect.ignore` 忽略，通过 `tapCause` 记录错误日志，不会导致应用启动失败

4. **分页批量处理**：大型迁移（如 `session_usage_from_messages`）使用分页 + 游标模式，每批 100 条记录，批次间暂停 10ms，避免长时间锁定数据库

5. **可恢复性**：每批处理完成后游标递增，如果迁移中断（进程退出），下次启动时从未完成的位置继续

6. **空接口设计**：`Interface {}` 表明该 Service 不对外暴露任何方法，纯粹通过 side effect 发挥作用，对外部调用方完全透明

7. **迁移定义数组模式**：所有迁移以 `Migration[]` 数组形式声明在 layer 内部，便于添加新迁移（只需追加数组元素）
