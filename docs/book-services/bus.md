# @opencode/Bus — 事件总线服务

## 概述

`@opencode/Bus` 是 OpenCode 的**进程内事件总线**，基于 Effect 的 `PubSub` 实现发布-订阅模式。它提供类型安全的事件发布与订阅能力，同时桥接到 `GlobalBus`（Node.js EventEmitter）以支持跨进程通信。

Bus 是 OpenCode 内部模块间解耦通信的核心基础设施，几乎所有服务都通过它发布和订阅事件。

### 依赖的 Services

Bus 不依赖其他业务服务，仅依赖 Effect 框架原语和内部基础设施：

| 依赖 | 说明 |
|------|------|
| `InstanceState` | 实例级状态缓存（PubSub 按实例隔离） |
| `EffectBridge` | Effect 与 Promise 之间的桥接（用于 callback 订阅） |
| `GlobalBus` | Node.js EventEmitter，用于跨进程/跨上下文事件分发 |

```typescript
export const defaultLayer = layer  // 无外部依赖
```

## 核心接口

```typescript
export interface Interface {
  readonly publish: <D extends BusEvent.Definition>(
    def: D,
    properties: BusProperties<D>,
    options?: { id?: string },
  ) => Effect.Effect<void>

  readonly subscribe: <D extends BusEvent.Definition>(def: D) => Stream.Stream<Payload<D>>

  readonly subscribeAll: () => Stream.Stream<Payload>

  readonly subscribeCallback: <D extends BusEvent.Definition>(
    def: D,
    callback: (event: Payload<D>) => unknown,
  ) => Effect.Effect<() => void>

  readonly subscribeAllCallback: (callback: (event: any) => unknown) => Effect.Effect<() => void>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Bus") {}
```

### 使用示例

```typescript
// 发布事件
yield* Bus.Service.publish(SomeEvent, { key: "value" })

// Stream 订阅
yield* Bus.Service.subscribe(SomeEvent).pipe(
  Stream.runForEach((payload) => Effect.logInfo(payload)),
  Effect.forkScoped,
)

// Callback 订阅（返回取消订阅函数）
const unsubscribe = yield* Bus.Service.subscribeCallback(SomeEvent, (event) => {
  console.log(event)
})

// 订阅所有事件
yield* Bus.Service.subscribeAllCallback((event) => {
  console.log(event.type, event.properties)
})
```

### 便捷函数（非 Effect 上下文）

```typescript
// 在非 Effect 上下文中发布事件
await Bus.publish(SomeEvent, { key: "value" })

// 在非 Effect 上下文中订阅事件
const unsubscribe = Bus.subscribe(SomeEvent, (event) => { ... })
```

## 数据结构

| 类型 | 说明 |
|------|------|
| `BusEvent.Definition<Type, Properties>` | 事件定义，包含 `type`（字符串标识）和 `properties`（Effect Schema） |
| `Payload<D>` | `{ id: string, type: D["type"], properties: BusProperties<D> }` |
| `State` | `{ wildcard: PubSub, typed: Map<string, PubSub> }` |

### 预定义事件

```typescript
export const InstanceDisposed = BusEvent.define(
  "server.instance.disposed",
  Schema.Struct({ directory: Schema.String }),
)
```

## 关键实现细节

### 双层 PubSub 架构

```
State
  ├── wildcard: PubSub<Payload>          // 通配符频道，所有事件都发布到这里
  └── typed: Map<string, PubSub<Payload>> // 按事件类型隔离的频道
```

- `publish`：同时发布到 typed 频道和 wildcard 频道
- `subscribe(def)`：只订阅 typed 频道中对应类型的事件
- `subscribeAll()`：订阅 wildcard 频道，接收所有事件

### 发布流程

```
Bus.publish(def, properties)
  ├── 1. 创建 Payload（id + type + properties）
  ├── 2. 发布到 typed 频道（如果存在）
  ├── 3. 发布到 wildcard 频道
  └── 4. 桥接到 GlobalBus（Node.js EventEmitter）
        └── 携带 directory、project、workspace 上下文
```

### 实例隔离

Bus 的 PubSub 状态通过 `InstanceState` 管理，每个项目实例拥有独立的事件总线。当实例 scope 关闭时：

1. 自动发布 `InstanceDisposed` 事件到 wildcard
2. 关闭所有 PubSub（typed + wildcard）

### Callback 订阅实现

`subscribeCallback` 和 `subscribeAllCallback` 使用 `EffectBridge` + `Scope` 实现：

```typescript
function on<T>(pubsub: PubSub.PubSub<T>, type: string, callback: (event: T) => unknown) {
  return Effect.gen(function* () {
    const bridge = yield* EffectBridge.make()
    const scope = yield* Scope.make()
    const subscription = yield* Scope.provide(scope)(PubSub.subscribe(pubsub))
    // 在独立 scope 中运行订阅
    yield* Scope.provide(scope)(
      Stream.fromSubscription(subscription).pipe(
        Stream.runForEach((msg) => Effect.tryPromise(() => Promise.resolve().then(() => callback(msg)))),
        Effect.forkScoped,
      ),
    )
    // 返回取消订阅函数
    return () => { bridge.fork(Scope.close(scope, Exit.void)) }
  })
}
```

回调在 microtask 中执行（`Promise.resolve().then(...)`），避免阻塞 PubSub 的分发循环。

### 事件 ID 生成

```typescript
export function createID() {
  return Identifier.create("evt", "ascending")
}
```

使用 `ascending` 策略生成全局唯一的事件 ID（前缀 `evt_`）。

## 关键设计决策

1. **类型安全的事件系统**：使用 `BusEvent.define(type, schema)` 定义事件，编译期保证 publish 和 subscribe 的类型一致性

2. **双层 PubSub（typed + wildcard）**：typed 频道支持精确订阅，wildcard 频道支持全局监听，两者独立管理但同步发布

3. **GlobalBus 桥接**：每次 publish 同时发送到 Node.js EventEmitter（GlobalBus），支持跨上下文（如 HTTP 服务器、WebSocket）的事件分发

4. **实例级隔离**：每个项目实例拥有独立的 PubSub 状态，实例销毁时自动清理所有订阅

5. **Microtask 回调执行**：callback 订阅的回调在 microtask 中执行，避免同步回调阻塞 PubSub 分发循环

6. **Stream 与 Callback 双模式**：提供 Effect Stream（适合 Effect 上下文内）和 Callback（适合外部 JS 代码）两种订阅方式
