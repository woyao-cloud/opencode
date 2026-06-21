# @opencode/LSP — LSP 语言服务器服务

## 概述

`@opencode/LSP` 是 OpenCode 的**语言服务器协议集成服务**，负责管理多个 LSP 客户端实例的生命周期，对外提供统一的代码智能接口（悬停、跳转定义、引用查找、调用层次等）。它基于 Effect 框架实现，内置了常用语言服务器的预设配置，并允许用户通过 `Config.lsp` 自定义扩展。

LSP 客户端按需延迟启动：当文件首次被访问时，根据文件扩展名匹配对应的 LSP Server，在后台 spawn 并初始化。客户端实例与项目根目录绑定，同一个 `root + serverID` 不会重复创建。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 读取 LSP 配置（`cfg.lsp`），获取自定义服务器定义、启用/禁用状态 |
| `RuntimeFlags` | `@opencode-ai/core/runtime-flags` | 读取实验性开关（如 `OPENCODE_EXPERIMENTAL_LSP_TY` 控制 pyright/ty 二选一） |
| `Bus` | `@opencode/Bus` | 发布 `lsp.updated` 事件，通知客户端 LSP 实例发生变化 |

```typescript
// lsp.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const flags = yield* RuntimeFlags.Service
    const state = yield* InstanceState.make<State>(...)
    // ...
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Config.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)
```

LSP 的完整链路依赖还包括内部的 `LSPClient`（`./client.ts`）、`LSPServer`（`./server.ts`）和 `launch`（`./launch.ts`）模块，它们负责与 LSP 进程的 JSON-RPC 通信、服务器预设定义和子进程 spawn。

## 核心接口

```typescript
export interface Interface {
  readonly init: () => Effect.Effect<void>                                        // 初始化 LSP 服务
  readonly status: () => Effect.Effect<Status[]>                                  // 获取所有已连接 LSP 客户端状态
  readonly hasClients: (file: string) => Effect.Effect<boolean>                   // 判断文件是否有可用的 LSP 客户端
  readonly touchFile: (input: string, diagnostics?: "document" | "full") => Effect.Effect<void>  // 打开文件并可选拉取诊断
  readonly diagnostics: () => Effect.Effect<Record<string, LSPClient.Diagnostic[]>>  // 获取所有文件的诊断信息
  readonly hover: (input: LocInput) => Effect.Effect<any>                         // 悬停信息
  readonly definition: (input: LocInput) => Effect.Effect<any[]>                  // 跳转到定义
  readonly references: (input: LocInput) => Effect.Effect<any[]>                  // 查找引用
  readonly implementation: (input: LocInput) => Effect.Effect<any[]>              // 跳转到实现
  readonly documentSymbol: (uri: string) => Effect.Effect<(DocumentSymbol | Symbol)[]>  // 文档符号
  readonly workspaceSymbol: (query: string) => Effect.Effect<Symbol[]>            // 工作区符号搜索
  readonly prepareCallHierarchy: (input: LocInput) => Effect.Effect<any[]>        // 准备调用层次
  readonly incomingCalls: (input: LocInput) => Effect.Effect<any[]>               // 传入调用
  readonly outgoingCalls: (input: LocInput) => Effect.Effect<any[]>               // 传出调用
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/LSP") {}
```

使用方式：

```typescript
// 初始化 LSP
yield* LSP.Service.init()

// 触摸文件以触发 LSP 诊断
yield* LSP.Service.touchFile("/path/to/file.ts", "full")

// 获取符号定义
const defs = yield* LSP.Service.definition({ file: "/path/to/file.ts", line: 10, character: 5 })
```

## 数据结构

### LocInput

LSP 操作的通用位置输入：

```typescript
type LocInput = { file: string; line: number; character: number }
```

### Range / Position

```typescript
const Position = Schema.Struct({
  line: NonNegativeInt,
  character: NonNegativeInt,
})

export const Range = Schema.Struct({
  start: Position,
  end: Position,
})
```

### Symbol / DocumentSymbol

```typescript
export const Symbol = Schema.Struct({
  name: Schema.String,
  kind: NonNegativeInt,       // LSP SymbolKind 枚举值
  location: Schema.Struct({
    uri: Schema.String,
    range: Range,
  }),
})

export const DocumentSymbol = Schema.Struct({
  name: Schema.String,
  detail: Schema.optional(Schema.String),
  kind: NonNegativeInt,
  range: Range,
  selectionRange: Range,
})
```

### Status

```typescript
export const Status = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  root: Schema.String,                              // 相对于实例目录的路径
  status: Schema.Literals(["connected", "error"]),
})
```

### SymbolKind 枚举

内部使用 LSP 标准 `SymbolKind` 枚举（1=File, 2=Module, ..., 26=TypeParameter）。`workspaceSymbol` 搜索只返回以下类型的符号：

```typescript
const kinds = [
  SymbolKind.Class, SymbolKind.Function, SymbolKind.Method,
  SymbolKind.Interface, SymbolKind.Variable, SymbolKind.Constant,
  SymbolKind.Struct, SymbolKind.Enum,
]
```

### State（内部状态）

```typescript
interface State {
  clients: LSPClient.Info[]                           // 已激活的客户端实例
  servers: Record<string, LSPServer.Info>             // 所有可用服务器（内置 + 用户自定义）
  broken: Set<string>                                 // 启动失败的 (root + serverID) 集合，避免重试
  spawning: Map<string, Promise<LSPClient.Info | undefined>>  // 正在启动中的任务，用于去重
}
```

## 关键实现细节

### 客户端按需延迟启动

`getClients` 是核心调度函数。当文件被访问时：

1. 检查文件是否在当前实例上下文中（`containsPath`）
2. 遍历所有启用的 `servers`，匹配文件扩展名
3. 调用 `server.root(file, ctx)` 确定项目根目录
4. 检查 `broken` 集合（启动失败的跳过）和已有的 `clients`（匹配则复用）
5. 检查 `spawning` Map（有正在进行的启动任务则 await 复用）
6. 执行 `schedule`：spawn 进程 → 创建 `LSPClient` → 去重检查（同 root+serverID 复用） → 推入 `clients` 数组 → 发布 `Event.Updated`

```typescript
const getClients = Effect.fnUntraced(function* (file: string) {
  const ctx = yield* InstanceState.context
  if (!containsPath(file, ctx)) return [] as LSPClient.Info[]
  const s = yield* InstanceState.get(state)
  // ... 调度逻辑
})
```

### 服务器配置合并

配置阶段从两个来源构建服务器列表：

1. **内置服务器**：`LSPServer` 模块中预设的服务器（如 `ty`、`pyright`、`rust-analyzer` 等）
2. **用户自定义**：`cfg.lsp` 中的配置。如果设置为 `false` 则禁用所有 LSP；否则可逐个覆盖/新增服务器的 `command`、`extensions`、`env`、`initialization` 和 `root` 函数

```typescript
// 用户自定义 LSP 示例
// cfg.lsp = { "my-lsp": { command: ["my-lsp", "--stdio"], extensions: [".myext"] } }
```

### 实验性开关互斥

`filterExperimentalServers` 函数处理 `pyright` 和 `ty` 的互斥关系：
- 当 `OPENCODE_EXPERIMENTAL_LSP_TY` 启用时，移除 `pyright`，保留 `ty`
- 否则移除 `ty`，保留 `pyright`

### 操作执行模式

- **`run(file, fn)`**：对匹配该文件的所有 LSP 客户端执行操作，结果 `Promise.all` 汇总
- **`runAll(fn)`**：对所有已连接的 LSP 客户端执行操作（如 `workspaceSymbol`、`diagnostics`）
- **`callHierarchyRequest`**：两阶段操作，先 `prepareCallHierarchy` 获取 CallHierarchyItem，再用第一个 item 发起 `incomingCalls` 或 `outgoingCalls`

### 生命周期管理

State 创建时通过 `Effect.addFinalizer` 注册清理回调，在实例销毁时调用所有客户端的 `shutdown()` 方法。

## 关键设计决策

1. **按需延迟启动**：LSP 客户端不在服务初始化时启动，而是在文件首次被 `touchFile`、`hover`、`definition` 等操作触发时，通过 `getClients` 按需 spawn。这避免了为无关语言启动不需要的 LSP 进程

2. **去重机制**：通过 `spawning` Map 跟踪正在启动中的任务，防止并发访问同一文件时重复启动同一个 LSP 客户端。同时在 `schedule` 成功后检查 `s.clients` 中是否已有同 `root + serverID` 的实例，进一步确保幂等

3. **broken 集合**：启动失败的 `root + serverID` 组合被记录在 `broken` 集合中，后续不再重试，避免反复启动失败进程

4. **root 函数灵活匹配**：每个 LSPServer 的 `root` 函数接收文件和上下文，返回项目根目录。不同语言的服务器可能有不同的根目录判定逻辑（如 `package.json`、`Cargo.toml` 等），这使得同一文件可以关联到多个不同 root 的 LSP 客户端

5. **用户配置与内置合并**：用户的 `cfg.lsp` 不是完全替换内置服务器，而是与内置定义合并——用户可以覆盖内置服务器的 command/extensions，也可以新增自定义服务器，或通过 `disabled: true` 禁用特定服务器
