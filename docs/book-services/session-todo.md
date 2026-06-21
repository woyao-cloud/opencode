# @opencode/SessionTodo — 会话任务列表服务

**源文件**: `packages/opencode/src/session/todo.ts`
**标识符**: `@opencode/SessionTodo`

---

## 依赖

| 依赖 | 来源 | 说明 |
|------|------|------|
| Bus | `@opencode/Bus` | 事件总线，用于发布任务更新事件 |

SessionTodo 是依赖最少的服务之一，仅依赖 Bus 进行事件通知。数据库操作通过 Drizzle ORM 的 TodoTable 直接完成，不经过 Storage 服务。

---

## 服务接口

```typescript
export namespace SessionTodo {
  export interface Service {
    update: (input: UpdateInput) => Effect.Effect<Info[], never, Bus>
    get: (sessionId: string) => Effect.Effect<Info[], never, Bus>
  }
}
```

### update

**全量替换式更新**。在单个事务中：先删除指定会话的所有现有 todo，再按传入顺序逐条插入新 todo（position 字段记录插入顺序）。完成后发布 `Event.Updated` 到总线。

- **输入**: `UpdateInput` — 包含 `sessionId` 和 `todos: Info[]`
- **返回**: 插入后的 `Info[]`（含自增 id）
- **行为**: 事务性全部替换，非增量合并。调用方负责传入完整的期望状态。

### get

读取指定会话的全部 todo，按 `position` 升序排列。

- **输入**: `sessionId: string`
- **返回**: 排序后的 `Info[]`

---

## 数据模型

```typescript
export interface Info {
  id: number
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority: "high" | "medium" | "low"
}
```

### Todo 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `number` | 自增主键，由数据库自动分配 |
| `content` | `string` | 任务描述文本 |
| `status` | 枚举 | `pending` / `in_progress` / `completed` / `cancelled` |
| `priority` | 枚举 | `high` / `medium` / `low` |

### 数据库表 (TodoTable)

底层通过 Drizzle ORM 的 `todoTable` 持久化到 SQLite。表结构在 `packages/opencode/src/session/data.ts` 中定义，SessionTodo 直接引用该表进行读写，不通过 Storage 抽象层。

---

## 事件

| 事件 | 触发时机 | 载荷 |
|------|----------|------|
| `Event.Updated` | 每次 `update()` 完成后 | 包含 `sessionId` 和更新后的 `Info[]` |

`get()` 不触发任何事件。

---

## 实现要点

### 事务性全量替换

`update()` 的核心逻辑：

1. `Effect.sync` 包装同步 Drizzle 操作
2. 开启事务：`DELETE FROM todo WHERE session_id = ?`
3. 逐条 `INSERT INTO todo`，position 按数组索引递增
4. 提交事务
5. 发布 `Event.Updated`

这意味着调用方不能只传变更项——必须传入会话完整的目标 todo 列表。如果传入空数组，则清空该会话的所有 todo。

### Effect.sync 包装

由于 Drizzle ORM 的 SQLite 操作是同步的，所有数据库调用通过 `Effect.sync(() => db.xxx(...))` 包装为 Effect，确保副作用被正确追踪且不会阻塞 Effect 运行时。

### 直接使用 Database

SessionTodo 不通过 `@opencode/Storage` 服务访问数据库，而是直接导入 Drizzle 的 `db` 实例和 `todoTable` 定义。这是一种有意的设计选择——todo 数据量小、查询简单，绕过 Storage 抽象减少了间接层。

---

## 架构位置

```
@opencode/SessionTodo
  └── 依赖: Bus (事件发布)
  └── 直接依赖: Drizzle db + todoTable (数据库)
  └── 无下游消费者依赖此服务
```

SessionTodo 是会话层的叶节点服务：它被上层（如 Agent 工具调用）消费以读写任务列表，但它自身不依赖任何其他会话级服务。事件通过 Bus 广播给订阅者（如 UI 面板）。
