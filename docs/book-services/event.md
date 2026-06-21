# @opencode/Event — 事件总线服务

## 概述

`@opencode/Event` 是 OpenCode 的**内部事件总线**，基于 Effect 的 `PubSub` 实现发布-订阅模式。它提供了类型安全的事件定义、发布、订阅和同步回调机制，是模块间解耦通信的核心基础设施。

事件系统支持三种消费方式：

1. **类型化订阅** (`subscribe`)：按事件类型订阅特定的 `PubSub` 流
2. **全局流** (`all`)：监听所有类型的事件
3. **同步回调** (`sync`)：注册同步处理函数，在事件发布时立即调用

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Location.Service` | `@opencode-ai/core/location` | 可选依赖，通过 `Effect.serviceOption` 获取当前上下文位置信息，自动附加到发布的事件 payload 中 |

`Event` 的 layer 实现**不依赖其他自定义 Service**（仅依赖 Effect 内置的 `PubSub`），是项目中最底层的服务之一：

```typescript
// event.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const all = yield* PubSub.unbounded<Payload>()                    // 全局无界发布-订阅队列
  const typed = new Map<string, PubSub.PubSub<Payload>>()           // 按事件类型分组的队列

  // 可选：获取 Location 上下文
  const location = Option.getOrUndefined(
    yield* Effect.serviceOption(Location.Service)
  )
  // ...
}))
```

## 核心接口

### Interface 定义

```typescript
export interface Interface {
  readonly publish: <D extends Definition>(
    definition: D,
    data: Data<D>,
    options?: PublishOptions,
  ) => Effect.Effect<Payload<D>>

  readonly publishEvent: <D extends Definition>(
    event: Payload<D>,
  ) => Effect.Effect<Payload<D>>

  readonly subscribe: <D extends Definition>(
    definition: D,
  ) => Stream.Stream<Payload<D>>

  readonly all: () => Stream.Stream<Payload>

  readonly sync: (handler: Sync) => Effect.Effect<Unsubscribe>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Event") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 定义事件
const UserLoggedIn = Event.define({
  type: "user.logged_in",
  schema: { userId: Schema.String, timestamp: Schema.Number },
})

// 发布事件
yield* Event.Service.publish(UserLoggedIn, { userId: "u_123", timestamp: Date.now() })

// 订阅事件
yield* Event.Service.subscribe(UserLoggedIn).pipe(
  Stream.runForEach((event) => Effect.log(`User logged in: ${event.data.userId}`)),
  Effect.fork,
)

// 监听所有事件
yield* Event.Service.all().pipe(
  Stream.runForEach((event) => Effect.log(`Event: ${event.type}`)),
  Effect.fork,
)

// 注册同步回调
yield* Event.Service.sync((event) =>
  Effect.log(`Sync handler: ${event.type}`),
)
```

### 方法说明

| 方法 | 签名 | 说明 |
|------|------|------|
| `publish` | `(definition, data, options?) => Effect<Payload>` | 从定义和数据构造事件并发布，自动附加 id、location、version |
| `publishEvent` | `(event) => Effect<Payload>` | 直接发布已构造好的事件 payload，跳过自动字段填充 |
| `subscribe` | `(definition) => Stream<Payload>` | 订阅特定事件类型，返回按类型过滤的 Stream |
| `all` | `() => Stream<Payload>` | 返回包含所有类型事件的全局 Stream |
| `sync` | `(handler) => Effect<Unsubscribe>` | 注册同步回调，返回取消订阅的 Effect |

## 数据结构

### 事件定义 (Definition)

```typescript
export type Definition<
  Type extends string = string,
  DataSchema extends Schema.Top = Schema.Top,
> = {
  readonly type: Type         // 事件类型标识符，如 "user.logged_in"
  readonly version?: number   // 可选版本号
  readonly aggregate?: string // 可选聚合根标识
  readonly data: DataSchema   // 数据部分的 Schema 定义
}
```

### 事件负载 (Payload)

```typescript
export type Payload<D extends Definition = Definition> = {
  readonly id: ID                          // 唯一事件 ID，格式 "evt_" + 时间戳排序
  readonly type: D["type"]                 // 事件类型
  readonly data: Data<D>                   // 类型安全的数据载荷
  readonly version?: number                // 可选版本号
  readonly location?: Location.Ref         // 可选：发布时的上下文位置
  readonly metadata?: Record<string, unknown> // 可选元数据
}
```

### 事件 ID

```typescript
export const ID = Schema.String.pipe(
  Schema.brand("Event.ID"),
  withStatics((schema) => ({
    create: () => schema.make("evt_" + Identifier.ascending()),
  })),
)
```

事件 ID 格式为 `evt_` 前缀加上 `Identifier.ascending()` 生成的时间戳排序字符串，确保全局唯一且可按时间排序。

### 同步回调类型

```typescript
export type Sync = (event: Payload) => Effect.Effect<void>
export type Unsubscribe = Effect.Effect<void>
```

### 发布选项

```typescript
export interface PublishOptions {
  readonly id?: ID                           // 自定义事件 ID（默认自动生成）
  readonly metadata?: Record<string, unknown> // 自定义元数据
}
```

### 事件注册表

```typescript
export const registry = new Map<string, Definition>()
```

所有通过 `Event.define()` 定义的事件会自动注册到全局 `registry` 中。可通过 `Event.definitions()` 获取所有已注册的事件定义列表。

## 关键实现细节

### 事件定义工厂 (`define`)

`define` 函数是事件系统的入口，它同时返回一个 Schema 和一个 Definition：

```typescript
const UserLoggedIn = Event.define({
  type: "user.logged_in",
  version: 1,
  aggregate: "user",
  schema: { userId: Schema.String, timestamp: Schema.Number },
})
// UserLoggedIn 既是 Schema.Schema<Payload<...>> 又是 Definition
```

返回的对象可以被 `Schema.decode` / `Schema.encode` 使用，也可以直接传给 `publish` / `subscribe`。`define` 调用时自动将事件注册到全局 `registry` 中。

### 发布流程

`publish` 方法按以下顺序处理事件：

1. 尝试从 Effect context 中获取 `Location.Service`（可选）
2. 构造完整 Payload：自动生成 ID（或使用传入的）、附加 location、metadata、version
3. 调用 `publishEvent` 执行实际发布

`publishEvent` 的发布顺序：

1. **先调用所有 sync 处理器**：遍历 `syncHandlers` 数组，依次执行同步回调
2. **再推送到类型化 PubSub**：如果存在该事件类型的订阅者，推送到对应的 `PubSub`
3. **最后推送到全局 PubSub**：推送到 `all` 队列，所有全局订阅者都能收到

### 类型化订阅的懒初始化

类型化 `PubSub` 采用懒初始化策略：

```typescript
const getOrCreate = (definition: Definition) =>
  Effect.gen(function* () {
    const existing = typed.get(definition.type)
    if (existing) return existing
    const pubsub = yield* PubSub.unbounded<Payload>()
    typed.set(definition.type, pubsub)
    return pubsub
  })
```

只有当有订阅者调用 `subscribe` 时，才为该事件类型创建 `PubSub` 实例。没有订阅者的事件类型不占用 `PubSub` 资源。

### 资源清理

layer 通过 `Effect.addFinalizer` 注册清理逻辑：

```typescript
yield* Effect.addFinalizer(() =>
  Effect.gen(function* () {
    yield* PubSub.shutdown(all)
    yield* Effect.forEach(typed.values(), PubSub.shutdown, { discard: true })
  }),
)
```

当 Effect scope 关闭时，自动 shutdown 全局 PubSub 和所有类型化 PubSub。

### sync 回调的取消

`sync` 方法返回一个 `Unsubscribe` Effect：

```typescript
const sync = (handler: Sync): Effect.Effect<Unsubscribe> =>
  Effect.sync(() => {
    syncHandlers.push(handler)
    return Effect.sync(() => {
      const index = syncHandlers.indexOf(handler)
      if (index >= 0) syncHandlers.splice(index, 1)
    })
  })
```

调用返回的 Effect 会从 `syncHandlers` 数组中移除该 handler。这是一个同步的数组操作，不需要 Effect 运行时。

## 关键设计决策

1. **基于 PubSub 而非 EventEmitter**：使用 Effect 的 `PubSub`（基于 `Queue` 的背压感知发布-订阅）而非 Node.js 的 `EventEmitter`，天然集成 Effect 的并发模型和资源管理

2. **类型安全的泛型设计**：`Definition<Type, DataSchema>` 和 `Payload<D>` 的泛型约束确保发布和订阅端的数据类型一致，`define` 返回的对象同时是 Schema 和 Definition，消除类型断层的可能

3. **全局注册表**：通过 `registry` Map 记录所有已定义的事件类型，`definitions()` 方法允许运行时自省所有事件定义，支持事件目录和文档生成

4. **三种消费模式并存**：类型化订阅（性能优化，只接收关注的事件）、全局流（灵活性，适合日志/监控/审计）、同步回调（立即执行，适合副作用如写入存储），覆盖不同使用场景

5. **Location 可选依赖**：使用 `Effect.serviceOption` 而非 `yield*` 获取 Location，使得 Event 层在没有 Location 服务的上下文中也能正常工作，不会因缺少依赖而失败

6. **懒初始化 PubSub**：只为有订阅者的事件类型创建 PubSub 实例，避免为从未被订阅的事件类型浪费内存

7. **同步回调优先于 PubSub**：sync 处理器在 PubSub 发布之前执行，确保同步副作用（如持久化）在异步消费者收到事件之前完成
