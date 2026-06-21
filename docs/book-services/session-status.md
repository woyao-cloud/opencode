# @opencode/SessionStatus — 会话状态追踪服务
> 婧愭枃浠? `opencode/packages/opencode/src/session/status.ts`

## 概述

`@opencode/SessionStatus` 是 OpenCode 的**会话状态追踪服务**，负责管理每个会话（Session）的运行时状态。它基于 Effect 框架实现，对外暴露为 Effect Service，使用内存 `Map` 按 `SessionID` 存储状态，是控制台 UI 渲染会话状态指示器的数据源。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Bus` | `@opencode/Bus` | 事件总线，状态变更时发布 `Status` 和 `Idle` 事件 |

```typescript
// status.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service    // 事件发布
  // ...
}))

export const defaultLayer = layer.pipe(
  Layer.provide(Bus.defaultLayer),
)
```

`SessionStatus` 是最精简的服务之一，仅依赖 `Bus` 用于事件发布。状态数据完全存储在当前进程内存中，无外部持久化。

## 核心接口

```typescript
export interface Interface {
  readonly get: (sessionID: string) => Effect.Effect<Info>       // 获取指定会话的状态
  readonly list: () => Effect.Effect<Record<string, Info>>        // 获取所有会话的状态快照
  readonly set: (sessionID: string, info: Info) => Effect.Effect<void>  // 设置会话状态并发布事件
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/SessionStatus") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取会话状态
yield* SessionStatus.Service.get(sessionID)

// 设置会话状态为 busy
yield* SessionStatus.Service.set(sessionID, { type: "busy" })

// 列出所有会话状态
yield* SessionStatus.Service.list()
```

## 数据结构

### Info（联合类型）

`Info` 是三种状态的联合类型，表示会话当前处于的运行模式：

```typescript
type Info = 
  | { type: "idle" }                                          // 空闲状态（默认）
  | { type: "busy" }                                          // 忙碌状态（LLM 正在流式处理）
  | { type: "retry"; attempt: number; message: string; action?: RetryAction; next?: number }
                                                              // 重试状态（瞬时失败，包含重试信息）
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `"idle" \| "busy" \| "retry"` | 状态类型标识 |
| `attempt` | `number`（仅 retry） | 当前重试次数 |
| `message` | `string`（仅 retry） | 失败原因或提示信息 |
| `action` | `RetryAction?`（仅 retry） | 重试操作描述，包含 `reason`、`provider`、`title`、`label`、`link` |
| `next` | `number?`（仅 retry） | 下次重试的时间戳（毫秒） |

### RetryAction

重试操作携带可展示给用户的交互信息：

```typescript
interface RetryAction {
  reason: string     // 失败原因
  provider: string   // AI Provider 标识
  title: string      // 操作标题
  label: string      // 按钮/操作标签
  link?: string      // 可选的跳转链接
}
```

### Event

状态变更时通过 `Bus` 发布的事件：

```typescript
type Event = 
  | { type: "Status"; info: Info }   // 通用状态变更事件
  | { type: "Idle" }                 // 进入空闲状态事件（已弃用，保留向后兼容）
```

## 工作流程

### 状态生命周期

```
idle ────────────────────────────────────────────────────────────── 默认状态
  │
  ├──▶ busy ─────────────────────────────────────────────────────── LLM 处理中
  │       │
  │       └──▶ idle ─────────────────────────────────────────────── 处理完成
  │
  └──▶ retry ────────────────────────────────────────────────────── 瞬时失败
          │
          ├──▶ busy ─────────────────────────────────────────────── 重试触发
          │
          └──▶ idle ─────────────────────────────────────────────── 放弃重试
```

### set() 流程

```
set(sessionID, info)
  ├── 1. 将 info 写入内存 Map（key = sessionID）
  ├── 2. 发布 Status 事件到 Bus
  │       └── Bus.publish({ type: "Status", info })
  ├── 3. 若 info.type === "idle"
  │       ├── 发布 Idle 事件到 Bus（已弃用，向后兼容）
  │       │     └── Bus.publish({ type: "Idle" })
  │       └── 从 Map 中删除该 sessionID 条目
  └── 返回 void
```

关键行为：
- **busy / retry 状态**：写入 Map 并保留，后续 `get()` 和 `list()` 可查询到
- **idle 状态**：发布事件后立即从 Map 中移除，节省内存。`get()` 对不存在的 key 返回 `{ type: "idle" }` 作为默认值

### get() 流程

```
get(sessionID)
  ├── 查找 Map 中 key = sessionID 的条目
  ├── 若存在 → 返回对应的 Info
  └── 若不存在 → 返回 { type: "idle" }（默认值）
```

`get()` 永远不返回 `undefined`，未记录的会话始终被视为 idle。

### list() 流程

```
list()
  └── 返回 Map 的浅拷贝副本（Record<string, Info>）
```

返回的是副本而非引用，外部修改不影响内部状态。

## 关键设计决策

1. **Effect Service 模式**：使用 Effect 的 `Context.Service` 实现依赖注入，所有状态访问都通过 Effect 生成器，天然支持并发和资源管理

2. **最小化依赖**：仅依赖 `Bus` 一个服务，无文件系统、无网络、无认证。状态完全在进程内存中，服务启动无任何 I/O 开销

3. **idle 即默认，idle 即清理**：未在 Map 中的会话一律视为 idle，`set(idle)` 后立即删除条目。这一设计避免了 Map 随会话数量无限增长——只有活跃（busy/retry）的会话才占用内存

4. **事件驱动的 UI 更新**：每次 `set()` 都通过 `Bus` 发布事件，控制台 UI 订阅这些事件即可实时更新状态指示器，无需轮询

5. **向后兼容的 Idle 事件**：除统一的 `Status` 事件外，idle 状态额外发布 `Idle` 事件，兼容旧版订阅者。新代码应统一订阅 `Status` 事件

6. **线程安全由 Effect 保证**：Effect 运行时确保 `Map` 的读写操作不会出现竞态，无需额外的锁机制
