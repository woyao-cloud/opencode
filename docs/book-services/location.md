# @opencode/Location — 位置/路径服务
> 婧愭枃浠? `opencode/packages/core/src/location.ts`

## 概述

`@opencode/Location` 是 OpenCode 的**上下文定位标记服务**。它不包含业务逻辑方法，而是作为一个 Effect Context Tag，携带当前操作所关联的**工作目录**和**工作区标识**。其他服务（如 `Catalog`、`Event`、`PluginBoot`）通过注入 `Location.Service` 来感知当前运行上下文，实现按目录/工作区隔离的状态管理。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| (无) | — | `Location.Service` 本身不依赖任何其他 Service。它只是一个纯数据载体，由上层通过 `Layer.succeed` 提供。 |

`Location` 位于依赖链的最底层，被其他服务依赖但自身零依赖：

```typescript
// 无 layer 定义——Location 不自建 layer，由调用方提供
// 使用方式：Layer.succeed(Location.Service, Location.Service.of({ directory: "...", workspaceID: "..." }))
```

依赖 `Location.Service` 的服务：

| 消费方 | 文件 | 使用方式 |
|--------|------|----------|
| `Event` | `core/src/event.ts` | `Effect.serviceOption(Location.Service)` 获取位置，附加到事件 payload |
| `Catalog` | `core/src/catalog.ts` | `yield* Location.Service` 强制要求调用方提供位置 |
| `LocationServiceMap` | `core/src/location-layer.ts` | 根据 `Ref` 创建带 `Location.Service` 的 scoped layer |

## 核心接口

`Location` 的独特之处在于：**它没有 Interface 方法**。`Service` 直接以 `Ref` 结构体作为其 context 值，而非一个带方法的对象。这意味着使用方直接通过 `yield* Location.Service` 获取到的就是 `Ref` 数据本身。

```typescript
// Service 声明：Context.Tag 的值为 Ref 类型
export class Service extends Context.Service<Service, Ref>()("@opencode/Location") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取当前工作目录和工作区
const ref = yield* Location.Service
console.log(ref.directory)    // e.g. "/home/user/project"
console.log(ref.workspaceID)  // e.g. "ws_abc123" or undefined

// Event 中可选获取（没有 Location 时也不报错）
const location = Option.getOrUndefined(yield* Effect.serviceOption(Location.Service))
```

### 提供 Location 的方式

```typescript
// 直接构建 layer
const layer = Layer.succeed(
  Location.Service,
  Location.Service.of({ directory: "/path/to/project", workspaceID: "workspace-123" })
)

// 通过 LocationServiceMap 动态创建（按 Ref 缓存）
const map = yield* LocationServiceMap
const scopedLayer = map.get({ directory: "/path/to/project", workspaceID: "workspace-123" })
yield* someEffect.pipe(Effect.provide(scopedLayer))
```

## 数据结构

### Ref

```typescript
export const Ref = Schema.Struct({
  directory: Schema.String,                    // 工作目录的绝对路径
  workspaceID: Schema.optional(Schema.String), // 可选的 OpenCode 工作区 ID
}).annotate({ identifier: "Location.Ref" })

export type Ref = typeof Ref.Type
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `directory` | `string` | 工作目录的绝对路径，通常是项目根目录 |
| `workspaceID` | `string?` | OpenCode 工作区标识符，用于关联同一工作区的多个会话 |

### Service

`Service` 是 `Context.Service<Service, Ref>()`，即 tag 值为 `Ref` 类型。没有额外的 interface 方法。

## LocationServiceMap（Scoped Layer 工厂）

`LocationServiceMap` 是 `Location` 的关键配套模块，定义在 `location-layer.ts`：

```typescript
export class LocationServiceMap extends LayerMap.Service<LocationServiceMap>()(
  "@opencode/example/LocationServiceMap",
  {
    lookup: (ref: Location.Ref) => {
      const location = Layer.succeed(Location.Service, Location.Service.of(ref))
      return Layer.mergeAll(Catalog.defaultLayer, PluginBoot.defaultLayer).pipe(Layer.provide(location))
    },
    idleTimeToLive: "5 minutes",
  },
) {}
```

- **`lookup`**：接受一个 `Location.Ref`，返回一个完整的 Effect Layer。该 layer 包含：
  - `Location.Service` 注入（携带传入的 `ref`）
  - `Catalog.defaultLayer`（Provider/Model 目录）
  - `PluginBoot.defaultLayer`（插件引导）
- **`idleTimeToLive: "5 minutes"`**：按 `Ref` 缓存的 layer 在闲置 5 分钟后自动回收，避免内存泄漏

### HTTP API 中的使用

在 `opencode/src/server/routes/instance/httpapi/groups/v2/location.ts` 中，`Location.Ref` 从 HTTP 请求中提取：

```typescript
function ref(request: HttpServerRequest.HttpServerRequest): Location.Ref {
  const query = new URL(request.url, "http://localhost").searchParams
  return {
    directory: query.get("location[directory]") || request.headers["x-opencode-directory"] || process.cwd(),
    workspaceID: query.get("location[workspace]") || request.headers["x-opencode-workspace"],
  }
}
```

提取优先级：查询参数 `location[directory]` > Header `x-opencode-directory` > `process.cwd()`。

## 关键实现细节

### 1. 事件发布时自动附加位置

`Event.publish()` 内部调用 `Effect.serviceOption(Location.Service)` 尝试获取当前 Location：

```typescript
const location = Option.getOrUndefined(yield* Effect.serviceOption(Location.Service))
const event = {
  ...(location ? { location } : {}),  // 有 Location 就附加，没有就省略
  type: definition.type,
  data,
}
```

这确保了每个事件都知道它发生在哪个目录和工作区，方便后续追踪和隔离。

### 2. Catalog 强制要求 Location

`Catalog.layer` 的第一行就是 `yield* Location.Service`，这意味着**任何使用 Catalog 的 Effect 必须先提供 Location**。这确保了 Provider/Model 的注册和查询总是发生在特定目录上下文中。

### 3. 零依赖设计

`Location` 是 OpenCode 依赖图的最底层节点之一。它只定义数据结构，不依赖文件系统、网络或任何其他服务。这使得它可以用最简单的 `Layer.succeed` 提供，无需复杂的 bootstrap。

### 4. LayerMap 缓存

`LocationServiceMap` 使用 Effect 的 `LayerMap` 机制，按 `Ref` 作为 key 缓存完整的 scoped layer。当同一目录被多次请求时（如同一工作区的多个 HTTP 请求），共享同一个 layer 实例，避免重复初始化 `Catalog` 和 `PluginBoot`。

## 关键设计决策

1. **Service 即数据结构**：`Location.Service` 直接以 `Ref` 结构体作为 context 值，不封装在 interface 对象中。这避免了无意义的间接调用，调用方拿到就是数据。

2. **可选注入（serviceOption）**：`Event` 使用 `Effect.serviceOption` 而非 `yield*` 获取 Location，使得 Event 可以在没有 Location 的上下文中也能正常工作（例如全局级事件），只是不附加位置信息。

3. **Catalog 强制注入（yield\*）**：`Catalog` 使用 `yield* Location.Service` 强制要求 Location，因为 Provider/Model 的配置和发现必须在具体目录上下文中进行（例如读取项目级 `.opencode/` 配置）。

4. **LayerMap 而非全局单例**：不使用全局单例，而是通过 `LocationServiceMap` 按目录缓存独立的 layer 实例。这允许同一进程中存在多个隔离的上下文（如多工作区场景），同时避免为每次请求重新初始化。

5. **5 分钟闲置回收**：`LocationServiceMap` 的 `idleTimeToLive` 设为 5 分钟，在工作区切换后及时释放不再使用的 Catalog 和 PluginBoot 实例，平衡了缓存效率和内存占用。

6. **HTTP 提取优先级**：Location 从查询参数优先于 Header，再回退到 `process.cwd()`。查询参数优先级最高是为了支持 `deepObject` 风格编码（`location[directory]=...&location[workspace]=...`），这在 OpenAPI 规范中有更好的互操作性。
