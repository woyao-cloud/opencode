# @opencode/HttpApiWebSocketTracker — WebSocket 追踪服务

## 概述

`@opencode/HttpApiWebSocketTracker` 管理 HTTP API 服务器中活跃的 WebSocket 连接，提供连接注册、注销和批量关闭功能。它主要用于服务器优雅关闭场景：当服务器需要关闭时，通过 `closeAll` 向所有活跃 WebSocket 连接发送关闭帧，确保客户端能及时感知并重连。

### 依赖的 Services

该服务无外部 Service 依赖，仅使用 Effect 核心模块和 `effect/unstable/socket/Socket`：

| 模块 | 用途 |
|------|------|
| `Socket` | `CloseEvent` 构造（服务器关闭帧） |

```typescript
// websocket-tracker.ts layer 定义
export const layer = Layer.sync(Service)(() => {
  const sockets = new Set<Close>()
  let closing = false
  return Service.of({ add, remove, closeAll })
})
```

该服务使用 `Layer.sync`（同步 Layer），不依赖任何其他 Service。

## 核心接口

```typescript
export interface Interface {
  readonly add: (close: Close) => Effect.Effect<boolean>
  readonly remove: (close: Close) => Effect.Effect<void>
  readonly closeAll: Effect.Effect<void>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/HttpApiWebSocketTracker") {}
```

### 辅助函数

```typescript
export const register = (close: Close) =>
  Effect.gen(function* () {
    const tracker = yield* Effect.serviceOption(Service)
    if (Option.isNone(tracker)) return true
    const registered = yield* tracker.value.add(close)
    if (!registered) return false
    yield* Effect.addFinalizer(() => tracker.value.remove(close))
    return true
  })
```

## 数据结构

| 类型 | 说明 |
|------|------|
| `Close` | `Effect.Effect<void, unknown>` — 关闭连接的 Effect |
| `Interface` | 服务接口：`add`、`remove`、`closeAll` |
| `SERVER_CLOSING_EVENT` | 工厂函数，返回 WebSocket CloseEvent（code=1001, reason="server closing"） |

## 关键实现细节

### 内部状态

```typescript
const sockets = new Set<Close>()
let closing = false
```

- `sockets`：活跃连接关闭函数的集合
- `closing`：标记服务器是否正在关闭（防止新连接注册）

### add 流程

```typescript
add: (close) =>
  Effect.gen(function* () {
    if (closing) return false       // 服务器正在关闭，拒绝注册
    sockets.add(close)
    return true
  })
```

关键点：如果 `closing === true`，返回 `false` 表示注册被拒绝，调用方应直接关闭连接。

### remove 流程

```typescript
remove: (close) =>
  Effect.sync(() => {
    sockets.delete(close)
  })
```

同步操作，直接从 Set 中删除。

### closeAll 流程

```typescript
closeAll: Effect.gen(function* () {
  closing = true                              // 设置关闭标志
  const active = Array.from(sockets)          // 获取所有活跃连接
  sockets.clear()                             // 清空集合
  yield* Effect.all(
    active.map((close) =>
      close.pipe(
        Effect.timeout("1 second"),           // 每个关闭操作最多 1 秒
        Effect.catch(() => Effect.void),      // 忽略错误
      ),
    ),
    { concurrency: "unbounded", discard: true },
  )
})
```

关键行为：
- 先设置 `closing = true`，阻止新连接注册
- 清空 `sockets` 集合
- 并行执行所有关闭操作（`concurrency: "unbounded"`）
- 每个关闭操作有 1 秒超时保护
- 忽略所有错误，确保不会因单个连接关闭失败阻塞其他连接的关闭

### register 辅助函数

```typescript
export const register = (close: Close) =>
  Effect.gen(function* () {
    const tracker = yield* Effect.serviceOption(Service)
    if (Option.isNone(tracker)) return true
    const registered = yield* tracker.value.add(close)
    if (!registered) return false
    yield* Effect.addFinalizer(() => tracker.value.remove(close))
    return true
  })
```

`register` 是推荐的 WebSocket 注册方式，封装了完整的生命周期管理：

1. 通过 `Effect.serviceOption` 可选获取 Service（不强制要求提供 Layer）
2. 如果没有 Service → 返回 `true`（允许连接继续）
3. 注册失败（服务器关闭中）→ 返回 `false`（调用方应关闭连接）
4. 注册成功 → 通过 `Effect.addFinalizer` 自动在 Scope 关闭时注销

## 关键设计决策

1. **极简设计**：无外部依赖的 `Layer.sync` 实现，内部仅使用 `Set` + `boolean` 管理状态

2. **优雅关闭模式**：`closing` 标志确保关闭期间不接受新连接，避免新连接在关闭过程中建立后又被立即断开

3. **并行关闭**：`closeAll` 使用 `concurrency: "unbounded"` 并行关闭所有连接，最大化关闭速度

4. **超时保护**：每个关闭操作有 1 秒超时，防止挂起的连接阻塞整个关闭流程

5. **错误忽略**：关闭过程中的所有错误都被 catch 并忽略，确保尽可能多的连接被关闭

6. **可选 Service**：`register` 使用 `Effect.serviceOption` 获取 Service，使得该服务是可选的——不提供 Layer 时 WebSocket 仍然可以正常工作（只是没有优雅关闭能力）

7. **Finalizer 自动清理**：`register` 使用 `Effect.addFinalizer` 绑定生命周期，确保 Scope 释放时自动从 tracker 中移除连接
