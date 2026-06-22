# @opencode/SessionShare — 会话分享服务
> 源文件: `opencode/packages/opencode/src/share/session.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/share/session.ts`

## 概述

`@opencode/SessionShare` 是会话分享功能的高层服务，封装了 Session 创建、分享 URL 生成和取消分享的完整流程。它在 `Session` 和 `ShareNext` 之间充当编排层，自动处理分享行为的配置检查、事件同步和错误处理。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 读取 `share` 配置（`"manual"` / `"auto"` / `"disabled"`） |
| `Session` | `@opencode/Session` | 创建会话 |
| `ShareNext` | `@opencode/ShareNext` | 底层分享 API 通信和数据同步 |
| `SyncEvent` | `@opencode/SyncEvent` | 发布 Session 更新事件 |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 功能开关（`autoShare` 标志） |

```typescript
// session.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const cfg = yield* Config.Service
  const session = yield* Session.Service
  const shareNext = yield* ShareNext.Service
  const sync = yield* SyncEvent.Service
  const flags = yield* RuntimeFlags.Service
  // ...
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly create: (input?: Session.CreateInput) => Effect.Effect<Session.Info>
  readonly share: (sessionID: SessionID) => Effect.Effect<{ url: string }, unknown>
  readonly unshare: (sessionID: SessionID) => Effect.Effect<void, unknown>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/SessionShare") {}
```

使用示例：

```typescript
// 创建会话（自动分享模式会自动触发分享）
const session = yield* SessionShare.Service.create({ title: "My Session" })

// 手动分享
const { url } = yield* SessionShare.Service.share(session.id)

// 取消分享
yield* SessionShare.Service.unshare(session.id)
```

## 数据结构

| 类型 | 说明 |
|------|------|
| `Session.Info` | 会话信息（来自 `@opencode/Session`） |
| `Session.CreateInput` | 会话创建输入（来自 `@opencode/Session`） |
| `SessionID` | 会话 ID 类型（来自 `@/session/schema`） |

## 关键实现细节

### create 流程

```
create(input?)
  ├── 1. session.create(input) → 创建会话
  ├── 2. 如果有 parentID（子会话），直接返回（不分享）
  ├── 3. 检查配置：
  │     ├── flags.autoShare → 自动分享
  │     ├── config.share === "auto" → 自动分享
  │     └── 其他 → 不分享
  └── 4. 如果应自动分享：
        └── share(id).pipe(Effect.ignore, Effect.forkIn(scope))
           （后台异步分享，失败不影响会话创建）
```

关键点：`share` 以 `forkIn(scope)` 在独立 Scope 中异步执行，失败时通过 `Effect.ignore` 静默忽略，确保分享失败不会阻塞会话创建流程。

### share 流程

```
share(sessionID)
  ├── 1. 检查 config.share !== "disabled"
  │     └── 如果禁用 → 抛出 "Sharing is disabled in configuration"
  ├── 2. shareNext.create(sessionID) → 调用底层 API 创建分享
  └── 3. sync.run(Session.Event.Updated, { sessionID, info: { share: { url: result.url } } })
       → 更新 Session 的 share URL
```

### unshare 流程

```
unshare(sessionID)
  ├── 1. shareNext.remove(sessionID) → 调用底层 API 删除分享
  └── 2. sync.run(Session.Event.Updated, { sessionID, info: { share: { url: null } } })
       → 清除 Session 的 share URL
```

### 配置驱动的分享行为

| `config.share` | `flags.autoShare` | 行为 |
|----------------|-------------------|------|
| `"auto"` | 任意 | 创建会话时自动分享 |
| `"manual"` | `true` | 创建会话时自动分享 |
| `"manual"` | `false` | 仅手动调用 `share()` |
| `"disabled"` | 任意 | `share()` 调用时抛出错误 |

### SyncEvent 集成

分享和取消分享操作通过 `SyncEvent` 发布 `Session.Event.Updated` 事件，更新会话的 `share.url` 字段。这确保其他模块（如 UI、Sync 同步）能感知到分享状态的变化。

## 关键设计决策

1. **编排层模式**：`SessionShare` 是 Session + ShareNext 的编排层，处理配置检查、事件同步和错误处理，避免这些横切关注点散布在底层模块中

2. **自动分享非阻塞**：自动分享以 `forkIn` 异步执行，失败不影响会话创建，确保分享功能是可选的增强而非必需的依赖

3. **子会话不分享**：有 `parentID` 的子会话（如 fork 的会话）不触发自动分享，只有顶层会话才会分享

4. **双重开关**：`config.share` 和 `flags.autoShare` 两个开关控制自动分享行为，支持配置文件和运行时标志的灵活组合

5. **事件驱动状态同步**：通过 `SyncEvent` 而非直接修改 Session 状态来更新 share URL，保持单向数据流
