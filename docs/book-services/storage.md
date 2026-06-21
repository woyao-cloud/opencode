# @opencode/Storage — 持久化存储服务
> 婧愭枃浠? `opencode/packages/opencode/src/storage/storage.ts`

## 概述

`@opencode/Storage` 提供基于 JSON 文件的持久化存储层，支持 CRUD 操作（读、写、更新、删除）和列表查询。它使用文件系统存储数据（每个 key 对应一个 `.json` 文件），通过 `TxReentrantLock` 实现读写锁保护，并内置数据迁移框架支持存储格式的版本演进。

该服务是 Session、Message、Part 等核心数据的持久化基础，所有会话数据最终都通过该服务写入磁盘。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件读写、目录创建、文件 glob |
| `Git` | `@opencode/Git` | 数据迁移阶段用于 Git 操作 |

```typescript
// storage.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service
  const git = yield* Git.Service
  // ...
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly remove: (key: string[]) => Effect.Effect<void, AppFileSystem.Error>
  readonly read: <T>(key: string[]) => Effect.Effect<T, Error>
  readonly update: <T>(key: string[], fn: (draft: T) => void) => Effect.Effect<T, Error>
  readonly write: <T>(key: string[], content: T) => Effect.Effect<void, AppFileSystem.Error>
  readonly list: (prefix: string[]) => Effect.Effect<string[][], AppFileSystem.Error>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Storage") {}
```

使用示例：

```typescript
// 写入
yield* Storage.Service.write(["session", projectID, sessionID], sessionData)

// 读取
const data = yield* Storage.Service.read<SessionInfo>(["session", projectID, sessionID])

// 原子更新
yield* Storage.Service.update<SessionInfo>(["session", projectID, sessionID], (draft) => {
  draft.summary.additions += 10
})

// 删除
yield* Storage.Service.remove(["session", projectID, sessionID])

// 列出所有 session
const keys = yield* Storage.Service.list(["session", projectID])
```

## 数据结构

### 错误类型

```typescript
export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("NotFoundError", {
  message: Schema.String,
})
export type Error = AppFileSystem.Error | NotFoundError
```

### 文件 Schema（迁移时使用）

| Schema | 说明 |
|--------|------|
| `RootFile` | `{ path?: { root?: string } }` — 旧版消息文件格式 |
| `SessionFile` | `{ id: string }` — 旧版 session 格式 |
| `MessageFile` | `{ id: string }` — 旧版消息格式 |
| `DiffFile` | `{ additions: number; deletions: number }` — diff 统计 |
| `SummaryFile` | `{ id, projectID, summary: { diffs: DiffFile[] } }` — 旧版 summary 格式 |

### 迁移函数签名

```typescript
type Migration = (dir: string, fs: AppFileSystem.Interface, git: Git.Interface) => Effect.Effect<void, AppFileSystem.Error>
```

## 关键实现细节

### 文件路径映射

存储使用扁平化的文件路径结构，key 数组映射为文件系统路径：

```typescript
function file(dir: string, key: string[]) {
  return path.join(dir, ...key) + ".json"
}
```

例如 `["session", "abc123", "ses_xyz"]` → `<storage_dir>/session/abc123/ses_xyz.json`

### 读写锁

每个文件级别的读写锁通过 `RcMap` + `TxReentrantLock` 实现：

```typescript
const locks = yield* RcMap.make({
  lookup: () => TxReentrantLock.make(),
  idleTimeToLive: 0,
})

// 读操作
TxReentrantLock.withReadLock(rw, wrap(target, fs.readJson(target)))

// 写操作
TxReentrantLock.withWriteLock(rw, writeJson(target, content))
```

- `withReadLock`：允许多个并发读
- `withWriteLock`：互斥写，阻止并发读写
- `RcMap` 自动管理锁的生命周期，idle 的锁会被回收

### 错误处理

统一的错误处理模式：

```typescript
function missing(err: unknown) {
  // 检查是否为 ENOENT（文件不存在）或 NotFound 错误
  if ("code" in err && err.code === "ENOENT") return true
  if ("reason" in err && err.reason?._tag === "NotFound") return true
  return false
}

const wrap = <A>(target, body) =>
  body.pipe(Effect.catchIf(missing, () => fail(target)))
```

- `read`/`update`：文件不存在时返回 `NotFoundError`
- `write`：自动创建父目录（`writeWithDirs`）
- `remove`：文件不存在时静默忽略
- `list`：目录不存在时返回空数组

### update 的原子操作

```typescript
const update = <T>(key: string[], fn: (draft: T) => void) =>
  Effect.gen(function* () {
    const value = yield* withResolved(key, (target, rw) =>
      TxReentrantLock.withWriteLock(rw, Effect.gen(function* () {
        const content = yield* wrap(target, fs.readJson(target))
        fn(content as T)              // 用户函数修改 draft
        yield* writeJson(target, content)  // 写回
        return content
      })),
    )
    return value as T
  })
```

整个读-改-写操作在写锁保护下原子执行，防止并发修改导致数据丢失。

### 数据迁移

内置两个迁移步骤，按序号顺序执行，进度记录在 `migration` 标记文件中：

```
MIGRATIONS[0] — 旧版 project 目录结构迁移
  ├── 遍历 storage/project/ 下的项目目录
  ├── 从消息文件中提取 worktree 路径
  ├── 通过 git rev-list 获取 project root commit ID
  ├── 创建 project/<id>.json
  ├── 迁移 session/info/*.json → session/<projectID>/*.json
  ├── 迁移 session/message/<id>/*.json → message/<id>/*.json
  └── 迁移 session/part/<id>/*.json → part/<id>/*.json

MIGRATIONS[1] — Session summary diff 拆分
  ├── 遍历 session/*/ 下的 summary 文件
  ├── 提取 summary.diffs 数组
  ├── 写入 session_diff/<id>.json
  └── 更新 session 文件，将 diffs 替换为 additions/deletions 汇总
```

迁移过程是容错的：如果某步失败，记录错误日志并停止后续迁移，已成功的步骤不会重复执行。

## 关键设计决策

1. **JSON 文件存储**：使用简单的 JSON 文件而非嵌入式数据库，便于调试、手动检查和跨平台兼容

2. **读写锁保护**：使用 `TxReentrantLock`（而非全局 Mutex）实现文件级别的并发控制，最大化并发读性能

3. **key 数组映射路径**：用字符串数组而非分隔符字符串作为 key，避免路径分隔符冲突和注入问题

4. **update 的 draft 模式**：类似 Immer，传入修改函数而非新值，在锁内完成原子读-改-写

5. **渐进式迁移**：通过 migration marker 文件追踪进度，支持增量升级，单步失败不阻塞后续启动

6. **RcMap 锁管理**：使用引用计数的锁 Map，idle 锁自动回收，避免内存泄漏

7. **文件不存在容错**：`remove` 和 `list` 在目标不存在时静默成功（而非报错），简化调用方逻辑
