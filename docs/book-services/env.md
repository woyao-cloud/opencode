# @opencode/Env — 环境变量服务
> 婧愭枃浠? `opencode/packages/opencode/src/env/index.ts`

## 概述

`@opencode/Env` 是 OpenCode 的**环境变量管理服务**，提供对进程环境变量的读取和写入能力。它基于 Effect 框架的 `InstanceState` 机制，为每个项目实例维护独立的环境变量快照，支持通过 `set` 和 `remove` 方法进行运行时修改。该服务被 `@opencode/Config` 依赖，用于注入和读取环境变量配置。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `InstanceState` | `@/effect/instance-state` | 实例级别状态管理，按项目目录隔离环境变量快照 |

```typescript
// index.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state = yield* InstanceState.make<State>(
      Effect.fn("Env.state")(() => Effect.succeed({ ...process.env }))
    )
    // ...
  }),
)

export const defaultLayer = layer
```

## 核心接口

```typescript
type State = Record<string, string | undefined>

export interface Interface {
  readonly get: (key: string) => Effect.Effect<string | undefined>
  readonly all: () => Effect.Effect<State>
  readonly set: (key: string, value: string) => Effect.Effect<void>
  readonly remove: (key: string) => Effect.Effect<void>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Env") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 读取环境变量
const home = yield* Env.Service.get("HOME")

// 获取所有环境变量
const allEnv = yield* Env.Service.all()

// 设置环境变量
yield* Env.Service.set("OPENCODE_CONSOLE_TOKEN", token)

// 删除环境变量
yield* Env.Service.remove("OPENCODE_CONSOLE_TOKEN")
```

## 数据结构

### State

```typescript
type State = Record<string, string | undefined>
```

`State` 是一个简单的键值对映射，key 为环境变量名，value 为字符串值或 `undefined`（表示未设置）。

## 关键实现细节

### 实例隔离

环境变量状态通过 `InstanceState` 进行**实例级别隔离**。每个项目目录拥有独立的环境变量快照，切换项目目录时自动加载对应快照：

```typescript
const state = yield* InstanceState.make<State>(
  Effect.fn("Env.state")(() => Effect.succeed({ ...process.env }))
)
```

- **初始化**：通过 `InstanceState.make` 创建，初始值为 `process.env` 的浅拷贝
- **读取**：`get` 和 `all` 通过 `InstanceState.use` 和 `InstanceState.get` 从当前实例的状态中读取
- **写入**：`set` 和 `remove` 直接修改状态对象的属性（`env[key] = value` / `delete env[key]`）

### 写入模式

`set` 和 `remove` 是**可变写入**（mutable write），直接修改 `InstanceState` 缓存中的对象属性，不产生新对象：

```typescript
const set = Effect.fn("Env.set")(function* (key: string, value: string) {
  const env = yield* InstanceState.get(state)
  env[key] = value
})

const remove = Effect.fn("Env.remove")(function* (key: string) {
  const env = yield* InstanceState.get(state)
  delete env[key]
})
```

## 关键设计决策

1. **InstanceState 实例隔离**：环境变量状态与项目目录绑定，切换目录时自动切换快照，避免跨项目环境污染

2. **初始快照模式**：初始化时浅拷贝 `process.env`，后续修改不影响实际系统环境变量，保持隔离性

3. **可变写入**：`set` 和 `remove` 直接修改缓存对象，简单高效，不需要不可变更新模式

4. **零外部依赖**：`defaultLayer = layer`，不需要额外提供任何依赖，可独立使用

5. **轻量设计**：仅提供基本的 CRUD 操作，不包含环境变量模板替换、默认值等高级功能，这些由 `@opencode/Config` 的 `ConfigVariable` 模块处理
