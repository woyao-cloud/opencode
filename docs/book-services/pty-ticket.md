# @opencode/PtyTicket — 终端连接票据服务
> 婧愭枃浠? `opencode/packages/opencode/src/pty/ticket.ts`

## 概述

`@opencode/PtyTicket` 是 OpenCode 的**终端连接授权服务**，为 PTY WebSocket 连接提供一次性票据（ticket）的签发和消费机制。它基于 Effect 的 `Cache` 实现，票据具有 TTL（Time-To-Live）过期机制，用于在终端连接建立前进行安全授权。

票据的作用域（Scope）包含 `ptyID`、`directory` 和 `workspaceID`，消费时需完全匹配才能成功，确保票据只能用于指定的终端会话和工作区上下文。

### 依赖的 Services

本服务不依赖其他服务，是一个独立的纯逻辑服务。它使用 Effect 内置的 `Cache` 模块。

```typescript
// ticket.ts layer 定义
export const layer = Layer.effect(Service, make())

export const defaultLayer = layer  // 无额外依赖
```

辅助函数 `scope` 依赖于 `InstanceRef` 和 `WorkspaceRef`，用于生成当前上下文的 Scope：

```typescript
export const scope = Effect.gen(function* () {
  const instance = yield* InstanceRef
  const workspaceID = yield* WorkspaceRef
  return { directory: instance?.directory, workspaceID }
})
```

## 核心接口

```typescript
export interface Interface {
  issue(input: Scope): Effect.Effect<typeof ConnectToken.Type>                             // 签发票据
  consume(input: Scope & { readonly ticket: string }): Effect.Effect<boolean>               // 消费票据（验证并销毁）
}

export type Scope = {
  readonly ptyID: PtyID
  readonly directory?: string
  readonly workspaceID?: WorkspaceID
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/PtyTicket") {}
```

使用方式：

```typescript
// 签发票据
const token = yield* PtyTicket.Service.issue({ ptyID: "session-001", directory: "/project" })
// token = { ticket: "uuid-string", expires_in: 60 }

// 消费票据
const valid = yield* PtyTicket.Service.consume({
  ptyID: "session-001",
  directory: "/project",
  ticket: "uuid-string",
})
// valid === true（首次消费），之后变为 false
```

## 数据结构

### ConnectToken（票据令牌）

```typescript
export const ConnectToken = Schema.Struct({
  ticket: Schema.String,         // UUID v4 格式的票据字符串
  expires_in: PositiveInt,       // 过期时间（秒），默认 60 秒
})
```

### Scope（票据作用域）

```typescript
export type Scope = {
  readonly ptyID: PtyID                              // 目标终端会话 ID
  readonly directory?: string                        // 工作目录
  readonly workspaceID?: WorkspaceID                 // 工作区 ID
}
```

## 关键实现细节

### Cache 实现

票据通过 Effect 的 `Cache` 模块实现，容量为 10,000 条，默认 TTL 为 60 秒：

```typescript
const DEFAULT_TTL = Duration.seconds(60)
const CAPACITY = 10_000

export const make = (ttl: Duration.Input = DEFAULT_TTL) =>
  Effect.gen(function* () {
    const cache = yield* Cache.make<string, Scope>({
      capacity: CAPACITY,
      lookup: noLookup,        // 永不调用 lookup，只使用 set/invalidateWhen
      timeToLive: ttl,
    })
    // ...
  })
```

`lookup` 函数被设为 `noLookup`（调用即 `Effect.die`），因为此 Cache 只用于 `Cache.set` 存储和 `Cache.invalidateWhen` 消费，从不通过 `Cache.get` 读取。

### 票据签发

```typescript
issue: Effect.fn("PtyTicket.issue")(function* (input) {
  const ticket = crypto.randomUUID()       // 生成 UUID v4 作为票据
  yield* Cache.set(cache, ticket, input)   // 存储票据到 Scope 的映射
  return { ticket, expires_in: expiresIn }
})
```

`expiresIn` 由 TTL Duration 计算得出（`Math.max(1, Math.round(Duration.toSeconds(...)))`），最小值为 1 秒。

### 票据消费

```typescript
consume: Effect.fn("PtyTicket.consume")(function* (input) {
  return yield* Cache.invalidateWhen(cache, input.ticket, (stored) => matches(stored, input))
})
```

`Cache.invalidateWhen` 是原子操作：如果 ticket 存在且 `matches` 返回 `true`，则删除该条目并返回 `true`；否则返回 `false`。这确保了：

1. **一次性消费**：票据消费后立即从缓存中删除，不可重复使用
2. **精确匹配**：`ptyID`、`directory`、`workspaceID` 必须完全一致

### Scope 匹配逻辑

```typescript
function matches(record: Scope, input: Scope) {
  return (
    record.ptyID === input.ptyID &&
    record.directory === input.directory &&
    record.workspaceID === input.workspaceID
  )
}
```

三个字段全部相等才算匹配。`directory` 和 `workspaceID` 是可选的，但签发时和消费时的值必须一致（同为 `undefined` 或同值）。

### 可测试设计

`make` 函数接受可选的 `ttl` 参数，测试代码可以传入较短的 TTL 以加速测试：

```typescript
// 生产环境
export const layer = Layer.effect(Service, make())  // 默认 60 秒 TTL

// 测试环境
export const make = (ttl: Duration.Input = DEFAULT_TTL) => ...
```

### scope 辅助函数

`scope` 辅助函数从 Effect 上下文中提取当前的 `InstanceRef` 和 `WorkspaceRef`，构建 `Scope` 对象（不含 `ptyID`，由调用方补充）：

```typescript
export const scope = Effect.gen(function* () {
  const instance = yield* InstanceRef
  const workspaceID = yield* WorkspaceRef
  return { directory: instance?.directory, workspaceID }
})
```

## 关键设计决策

1. **一次性票据 + TTL**：票据使用 `Cache.invalidateWhen` 实现原子的一次性消费，同时通过 TTL 自动过期防止未使用的票据永久占用内存

2. **Cache 作为存储而非缓存**：此 Cache 不使用标准的 `get` + `lookup` 模式，而是作为带 TTL 的键值存储，`lookup` 设为 `Effect.die` 以在误用时立即暴露问题

3. **精确 Scope 匹配**：消费时要求 `ptyID`、`directory`、`workspaceID` 三者完全匹配，防止票据被用于错误的终端会话或工作区

4. **最小化依赖**：`PtyTicket` 不依赖任何其他服务，仅使用 Effect 内置的 `Cache` 模块，保持极简设计

5. **可配置 TTL**：`make` 函数暴露 `ttl` 参数，测试代码可以传入 `Duration.millis(100)` 等短 TTL 来加速测试
