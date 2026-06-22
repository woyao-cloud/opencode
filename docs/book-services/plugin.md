# @opencode/Plugin — 插件服务
> 源文件: `opencode/packages/opencode/src/plugin/index.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/plugin/index.ts`

## 概述

`@opencode/Plugin` 是 OpenCode 的**插件加载与生命周期管理服务**，负责加载内置插件（认证提供者）和外部插件（npm 包或本地文件），管理插件的 hooks 注册、事件订阅和 trigger 调用。

插件系统基于 `@opencode-ai/plugin` 包的 `Hooks` 接口，支持多种钩子类型，包括认证钩子、事件钩子、配置钩子、实验性 chat 转换钩子等。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Bus` | `@opencode/Bus` | 事件总线，订阅所有事件并分发给插件的 event hook |
| `Config` | `@opencode/Config` | 读取配置（plugin_origins），等待插件依赖安装完成 |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 读取运行时标志（pure、disableDefaultPlugins） |

```typescript
export const defaultLayer = layer.pipe(
  Layer.provide(Bus.layer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly trigger: <Name extends TriggerName, Input, Output>(
    name: Name,
    input: Input,
    output: Output,
  ) => Effect.Effect<Output>

  readonly list: () => Effect.Effect<Hooks[]>

  readonly init: () => Effect.Effect<void>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Plugin") {}
```

### 使用示例

```typescript
// 触发插件钩子（如 chat.system.transform）
const result = yield* Plugin.Service.trigger(
  "experimental.chat.system.transform",
  { model: resolved },
  { system: [...] }
)

// 列出所有已加载的插件 hooks
const hooks = yield* Plugin.Service.list()

// 确保插件初始化完成
yield* Plugin.Service.init()
```

## 数据结构

| 类型 | 说明 |
|------|------|
| `Hooks` | 插件钩子接口（来自 `@opencode-ai/plugin`），包含 `event`、`config`、`experimental.chat.system.transform` 等钩子 |
| `TriggerName` | 符合 `(input, output) => Promise<void>` 签名的钩子名称联合类型 |
| `PluginInput` | 插件初始化输入：`client`（SDK 客户端）、`project`、`worktree`、`directory`、`experimental_workspace`、`serverUrl` |
| `State` | `{ hooks: Hooks[] }` — 已注册的插件钩子数组 |

### 内置插件

```typescript
const INTERNAL_PLUGINS: PluginInstance[] = [
  CodexAuthPlugin,              // OpenAI Codex 认证
  CopilotAuthPlugin,            // GitHub Copilot 认证
  GitlabAuthPlugin,             // GitLab 认证
  PoeAuthPlugin,                // Poe 认证
  CloudflareWorkersAuthPlugin,  // Cloudflare Workers 认证
  CloudflareAIGatewayAuthPlugin,// Cloudflare AI Gateway 认证
  AzureAuthPlugin,              // Azure 认证
  DigitalOceanAuthPlugin,       // DigitalOcean 认证
]
```

## 关键实现细节

### 插件加载流程

```
Plugin.state(ctx)
  ├── 1. 创建 SDK 客户端（createOpencodeClient）
  ├── 2. 加载内置插件（如果未禁用）
  │     └── 每个插件以 PluginInput 调用，失败则跳过（记录日志）
  ├── 3. 加载外部插件（如果非 pure 模式）
  │     ├── 等待依赖安装完成（config.waitForDependencies()）
  │     └── PluginLoader.loadExternal() 加载配置中的插件
  │          ├── 按顺序逐个应用插件（保持确定性顺序）
  │          └── 错误处理：安装失败/兼容性/入口解析/加载失败各有专门日志
  ├── 4. 通知插件当前配置
  │     └── 对每个 hook 调用 hook.config?.(cfg)
  └── 5. 订阅 Bus 事件
        └── bus.subscribeAll() → 对每个事件调用所有 hook 的 event 钩子
```

### 插件导出解析

支持两种插件导出格式：

1. **V1 插件**（推荐）：通过 `readV1Plugin()` 检测，插件模块导出 `{ server, id, ... }` 对象
2. **Legacy 插件**：模块导出直接的 server 函数或包含 server 属性的对象

```typescript
function getLegacyPlugins(mod: Record<string, unknown>) {
  const seen = new Set<unknown>()
  const result: PluginInstance[] = []
  for (const entry of Object.values(mod)) {
    if (seen.has(entry)) continue  // 去重（ESM/CJS 双导出）
    seen.add(entry)
    const plugin = getServerPlugin(entry)
    if (!plugin) throw new TypeError("Plugin export is not a function")
    result.push(plugin)
  }
  return result
}
```

### Trigger 机制

`trigger()` 遍历所有已注册的 hooks，对每个 hook 调用对应的钩子函数：

```typescript
const trigger = Effect.fn("Plugin.trigger")(function* (name, input, output) {
  const s = yield* InstanceState.get(state)
  for (const hook of s.hooks) {
    const fn = hook[name]
    if (!fn) continue
    yield* Effect.promise(async () => fn(input, output))
  }
  return output
})
```

钩子函数签名统一为 `(input, output) => Promise<void>`，插件通过修改 `output` 对象来传递结果。

### 事件分发

插件初始化时订阅 Bus 的所有事件，通过 `hook["event"]?.()` 分发给每个插件：

```typescript
yield* bus.subscribeAll().pipe(
  Stream.runForEach((input) =>
    Effect.sync(() => {
      for (const hook of hooks) {
        void hook["event"]?.({ event: input })
      }
    }),
  ),
  Effect.forkScoped,
)
```

事件处理是 fire-and-forget（`void`），不阻塞事件流。

### 工作区适配器注册

插件可以通过 `experimental_workspace.register(type, adapter)` 注册工作区适配器：

```typescript
experimental_workspace: {
  register(type: string, adapter: PluginWorkspaceAdapter) {
    registerAdapter(ctx.project.id, type, adapter as WorkspaceAdapter)
  },
}
```

### 插件加载错误报告

外部插件加载失败时通过 `PluginLoader.loadExternal` 的 `report` 回调分类处理：

| 阶段 | 处理方式 |
|------|----------|
| `install` | 日志错误 + 发布 Session.Event.Error |
| `compatibility` | 日志警告 + 发布 Session.Event.Error（跳过该插件） |
| `entry` | 日志错误 + 发布 Session.Event.Error |
| `load` | 日志错误 + 发布 Session.Event.Error |

## 关键设计决策

1. **内置认证插件优先**：认证相关的插件直接内置在代码中（非 npm 安装），确保核心认证流程不依赖外部网络

2. **顺序加载保证确定性**：外部插件按配置顺序逐个加载（非并发），确保 hook 注册和执行顺序在多次运行中保持一致

3. **Trigger 模式（input/output 变换）**：插件钩子采用 `(input, output) => Promise<void>` 模式，插件通过修改 output 对象传递结果，简单直接

4. **优雅降级**：单个插件加载失败不影响其他插件和主流程，错误通过 Bus 事件通知前端

5. **依赖等待机制**：外部插件加载前调用 `config.waitForDependencies()` 确保 npm 依赖已安装完成

6. **事件 fire-and-forget**：Bus 事件分发给插件时不等待结果（`void`），避免慢插件阻塞事件流

7. **SDK 客户端内联**：插件通过 `createOpencodeClient` 获取内联 SDK 客户端（baseUrl 指向本地服务器），无需网络调用
