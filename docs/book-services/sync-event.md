# @opencode/SyncEvent — 同步事件服务
> 源文件: `opencode/packages/opencode/src/sync/index.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/sync/index.ts`

## 概述

`@opencode/SyncEvent` 是 OpenCode 的**旧版事件溯源（Event Sourcing）系统**，负责事件的持久化、序列号管理、投影（projection）和发布。它实现了经典的事件溯源模式：事件先写入数据库（通过投影器更新业务表），再发布到事件总线供订阅者消费。

该系统被标记为 "Legacy"，正在逐步迁移到 `EventV2`（`@opencode-ai/core/event`）。迁移期间通过 `EventV2Bridge` 桥接。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Bus` | `@opencode/Bus` | 事件总线，投影后发布事件 |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 读取 experimentalWorkspaces 标志 |

```typescript
export const defaultLayer = layer.pipe(Layer.provide([ProjectBus.defaultLayer, RuntimeFlags.defaultLayer]))
```

## 核心接口

```typescript
export interface Interface {
  readonly run: <Def extends Definition>(
    def: Def,
    data: Event<Def>["data"],
    options?: { publish?: boolean },
  ) => Effect.Effect<void>

  readonly replay: (event: SerializedEvent, options?: { publish: boolean; ownerID?: string }) => Effect.Effect<void>

  readonly replayAll: (
    events: SerializedEvent[],
    options?: { publish: boolean; ownerID?: string },
  ) => Effect.Effect<string | undefined>

  readonly remove: (aggregateID: string) => Effect.Effect<void>

  readonly claim: (aggregateID: string, ownerID: string) => Effect.Effect<void>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/SyncEvent") {}
```

### 使用示例

```typescript
// 运行一个新事件
yield* SyncEvent.Service.run(SomeEventDef, { key: "value" })

// 重放一个已持久化的事件
yield* SyncEvent.Service.replay(serializedEvent, { publish: true })

// 重放一组事件
const source = yield* SyncEvent.Service.replayAll(events, { publish: true })

// 删除聚合根的所有事件
yield* SyncEvent.Service.remove(sessionID)

// 声明聚合根的所有权
yield* SyncEvent.Service.claim(sessionID, ownerID)
```

## 数据结构

### 核心类型

| 类型 | 说明 |
|------|------|
| `Definition<Type, Schema, BusSchema>` | 事件定义：type、version、aggregate、schema、properties |
| `Event<Def>` | 事件实例：id、seq、aggregateID、data |
| `Properties<Def>` | Bus 发布的负载类型（可能与持久化的 schema 不同） |
| `SerializedEvent<Def>` | 序列化事件（含 type 字段，用于重放） |

### 事件定义

```typescript
export function define<Type, Agg, Schema, BusSchema>(input: {
  type: Type
  version: number
  aggregate: Agg
  schema: Schema
  busSchema?: BusSchema  // Bus 发布的 schema，默认等于 schema
}): Definition<Type, Schema, BusSchema>
```

### 投影器注册

```typescript
export function project<Def extends Definition>(
  def: Def,
  func: (db: Database.TxOrDb, data: Event<Def>["data"], event: Event<Def>) => void,
): [Definition, ProjectorFunc]
```

## 关键实现细节

### 事件运行流程 (run)

```
SyncEvent.run(def, data)
  ├── 1. 提取 aggregate ID（从 data[def.aggregate] 获取）
  ├── 2. 版本校验（def.version 必须等于注册的最新版本）
  ├── 3. 开启 IMMEDIATE 事务
  │     ├── 生成事件 ID（ascending）
  │     ├── 查询当前序列号，递增
  │     └── 调用 process(def, event)
  │          ├── 执行投影器（projector → 写入业务表）
  │          ├── 如果 experimentalWorkspaces: 写入 EventSequenceTable + EventTable
  │          └── 如果 publish: 通过 convertEvent 转换后发布到 Bus + GlobalBus
  └── 4. 事务提交
```

### 事件重放流程 (replay)

```
SyncEvent.replay(event, options)
  ├── 1. 查找事件定义（registry.get(event.type)）
  ├── 2. 查询当前序列号
  ├── 3. 序列号校验：
  │     ├── event.seq <= latest → 跳过（已处理）
  │     └── event.seq !== latest + 1 → 抛出序列不匹配错误
  ├── 4. 所有权检查（ownerID 不匹配则跳过）
  └── 5. 调用 process（同 run）
```

### 初始化流程

```typescript
export function init(input: { projectors: Array<[Definition, ProjectorFunc]>; convertEvent?: ConvertEvent }) {
  // 1. 注册所有投影器（key: versionedType）
  // 2. 从 EventV2.registry 导入有版本的事件定义
  // 3. 将最新版本的事件定义安装到 Bus（BusEvent.define）
  // 4. 冻结系统（frozen = true），防止之后定义新事件
}
```

`init` 必须在应用启动时调用，之后系统进入冻结状态，任何新的 `define()` 调用都会抛出错误。

### 版本化类型

```typescript
export function versionedType(type: string, version?: number) {
  return version ? `${type}.${version}` : type
}
```

版本化类型格式：`{type}.{version}`（如 `session.updated.1`）。投影器和注册表都使用版本化类型作为键，确保可以重放历史版本的旧事件。

### 冻结机制

```typescript
let frozen = false

export function define<...>(input: {...}): Definition<...> {
  if (frozen) {
    throw new Error("Error defining sync event: sync system has been frozen")
  }
  // ...
}
```

`init()` 调用后系统冻结，防止运行时动态定义事件导致的竞态和不一致。

### 实验性工作区支持

当 `RuntimeFlags.experimentalWorkspaces` 为 true 时：
- 事件同时写入 `EventSequenceTable`（序列号追踪）和 `EventTable`（事件存储）
- 支持 `ownerID` 机制（多工作区并发控制）
- 使用 `onConflictDoUpdate` 处理序列号冲突

## 关键设计决策

1. **事件溯源模式**：事件是不可变的、有序的记录，通过投影器将事件数据写入业务表（读模型），支持事件重放和审计

2. **版本化事件定义**：每个事件定义带有 version 字段，支持同一事件类型的多个版本共存，重放时可以处理历史版本的旧事件

3. **投影器注册表**：投影器在 `init()` 时集中注册，使用 `versionedType` 作为键，确保每个版本的事件有对应的投影逻辑

4. **冻结机制**：初始化后系统冻结，禁止动态注册新事件，保证运行时的类型安全和一致性

5. **IMMEDIATE 事务**：使用 SQLite 的 IMMEDIATE 事务模式，确保序列号的原子递增，防止并发写入导致的序列号冲突

6. **convertEvent 钩子**：支持在发布前转换事件数据（如从持久化格式转为 Bus 格式），由 `init()` 时注入

7. **eventPayloads 导出**：`effectPayloads()` 同时导出 SyncEvent 和 EventV2 的 Schema 定义，供 HTTP/SDK 的 Schema 生成使用
