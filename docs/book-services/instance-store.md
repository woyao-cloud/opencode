# @opencode/InstanceStore — 实例生命周期管理服务
> 婧愭枃浠? `opencode/packages/opencode/src/project/instance-store.ts`

## 概述

`@opencode/InstanceStore` 是 OpenCode 的**实例生命周期管理服务**，负责创建、缓存、重载和销毁项目实例（Instance）。一个实例代表一个工作目录的完整运行时上下文（包含项目信息、配置、服务初始化状态），通过 `InstanceContext` 将目录、worktree 和项目信息绑定在一起。

InstanceStore 提供基于 `Deferred` 的并发安全加载机制，确保同一目录不会被并发初始化多次，支持实例级作用域隔离和优雅销毁。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Project` | `@opencode/Project` | 项目发现（`fromDirectory`），获取项目信息 |
| `InstanceBootstrap` | `@opencode/InstanceBootstrap` | 实例初始化（运行 bootstrap 流程） |

```typescript
// instance-store.ts layer 定义
export const layer: Layer.Layer<Service, never, Project.Service | InstanceBootstrap.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const project = yield* Project.Service
    const bootstrap = yield* InstanceBootstrap.Service
    const scope = yield* Scope.Scope
    // ...
  }),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly load: (input: LoadInput) => Effect.Effect<InstanceContext>
  readonly reload: (input: LoadInput) => Effect.Effect<InstanceContext>
  readonly dispose: (ctx: InstanceContext) => Effect.Effect<void>
  readonly disposeAll: () => Effect.Effect<void>
  readonly provide: <A, E, R>(input: LoadInput, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/InstanceStore") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 加载实例
const ctx = yield* InstanceStore.Service.load({ directory: "/path/to/project" })

// 在实例上下文中执行
yield* InstanceStore.Service.provide({ directory: "/path/to/project" }, Effect.gen(function* () {
  const ctx = yield* InstanceState.context
  // ctx.project, ctx.directory, ctx.worktree 可用
}))

// 重载实例
const newCtx = yield* InstanceStore.Service.reload({ directory: "/path/to/project" })

// 销毁实例
yield* InstanceStore.Service.dispose(ctx)
```

## 数据结构

### LoadInput

```typescript
export interface LoadInput {
  directory: string            // 工作目录（必需）
  worktree?: string            // worktree 路径（可选，已知时跳过 project.fromDirectory）
  project?: Project.Info       // 项目信息（可选，已知时跳过 project.fromDirectory）
}
```

### InstanceContext

```typescript
export interface InstanceContext {
  directory: string     // 工作目录
  worktree: string      // worktree/sandbox 根目录
  project: Project.Info // 项目信息
}
```

### Entry (内部)

```typescript
interface Entry {
  readonly deferred: Deferred.Deferred<InstanceContext>
}
```

使用 `Map<string, Entry>` 按目录缓存加载中的实例。

## 关键实现细节

### load — 并发安全的实例加载

```
load({ directory })
  ├── 1. AppFileSystem.resolve(directory) → 规范化目录路径
  ├── 2. Effect.uninterruptibleMask → 不可中断保护区
  ├── 3. 检查 cache.get(directory)：
  │     ├── 已存在 → Deferred.await(existing.deferred) 等待已有加载完成
  │     └── 不存在 → 创建新 Entry
  ├── 4. 异步启动 boot 流程（forkIn scope）：
  │     └── completeLoad(directory, input, entry)
  │           ├── boot({ directory, worktree?, project? })
  │           │     ├── 如果提供了 project + worktree → 直接构造 InstanceContext
  │           │     └── 否则 → project.fromDirectory(directory) → 构造 InstanceContext
  │           └── bootstrap.run → 运行初始化流程
  │           └── Deferred.done(entry.deferred, exit) → 通知等待者
  └── 5. Deferred.await(entry.deferred) → 等待 boot 完成并返回结果
```

关键设计：`Deferred` 确保同一目录的并发 `load` 调用共享同一个初始化过程。第二个调用者不会重复初始化，而是等待第一个调用的结果。

### boot — 实例初始化

```typescript
const boot = (input: LoadInput & { directory: string }) =>
  Effect.gen(function* () {
    const ctx: InstanceContext =
      input.project && input.worktree
        ? { directory: input.directory, worktree: input.worktree, project: input.project }
        : yield* project.fromDirectory(input.directory).pipe(
            Effect.map((result) => ({
              directory: input.directory,
              worktree: result.sandbox,
              project: result.project,
            })),
          )
    yield* bootstrap.run.pipe(Effect.provideService(InstanceRef, ctx))
    return ctx
  })
```

初始化分两步：
1. **构造 InstanceContext**：优先使用调用方提供的信息，否则通过 `project.fromDirectory` 自动发现
2. **运行 bootstrap**：将 `InstanceContext` 注入到 `InstanceRef`，然后执行 `InstanceBootstrap.run`

### reload — 实例重载

```
reload({ directory })
  ├── 1. 创建新的 Entry（替换旧的）
  ├── 2. 等待之前的 Deferred 完成（忽略结果）
  ├── 3. runDisposers(directory) → 执行旧的清理函数
  ├── 4. emitDisposed → 发布 "server.instance.disposed" 事件
  └── 5. completeLoad → 重新 boot
```

### dispose — 实例销毁

```
dispose(ctx)
  ├── cache.get(ctx.directory) 不存在 → 直接执行 disposeContext(ctx)
  └── cache 中存在：
       ├── Deferred.await → 等待加载完成
       ├── 加载失败 → removeEntry（清理缓存）
       └── 加载成功但 ctx 不匹配 → 跳过（新实例已替代）
            └── 否则 → disposeEntry(directory, entry, ctx)
                  ├── disposeContext(ctx)
                  │     ├── runDisposers(ctx.directory) → 执行清理函数
                  │     └── GlobalBus.emit("server.instance.disposed")
                  └── cache.delete(directory)
```

### disposeAll — 批量销毁

```
disposeAll()
  ├── Effect.cachedWithTTL(disposeAllOnce(), Duration.zero)
  └── disposeAllOnce()
       └── 遍历 cache 所有 entry
            ├── Deferred.await → 等待完成
            ├── 失败 → removeEntry
            └── 成功 → disposeEntry
```

使用 `Effect.cachedWithTTL` 配合 `Duration.zero` 确保 `disposeAllOnce` 在单次 Effect 执行中只运行一次（幂等保护），因为 `addFinalizer` 可能在多个上下文中触发。

### provide — 便捷执行

```typescript
const provide = <A, E, R>(input: LoadInput, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  load(input).pipe(Effect.flatMap((ctx) => effect.pipe(Effect.provideService(InstanceRef, ctx))))
```

加载实例后自动将 `InstanceContext` 注入到 `InstanceRef`，使 `effect` 内可以通过 `InstanceState.context` 访问实例信息。

### 事件发布

| 事件 | 类型 | 触发时机 |
|------|------|----------|
| 实例销毁 | `"server.instance.disposed"` | dispose 或 reload 旧实例清理时 |

通过 `GlobalBus` 发布，携带 `directory`、`project`、`workspace` 上下文。

## 关键设计决策

1. **Deferred 并发去重**：使用 Effect 的 `Deferred` 原语实现同一目录的加载去重。多个并发 `load` 调用共享同一个 Deferred，后续调用者等待而非重复初始化

2. **uninterruptibleMask 保护**：load/reload 使用 `Effect.uninterruptibleMask` 确保缓存注册和 Deferred 创建的原子性，防止中断导致的不一致状态

3. **forkIn scope 异步初始化**：boot 流程在 scope 内 fork 执行，load 调用者通过 Deferred 等待结果。这允许初始化过程中的长耗时操作（如 git 命令）不阻塞调用方

4. **reload 旧实例清理**：reload 时先等待旧实例完成、运行清理函数、发布销毁事件，再启动新的 boot，确保状态转换干净

5. **轻量级服务接口**：`InstanceStore` 只依赖 `Project` 和 `InstanceBootstrap`（轻量 tag），实际的 bootstrap 实现通过 `InstanceLayer` 延迟导入，避免循环依赖

6. **disposeAll 幂等保护**：使用 `Effect.cachedWithTTL(Duration.zero)` 确保在一次 Effect 执行上下文中 `disposeAll` 只执行一次

7. **InstanceContext 注入链**：通过 `InstanceRef` 将 context 注入 Effect 环境，下游服务通过 `InstanceState.context` 获取，形成清晰的依赖链
