# @opencode/EventV2Bridge — V2 事件桥接服务
> 源文件: `opencode/packages/opencode/src/event-v2-bridge.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/event-v2-bridge.ts`

## 概述

`@opencode/EventV2Bridge` 是 OpenCode 的**事件系统迁移桥接层**，负责将新一代 `EventV2`（`@opencode-ai/core/event`）的事件转发到旧版 `Bus`（`@opencode/Bus`）和 `SyncEvent`（`@opencode/SyncEvent`）系统。这是一个临时过渡服务，当所有消费者直接订阅 `EventV2` 后将移除。

桥接逻辑：
- 有 `version` 和 `aggregate` 的事件 → 通过 `SyncEvent.run()` 走持久化 + 投影（projector）路径
- 其他事件 → 通过 `Bus.publish()` 走旧版事件总线

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `EventV2` | `@opencode-ai/core/event` | 新版事件系统（事件注册表、sync 订阅） |
| `Bus` | `@opencode/Bus` | 旧版事件总线（无版本的事件直接发布） |
| `SyncEvent` | `@opencode/SyncEvent` | 旧版同步事件系统（有版本的事件走持久化路径） |
| `InstanceRef` | `@opencode/InstanceRef` | 当前实例上下文引用 |
| `InstanceStore` | `@opencode/InstanceStore` | 实例存储（按 directory 加载实例上下文） |

```typescript
export const defaultLayer = layer.pipe(
  Layer.provideMerge(EventV2.defaultLayer),
  Layer.provide(SyncEvent.defaultLayer),
  Layer.provide(ProjectBus.defaultLayer),
)
```

## 核心接口

Bridge 服务直接实现 `EventV2.Interface`，对外表现为 EventV2 服务：

```typescript
export class Service extends Context.Service<Service, EventV2.Interface>()("@opencode/EventV2Bridge") {}
```

### 使用示例

```typescript
// 该服务由框架自动初始化，不需要手动调用
// 内部逻辑：订阅 EventV2 的所有事件，根据事件定义转发到 Bus 或 SyncEvent
```

## 数据结构

### 事件定义转换

```typescript
export function toSyncDefinition<D extends EventV2.Definition>(definition: D) {
  return {
    type: definition.type,
    version: definition.version,
    aggregate: definition.aggregate,
    schema: definition.data,
    properties: definition.data,
  } as SyncEvent.Definition<D["type"], D["data"], D["data"]>
}
```

将 `EventV2.Definition` 转换为 `SyncEvent.Definition` 格式。

## 关键实现细节

### 事件转发逻辑

```
EventV2Bridge.layer
  └── events.sync((event) => {
        ├── 1. 查找事件定义: EventV2.registry.get(event.type)
        ├── 2. 如果没有定义 → 跳过
        ├── 3. 如果有 version 且 aggregateID 为 string:
        │     └── 通过 SyncEvent.run() 走持久化路径
        │          ├── 序列号管理（EventSequenceTable）
        │          ├── 投影器执行（projector → 写入业务表）
        │          └── 发布到 Bus（通过 convertEvent 转换）
        └── 4. 否则:
              └── 通过 Bus.publish() 直接发布
      })
```

### 实例上下文注入

由于 `EventV2.sync()` 的回调在全局 scope 中执行，桥接层需要为每个事件提供正确的实例上下文：

```typescript
const provideEventLocation = <E, R>(event: EventV2.Payload, effect: Effect.Effect<void, E, R>) => {
  return Effect.gen(function* () {
    const ctx = yield* InstanceRef
    if (ctx) return yield* effect  // 已在实例上下文中
    const store = Option.getOrUndefined(yield* Effect.serviceOption(InstanceStore.Service))
    if (!event.location?.directory || !store) return yield* publishGlobal(event)
    // 从 InstanceStore 加载实例上下文
    return yield* store.load({ directory: event.location.directory }).pipe(
      Effect.flatMap((ctx) => {
        const withInstance = effect.pipe(Effect.provideService(InstanceRef, ctx))
        if (!event.location?.workspaceID) return withInstance
        return withInstance.pipe(Effect.provideService(WorkspaceRef, event.location.workspaceID))
      }),
    )
  })
}
```

### GlobalBus 兜底

当事件没有 location 信息或 InstanceStore 不可用时，事件通过 GlobalBus 发布：

```typescript
const publishGlobal = (event: EventV2.Payload) =>
  Effect.sync(() => {
    GlobalBus.emit("event", {
      workspace: event.location?.workspaceID,
      payload: { id: event.id, type: event.type, properties: event.data },
    })
  })
```

## 关键设计决策

1. **临时桥接模式**：这是一个显式的过渡层，注释明确标注 "goes away once consumers subscribe to core EventV2 directly"，避免技术债务永久化

2. **版本感知路由**：根据事件定义是否有 `version` 字段决定路由路径——有版本的事件走 SyncEvent（持久化 + 投影），无版本的走 Bus（纯内存发布）

3. **延迟实例上下文解析**：不在桥接初始化时绑定实例，而是在每个事件到达时根据 `event.location.directory` 动态加载对应的实例上下文

4. **实现 EventV2.Interface**：桥接服务直接实现 `EventV2.Interface`，使得调用方可以透明切换——只需替换 Service 实现，无需修改接口

5. **三层兜底**：实例上下文获取依次尝试 `InstanceRef`（当前上下文）→ `InstanceStore.load()`（按目录加载）→ `GlobalBus.emit()`（全局发布），确保事件不会丢失
