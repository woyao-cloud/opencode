# @opencode/BackgroundJob — 后台任务服务
> 婧愭枃浠? `opencode/packages/opencode/src/background/job.ts`

## 概述

`@opencode/BackgroundJob` 提供通用的后台任务管理能力，支持启动、等待、取消和查询任务状态。它使用 Effect 的 `SynchronizedRef` 管理并发安全的任务注册表，通过 `Deferred` 实现任务完成通知，任务以 `forkIn` 方式在独立 Scope 中运行。

该服务适用于需要异步执行且可追踪状态的操作场景，例如文件处理、代码生成等长时间运行的任务。

### 依赖的 Services

该服务无外部 Service 依赖，仅依赖 Effect 核心模块和内部工具模块：

| 模块 | 用途 |
|------|------|
| `InstanceState` | 实例级别的状态管理 |
| `Identifier` | 生成递增任务 ID |

```typescript
// job.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* InstanceState.make<State>(/* ... */)
  // ...
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly list: () => Effect.Effect<Info[]>
  readonly get: (id: string) => Effect.Effect<Info | undefined>
  readonly start: (input: StartInput) => Effect.Effect<Info>
  readonly wait: (input: WaitInput) => Effect.Effect<WaitResult>
  readonly cancel: (id: string) => Effect.Effect<Info | undefined>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/BackgroundJob") {}
```

使用示例：

```typescript
// 启动一个后台任务
const job = yield* BackgroundJob.Service.start({
  type: "code-generation",
  title: "Generating unit tests",
  metadata: { fileCount: 12 },
  run: Effect.gen(function* () {
    // 执行实际工作
    return "Generated 12 test files"
  }),
})

// 等待任务完成（带超时）
const result = yield* BackgroundJob.Service.wait({ id: job.id, timeout: 30000 })
if (result.timedOut) {
  // 超时处理
} else {
  console.log(result.info?.output)
}

// 取消任务
yield* BackgroundJob.Service.cancel(job.id)
```

## 数据结构

### Info（任务信息）

```typescript
export type Info = {
  id: string
  type: string
  title?: string
  status: Status
  started_at: number
  completed_at?: number
  output?: string
  error?: string
  metadata?: Record<string, unknown>
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 任务唯一 ID |
| `type` | `string` | 任务类型标签 |
| `title` | `string?` | 可读的任务标题 |
| `status` | `Status` | 状态：`"running"` / `"completed"` / `"error"` / `"cancelled"` |
| `started_at` | `number` | 启动时间戳（ms） |
| `completed_at` | `number?` | 完成时间戳 |
| `output` | `string?` | 成功时的输出文本 |
| `error` | `string?` | 失败时的错误信息 |
| `metadata` | `Record<string, unknown>?` | 附加元数据 |

### 输入类型

| 类型 | 说明 |
|------|------|
| `StartInput` | `{ id?, type, title?, metadata?, run: Effect<string, unknown> }` |
| `WaitInput` | `{ id, timeout? }` |
| `WaitResult` | `{ info?, timedOut: boolean }` |

### 内部状态

```typescript
type Active = {
  info: Info
  done: Deferred.Deferred<Info>
  fiber?: Fiber.Fiber<void, unknown>
}

type State = {
  jobs: SynchronizedRef.SynchronizedRef<Map<string, Active>>
  scope: Scope.Scope
}
```

## 关键实现细节

### 任务生命周期

```
start(input)
  ├── 1. uninterruptibleMask 确保原子操作
  ├── 2. 生成 ID（input.id 或 Identifier.ascending("job")）
  ├── 3. 创建 Deferred + 记录 started_at
  ├── 4. 以 forkIn 在 Scope 中启动任务 Fiber
  │     ├── 成功 → finish(id, "completed", { output })
  │     └── 失败 → finish(id, Cause.isInterruptOnly ? "cancelled" : "error", { error })
  └── 5. 将 Active 写入 SynchronizedRef
```

### 并发安全

所有对任务 Map 的读写通过 `SynchronizedRef` 进行，确保在多 Fiber 环境下的并发安全：

```typescript
yield* SynchronizedRef.modifyEffect(s.jobs, Effect.fnUntraced(function* (jobs) {
  // 原子地检查、创建和插入
}))
```

### finish 函数

`finish` 负责将任务状态从 `"running"` 转换为终态：

```typescript
const finish = Effect.fn("BackgroundJob.finish")(function* (id, status, data?) {
  // 通过 SynchronizedRef.modify 原子地更新状态
  // 然后 Deferred.succeed 通知等待者
})
```

关键行为：
- 只转换 `status === "running"` 的任务
- 更新 `completed_at` 时间戳
- 通过 `Deferred.succeed` 通知 `wait()` 的调用者

### wait 超时机制

```typescript
const wait = Effect.fn("BackgroundJob.wait")(function* (input) {
  if (input.timeout === undefined)
    return { info: yield* Deferred.await(job.done), timedOut: false }
  if (input.timeout <= 0)
    return { info: snapshot(job), timedOut: true }
  const info = yield* Deferred.await(job.done).pipe(Effect.timeoutOption(input.timeout))
  if (info._tag === "Some") return { info: info.value, timedOut: false }
  return { info: snapshot(job), timedOut: true }
})
```

- `timeout: undefined` → 无限等待
- `timeout <= 0` → 立即返回当前状态
- `timeout > 0` → 等待指定毫秒，超时返回 `timedOut: true`

### cancel 实现

```typescript
const cancel = Effect.fn("BackgroundJob.cancel")(function* (id) {
  // 1. Fiber.interrupt → 中断任务 Fiber
  // 2. Fiber.await → 等待 Fiber 完全停止
  // 3. finish(id, "cancelled")
})
```

### 快照隔离

`snapshot()` 函数创建 `Info` 的浅拷贝，确保外部持有的 `Info` 对象不会随着任务状态变更而被意外修改。

## 关键设计决策

1. **SynchronizedRef + Deferred 模式**：使用 Effect 的 STM 原语管理并发安全的任务注册表，用 Deferred 实现异步等待通知

2. **uninterruptibleMask 原子启动**：`start` 方法在 uninterruptibleMask 中执行，确保任务创建和注册是原子操作，不会被中断破坏

3. **独立 Scope 隔离**：每个 InstanceState 有独立的 Scope，任务 Fiber 在其中运行。Scope 关闭时自动清理所有运行中的任务

4. **区分 cancelled vs error**：通过 `Cause.hasInterruptsOnly` 区分主动取消和真正的错误，提供精确的任务终态

5. **零外部依赖**：服务完全自包含，不依赖任何其他 Service，保持极简设计

6. **快照拷贝**：`snapshot()` 确保返回给外部的 Info 对象不受内部状态变更影响，防止竞态数据问题
