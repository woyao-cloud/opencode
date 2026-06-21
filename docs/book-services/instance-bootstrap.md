# @opencode/InstanceBootstrap — 实例初始化编排服务
> 婧愭枃浠? `opencode/packages/opencode/src/project/bootstrap-service.ts`

## 概述

`@opencode/InstanceBootstrap` 是 OpenCode 的**实例初始化编排服务**，负责在新实例创建时按正确的顺序和依赖关系初始化所有子系统。它是整个实例启动流程的编排者，确保 Config 最先加载、Plugin 在 Config 之后初始化、其余服务并行启动。

该服务采用轻量级接口 + 延迟加载实现的两层架构：`bootstrap-service.ts` 只定义 Service 标签和接口（避免循环依赖），实际实现在 `bootstrap.ts` 中通过 `InstanceLayer` 延迟导入。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 配置加载（最先初始化，其他服务依赖配置） |
| `Plugin` | `@opencode/Plugin` | 插件初始化（可能修改配置，需在 Config 之后、其他服务之前） |
| `Reference` | `@opencode/Reference` | 命名引用初始化 |
| `LSP` | `@opencode/LSP` | LSP 服务器初始化 |
| `ShareNext` | `@opencode/ShareNext` | 分享服务初始化 |
| `Format` | `@opencode/Format` | 代码格式化服务初始化 |
| `File` | `@opencode/File` | 文件服务初始化 |
| `FileWatcher` | `@opencode/FileWatcher` | 文件监控初始化 |
| `Vcs` | `@opencode/Vcs` | 版本控制服务初始化 |
| `Snapshot` | `@opencode/Snapshot` | 快照服务初始化 |
| `Project` | `@opencode/Project` | 项目服务初始化 |
| `Bus` | `@opencode/Bus` | 事件总线（layer 级别提供） |

```typescript
// bootstrap.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service
  const file = yield* File.Service
  const fileWatcher = yield* FileWatcher.Service
  const format = yield* Format.Service
  const lsp = yield* LSP.Service
  const plugin = yield* Plugin.Service
  const project = yield* Project.Service
  const reference = yield* Reference.Service
  const shareNext = yield* ShareNext.Service
  const snapshot = yield* Snapshot.Service
  const vcs = yield* Vcs.Service

  const run = Effect.gen(function* () {
    const ctx = yield* InstanceState.context
    yield* config.get()  // eager load config
    yield* plugin.init() // plugin before everything else
    yield* Effect.forEach(
      [reference, lsp, shareNext, format, file, fileWatcher, vcs, snapshot, project],
      (s) => s.init().pipe(Effect.catchCause(/* log warning */)),
      { concurrency: "unbounded", discard: true },
    )
  })

  return Service.of({ run })
}))
```

## 核心接口

```typescript
// bootstrap-service.ts
export interface Interface {
  readonly run: Effect.Effect<void>
}
```

接口极简：只有一个 `run` 方法，执行完整的实例初始化流程。

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/InstanceBootstrap") {}
```

### 两层架构

```
bootstrap-service.ts (轻量级)
  ├── 定义 Service 标签: @opencode/InstanceBootstrap
  ├── 定义 Interface: { run: Effect<void> }
  └── 不包含任何实现细节

bootstrap.ts (实现)
  ├── 导入所有子系统的 Service
  ├── 实现 layer: 在 layer 构造时 yield* 所有依赖
  └── 实现 run: 按顺序初始化所有子系统

instance-layer.ts (延迟导入)
  └── Layer.unwrap(Effect.promise(() => import("./bootstrap")))
       └── 运行时动态导入，避免循环依赖
```

## 关键实现细节

### run — 初始化流程

```
run
  ├── 1. yield* InstanceState.context → 获取实例上下文
  ├── 2. Effect.logInfo("bootstrapping") → 记录日志
  ├── 3. config.get() → 主动加载配置（生成清晰的 trace）
  ├── 4. plugin.init() → 初始化插件
  │     └── 原因：插件可能修改配置，必须在其他服务之前初始化
  └── 5. Effect.forEach([...services], init, { concurrency: "unbounded" })
        ├── reference.init()    — 命名引用
        ├── lsp.init()          — LSP 服务器
        ├── shareNext.init()    — 分享服务
        ├── format.init()       — 代码格式化
        ├── file.init()         — 文件服务
        ├── fileWatcher.init()  — 文件监控
        ├── vcs.init()          — 版本控制
        ├── snapshot.init()     — 快照
        └── project.init()      — 项目服务
```

### 初始化顺序设计

初始化分为三个阶段：

1. **Config 先行**：`config.get()` 在所有其他操作之前执行，因为几乎所有服务都依赖配置。主动调用（而非等待 lazy load）确保在 trace 中清晰可见

2. **Plugin 独行**：`plugin.init()` 必须单独在第二阶段执行，因为插件可以修改配置（如注册 provider、添加 tool），修改后的配置会被后续服务使用

3. **并行批量初始化**：其余 9 个服务通过 `Effect.forEach` 以 `concurrency: "unbounded"` 并行初始化，最大化启动速度

### 错误处理

每个服务的 `init()` 都包装了 `Effect.catchCause`：

```typescript
(s) => s.init().pipe(
  Effect.catchCause((cause) => Effect.logWarning("init failed", { cause }))
)
```

单个服务初始化失败不会阻止其他服务启动，仅记录警告日志。这确保了实例的**部分可用性**——即使某个服务无法启动，其余服务仍可正常工作。

### 延迟导入机制 (InstanceLayer)

```typescript
// instance-layer.ts
export const layer = Layer.unwrap(
  Effect.promise(async () => {
    const { InstanceBootstrap } = await import("./bootstrap")
    return InstanceStore.defaultLayer.pipe(Layer.provide(InstanceBootstrap.defaultLayer))
  }),
)
```

使用 `Layer.unwrap` + 动态 `import()` 实现延迟加载：
- `InstanceStore` 在 layer 定义中只依赖轻量级的 `bootstrap-service.ts`
- 实际运行时通过 `InstanceLayer.layer` 才导入完整的 `bootstrap.ts`
- 这打破了 `InstanceStore` ↔ `InstanceBootstrap` 的循环依赖

### Span 追踪

```typescript
const run = Effect.gen(function* () {
  // ...
}).pipe(Effect.withSpan("InstanceBootstrap"))
```

`run` 和内部的 `Effect.forEach` 都使用 `Effect.withSpan` 包裹，在 OpenTelemetry trace 中生成清晰的跨度层级：

```
InstanceBootstrap
  └── InstanceBootstrap.init
        ├── reference.init
        ├── lsp.init
        ├── shareNext.init
        ├── ...
        └── project.init
```

### 日志注解

```typescript
Effect.logInfo("bootstrapping").pipe(Effect.annotateLogs("directory", ctx.directory))
```

所有 bootstrap 相关日志都附带 `directory` 注解，便于按实例过滤和排查问题。

## 关键设计决策

1. **轻量级接口 + 延迟实现**：`bootstrap-service.ts` 只定义 Service 标签，实际实现在 `bootstrap.ts` 中通过 `InstanceLayer` 延迟导入。这解决了 `InstanceStore` 和 `InstanceBootstrap` 之间的循环依赖问题

2. **Config 主动加载**：在 `run` 中主动调用 `config.get()` 而非依赖 lazy load，确保在 OpenTelemetry trace 中清晰可见，便于性能分析

3. **Plugin 独立初始化阶段**：插件在 Config 之后、其他服务之前单独初始化，因为插件可以修改配置，修改后的配置必须对其他服务可见

4. **并行启动 + 独立失败隔离**：9 个服务以 `concurrency: "unbounded"` 并行初始化，每个服务的失败被独立捕获，不影响其他服务

5. **Layer 构造时预加载依赖**：所有子系统的 Service 在 `Layer.effect` 的生成器函数中通过 `yield*` 预加载（而非在 `run` 中），确保依赖在 layer 构造阶段就完成注入

6. **结构化 Span**：使用 `Effect.withSpan` 为整个 bootstrap 流程创建 OpenTelemetry span，便于分布式追踪和性能诊断
