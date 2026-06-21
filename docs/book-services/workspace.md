# @opencode/Workspace — 远程工作区同步与管理服务
> 婧愭枃浠? `opencode/packages/opencode/src/control-plane/workspace.ts`

## 概述

`@opencode/Workspace` 是 OpenCode 的**远程工作区管理服务**，负责创建、发现、同步和管理工作区（Workspace）。Workspace 是项目的一个运行实例，可以是本地 worktree、远程容器或云开发环境。该服务通过适配器模式（Adapter）支持多种工作区类型，并提供 SSE（Server-Sent Events）实时同步、会话迁移（session warp）和历史事件回放功能。

Workspace 的核心价值在于支持**跨设备协作**：用户可以在本地创建 workspace，将其会话迁移到远程环境执行，或将远程 workspace 的会话拉回本地。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Auth` | `@opencode/Auth` | 认证信息（传递给 workspace 创建环境变量） |
| `Session` | `@opencode/Session` | 会话管理（warp 时移除旧会话） |
| `SessionPrompt` | `@opencode/SessionPrompt` | 取消会话中的 prompt 流 |
| `HttpClient` | `effect/unstable/http` | HTTP 请求（SSE 连接、REST API） |
| `SyncEvent` | `@opencode/SyncEvent` | 事件同步与回放 |
| `Vcs` | `@opencode/Vcs` | VCS diff/apply（session warp 时传递文件变更） |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 实验性功能开关（`experimentalWorkspaces`） |
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统存在性检查 |
| `Project` | `@opencode/Project` | 项目信息查询 |
| `InstanceStore` | `@opencode/InstanceStore` | 为本地 workspace 提供实例上下文 |
| `InstanceBootstrap` | `@opencode/InstanceBootstrap` | 为本地 workspace 提供 bootstrap |

```typescript
// workspace.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const auth = yield* Auth.Service
  const session = yield* Session.Service
  const prompt = yield* SessionPrompt.Service
  const http = yield* HttpClient.HttpClient
  const sync = yield* SyncEvent.Service
  const vcs = yield* Vcs.Service
  const flags = yield* RuntimeFlags.Service
  const fs = yield* AppFileSystem.Service
  // ...
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly create: (input: CreateInput) => Effect.Effect<Info, CreateError>
  readonly sessionWarp: (input: SessionWarpInput) => Effect.Effect<void, SessionWarpError>
  readonly list: (project: Project.Info) => Effect.Effect<Info[]>
  readonly syncList: (project: Project.Info) => Effect.Effect<void>
  readonly get: (id: WorkspaceID) => Effect.Effect<Info | undefined>
  readonly remove: (id: WorkspaceID) => Effect.Effect<Info | undefined>
  readonly status: () => Effect.Effect<ConnectionStatus[]>
  readonly isSyncing: (workspaceID: WorkspaceID) => Effect.Effect<boolean>
  readonly waitForSync: (
    workspaceID: WorkspaceID,
    state: Record<string, number>,
    signal?: AbortSignal,
  ) => Effect.Effect<void, WaitForSyncError>
  readonly startWorkspaceSyncing: (projectID: ProjectID) => Effect.Effect<void>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Workspace") {}
```

## 数据结构

### Info

```typescript
export const Info = Schema.Struct({
  id: WorkspaceID,           // 唯一标识
  type: Schema.String,       // 工作区类型（由 adapter 定义）
  branch: Schema.String,     // 分支名（可为 null）
  name: Schema.String,       // 名称（slug）
  directory: Schema.String,  // 本地目录（可为 null，远程 workspace 无本地目录）
  extra: Schema.unknown,     // 扩展数据（adapter 特定）
  projectID: ProjectID,      // 所属项目 ID
  timeUsed: Schema.Number,   // 最后使用时间戳
})
```

### CreateInput

```typescript
export const CreateInput = Schema.Struct({
  id: Schema.optional(WorkspaceID),
  type: Info.fields.type,
  branch: Info.fields.branch,
  projectID: ProjectID,
  extra: Schema.optional(Info.fields.extra),
})
```

### ConnectionStatus

```typescript
export const ConnectionStatus = Schema.Struct({
  workspaceID: WorkspaceID,
  status: Schema.Literals(["connected", "connecting", "disconnected", "error"]),
})
```

### SessionWarpInput

```typescript
export const SessionWarpInput = Schema.Struct({
  workspaceID: Schema.NullOr(WorkspaceID),    // null 表示迁回本地
  sessionID: SessionID,
  copyChanges: Schema.optional(Schema.Boolean),  // 是否复制文件变更
})
```

### 错误类型

| 错误类 | Tag | 触发条件 |
|--------|-----|----------|
| `SyncHttpError` | `"WorkspaceSyncHttpError"` | 同步 HTTP 请求失败 |
| `WorkspaceNotFoundError` | `"WorkspaceNotFoundError"` | workspace 不存在 |
| `SessionEventsNotFoundError` | `"WorkspaceSessionEventsNotFoundError"` | 会话无事件记录 |
| `SessionWarpHttpError` | `"WorkspaceSessionWarpHttpError"` | Session warp HTTP 失败 |
| `SyncTimeoutError` | `"WorkspaceSyncTimeoutError"` | 等待同步超时 |
| `SyncAbortedError` | `"WorkspaceSyncAbortedError"` | 同步被中止 |

### 事件

| 事件 | 类型 | 说明 |
|------|------|------|
| `Event.Ready` | `"workspace.ready"` | Workspace 就绪 |
| `Event.Failed` | `"workspace.failed"` | Workspace 创建失败 |
| `Event.Status` | `"workspace.status"` | 连接状态变更 |

## 关键实现细节

### create 完整流程

```
create(input)
  ├── 1. 生成 WorkspaceID（input.id 或 WorkspaceID.ascending()）
  ├── 2. getAdapter(projectID, type) → 获取适配器
  ├── 3. WorkspaceAdapterRuntime.configure(adapter, config) → 配置 workspace
  ├── 4. 生成环境变量：
  │     ├── OPENCODE_AUTH_CONTENT = JSON.stringify(auth.all())
  │     ├── OPENCODE_WORKSPACE_ID
  │     ├── OPENCODE_EXPERIMENTAL_WORKSPACES = "true"
  │     └── OTEL_* 遥测变量透传
  ├── 5. WorkspaceAdapterRuntime.create(adapter, config, env) → 创建 workspace
  ├── 6. 并行执行：
  │     ├── waitEvent(timeout=5000ms) → 等待 Ready/Failed/Status 事件
  │     └── startSync(info) → 启动 SSE 同步
  └── 7. 返回 Info
```

### Workspace Adapter 模式

Workspace 通过适配器模式支持多种环境类型。适配器注册在 `adapters/` 目录下：

- `getAdapter(projectID, type)` — 根据项目 ID 和类型查找适配器
- `registeredAdapters(projectID)` — 获取项目注册的所有适配器
- `WorkspaceAdapterRuntime` — 适配器运行时，提供 `configure`、`create`、`remove`、`target`、`list` 方法

适配器定义 workspace 的 `Target` 类型：
- `local` — 本地 worktree（包含 `directory` 路径）
- `remote` — 远程环境（包含 `url` 和 `headers`）

### runInWorkspace — 自适应执行

`runInWorkspace` 是 Workspace 服务内部的核心工具函数，根据 workspace 类型自动选择执行路径：

```typescript
runInWorkspace({ workspaceID, local, remote, fallback, response })
  ├── workspaceID 为空 → local()（在当前环境执行）
  ├── workspace 不存在 → fallback
  ├── target.type === "local" → InstanceStore.provide({ directory }, local())
  └── target.type === "remote" → http.execute(remote({ workspace, target }))
       └── 错误处理 → log.warn + fallback
```

### SSE 同步 (syncWorkspaceLoop)

每个远程 workspace 维护一个持久的 SSE 连接，实时接收事件：

```
syncWorkspaceLoop(space)
  ├── target.type === "local" → 跳过
  └── while (true):
       ├── setStatus("connecting")
       ├── connectSSE(target.url + "/global/event")
       │     ├── HTTP GET with Accept: text/event-stream
       │     └── 成功后 → syncHistory(space) → 先回放历史事件
       ├── 连接成功 → setStatus("connected")
       ├── parseSSE(stream, onEvent)
       │     ├── 解析 SSE 协议（data / id / retry 字段）
       │     ├── JSON.parse(event.data)
       │     ├── sync.replay(payload.syncEvent) → 回放同步事件
       │     └── GlobalBus.emit("event", ...) → 广播事件
       ├── 连接断开 → setStatus("disconnected")
       └── 退避重连：sleep(min(120s, 1000 * 2^attempt))
```

### 历史同步 (syncHistory)

```
syncHistory(space, url, headers)
  ├── 查询该 workspace 下所有 session 的 event sequence
  ├── POST /sync/history → 发送已知事件序列号
  └── 服务端返回缺失的历史事件 → sync.replay() 逐条回放
```

### Session Warp — 会话迁移

Session Warp 将会话从一个 workspace 迁移到另一个（或迁回本地 `workspaceID: null`）：

```
sessionWarp({ workspaceID, sessionID, copyChanges })
  ├── 1. 查找当前会话所在的 workspace
  ├── 2. 对源 workspace 执行最终同步（remote: syncHistory, local: prompt.cancel）
  ├── 3. sync.claim(sessionID, workspaceID) → 声明会话归属
  ├── 4. 如果 copyChanges：
  │     ├── 从源 workspace 获取 vcs.diffRaw()
  │     └── 向目标 workspace 执行 vcs.apply({ patch })
  ├── 5. workspaceID === null：
  │     └── sync.run(Session.Event.Updated, { workspaceID: null })
  ├── 6. workspaceID 为本地 workspace：
  │     └── sync.run(Session.Event.Updated, { workspaceID })
  └── 7. workspaceID 为远程 workspace：
        ├── 查询会话的所有事件（最多 10 条/批）
        ├── 逐批 POST /sync/replay → 回放到远程
        └── POST /sync/steal → 声明会话归属
```

### syncList — 工作区发现

```
syncList(project)
  ├── 获取数据库已有的 workspace 列表
  ├── 遍历所有注册的 adapter
  │     └── WorkspaceAdapterRuntime.list(adapter) → 发现远程 workspace
  └── 新发现的 workspace → 插入数据库 + startSync()
```

### startWorkspaceSyncing — 项目级同步启动

项目初始化时为所有已有 workspace 启动同步（`forkDetach` 异步执行）：

```typescript
startWorkspaceSyncing(projectID)
  └── 查询该项目的所有 workspace
       └── startSync(fromRow(workspace)) [forkDetach]
```

### remove — 工作区移除

```
remove(workspaceID)
  ├── 查询并移除关联的所有 session（跳过子 session）
  ├── stopSync(id) → 停止 SSE 连接
  ├── WorkspaceAdapterRuntime.remove(info) → 适配器清理
  └── 删除数据库记录
```

## 关键设计决策

1. **适配器模式**：通过 Adapter 接口抽象不同 workspace 类型（本地 worktree、远程容器等），新增 workspace 类型只需实现适配器接口，无需修改核心逻辑

2. **SSE 持久连接 + 指数退避**：使用 Server-Sent Events 实现实时事件同步，断开后采用指数退避重连（`1000 * 2^attempt`，上限 120 秒）

3. **历史优先同步**：连接建立后先回放历史事件（`syncHistory`），确保在实时事件到达前所有已发生的事件已被处理

4. **Session Warp 文件变更传递**：通过 `copyChanges` 选项，在迁移会话时自动从源 workspace 获取 VCS diff 并应用到目标 workspace，保持文件状态一致

5. **事件批处理回放**：Session warp 时按 10 条/批发送事件到远程，避免单次请求过大

6. **runInWorkspace 自适应路由**：对调用方透明地选择本地执行或 HTTP 远程调用，统一的 fallback 机制确保降级可用

7. **FiberMap 管理同步生命周期**：每个 workspace 的 SSE 连接由独立的 Fiber 管理，通过 `FiberMap` 实现并发控制、状态查询和优雅关闭

8. **WorkspaceRef 上下文注入**：在同步事件回放时通过 `Effect.provideService(WorkspaceRef, space.id)` 注入 workspace 上下文，使事件处理器能区分事件来源

9. **connection status 状态机**：`connecting → connected → disconnected → connecting` 循环，`error` 状态用于持久性故障

10. **认证透传**：创建 workspace 时通过 `OPENCODE_AUTH_CONTENT` 环境变量将当前认证信息传递给 workspace 进程
