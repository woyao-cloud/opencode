# @opencode/SessionRunState — 会话运行状态管理服务
> 源文件: `opencode/packages/opencode/src/session/run-state.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/session/run-state.ts`

## 概述

`@opencode/SessionRunState` 是 OpenCode 的**会话运行状态管理服务**，负责管理每个会话（Session）的并发执行状态。它基于 Effect 框架实现，通过 `Runner` 抽象确保同一会话内同一时刻只有一个任务在运行，并提供繁忙检测、取消、Shell 命令执行等核心能力。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `BackgroundJob` | `@opencode/BackgroundJob` | 后台任务管理，取消会话相关的后台作业 |
| `SessionStatus` | `@opencode/SessionStatus` | 会话状态管理，设置会话的 idle/busy 状态 |

```typescript
// run-state.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const background = yield* BackgroundJob.Service    // 后台任务取消
  const status = yield* SessionStatus.Service        // 状态标记
  // ...
}))

export const defaultLayer = layer.pipe(
  Layer.provide(BackgroundJob.defaultLayer),
  Layer.provide(SessionStatus.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly assertNotBusy: (sessionID: string) => Effect.Effect<void>
  readonly cancel: (sessionID: string) => Effect.Effect<void>
  readonly ensureRunning: <A, E>(sessionID: string, work: Effect.Effect<A, E>) => Effect.Effect<A, E>
  readonly startShell: <A, E>(sessionID: string, work: Effect.Effect<A, E>) => Effect.Effect<A, E>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/SessionRunState") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 检查会话是否繁忙
yield* SessionRunState.Service.assertNotBusy(sessionID)

// 确保只有一个任务运行
yield* SessionRunState.Service.ensureRunning(sessionID, someWork)

// 启动 Shell 命令
yield* SessionRunState.Service.startShell(sessionID, shellWork)
```

## 核心接口详解

### assertNotBusy

```typescript
assertNotBusy: (sessionID: string) => Effect.Effect<void>
```

检查指定会话的 `Runner` 是否处于繁忙状态。如果繁忙，抛出 `BusyError`；否则直接返回。调用方在开始新任务前使用此方法做前置检查。

### cancel

```typescript
cancel: (sessionID: string) => Effect.Effect<void>
```

取消指定会话的运行中任务。执行顺序：
1. 调用 `cancelBackgroundJobs` 递归取消该会话及其子会话的所有后台作业
2. 如果当前 `Runner` 处于繁忙状态，调用 `runner.cancel()` 中断正在执行的任务

### ensureRunning

```typescript
ensureRunning: <A, E>(sessionID: string, work: Effect.Effect<A, E>) => Effect.Effect<A, E>
```

确保指定会话中只有一个任务在运行。内部逻辑：
1. 通过 `getOrCreateRunner` 获取或创建该会话的 `Runner` 实例
2. 调用 `runner.ensureRunning(work)`，将传入的工作包装为独占执行
3. 如果当前已有任务在运行，新的工作将被排队等待

这是主要的任务执行入口，Agent 响应生成等核心流程都通过此方法调度。

### startShell

```typescript
startShell: <A, E>(sessionID: string, work: Effect.Effect<A, E>) => Effect.Effect<A, E>
```

与 `ensureRunning` 类似，但专门用于 Shell 命令执行。区别在于：
- 捕获 `RunnerBusy` 错误并转换为 `Session.BusyError`
- 适用于用户手动触发的 Shell 命令场景，需要区分"Runner 正忙"和"其他错误"

## 内部实现

### Runner 抽象

每个会话拥有一个独立的 `Runner` 实例，由 `InstanceState` 管理的 `Map<string, Runner>` 存储。`Runner` 是内部抽象，不对外暴露。

### Runner 生命周期

Runner 通过回调机制与会话状态联动：

| 事件 | 行为 |
|------|------|
| `onIdle` | 从 Runner Map 中删除该会话的 Runner，调用 `SessionStatus` 设置为 idle 状态 |
| `onBusy` | 调用 `SessionStatus` 设置为 busy 状态 |
| `onInterrupt` | 返回对话中最后一条 assistant 消息（用于中断后恢复上下文） |

### cancelBackgroundJobs

```typescript
cancelBackgroundJobs: (sessionID: string) => Effect.Effect<void>
```

递归取消与指定会话 ID 匹配的所有后台作业。匹配逻辑包括：
- 直接属于该会话的作业
- 子会话（如 task 工具产生的子会话）的作业

使用 `BackgroundJob.Service` 提供的取消能力实现。

### 清理机制

在 Effect Scope 关闭时（`Effect.addFinalizer`），自动遍历所有活跃的 Runner 并调用其 `cancel` 方法，确保资源正确释放。

## 并发模型

```
Session A                    Session B
    │                            │
    ├── Runner ──────────┐       ├── Runner ──────────┐
    │   ensureRunning()  │       │   ensureRunning()  │
    │   ├── work1 (执行) │       │   └── work3 (执行) │
    │   └── work2 (排队) │       │                    │
    └────────────────────┘       └────────────────────┘
```

- **跨会话并发**：不同会话（Session A / Session B）的 Runner 完全独立，可以并行执行
- **会话内串行**：同一会话内的多个任务通过 `ensureRunning` 排队，确保同一时刻只有一个在执行
- **繁忙检测**：`assertNotBusy` 提供同步式的前置检查，防止意外并发

## 关键设计决策

1. **Effect Service 模式**：使用 Effect 的 `Context.Service` 实现依赖注入，所有状态管理都通过 Effect 生成器，天然支持并发安全和资源管理

2. **Runner 与会话一对一**：每个会话维护独立的 Runner 实例，不同会话之间的执行完全隔离，互不影响

3. **串行化执行**：`ensureRunning` 确保同一会话内的任务串行执行，避免并发修改会话状态（如消息列表）导致的竞态问题

4. **Shell 命令独立入口**：`startShell` 与 `ensureRunning` 分离，Shell 命令有独立的错误处理路径（`RunnerBusy` → `Session.BusyError`），便于上层区分错误来源

5. **递归取消子会话**：取消一个会话时，递归取消其所有子会话（如 task 工具产生的子任务）的后台作业，保证清理的完整性

6. **Scope 级别的清理**：通过 `Effect.addFinalizer` 注册清理逻辑，确保 Scope 关闭时所有 Runner 都被正确取消，防止资源泄漏
