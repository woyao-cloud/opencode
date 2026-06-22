# @opencode/FileWatcher — 文件监控服务
> 源文件: `opencode/packages/opencode/src/file/watcher.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/file/watcher.ts`

## 概述

`@opencode/FileWatcher` 是 OpenCode 的**文件系统监控服务**，基于 `@parcel/watcher` 原生绑定实现跨平台的文件变更监听。当工作区中的文件发生创建、修改或删除时，通过 Bus 事件系统发布 `file.watcher.updated` 事件，供其他模块（如文件列表刷新、LSP 诊断更新等）响应。

该服务支持通过 `Config.watcher.ignore` 自定义忽略规则，并自动监听 `.git` 目录的变更（排除 `HEAD` 文件）。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 读取 `cfg.watcher.ignore` 自定义忽略规则 |
| `Git` | `@opencode/Git` | 获取 `.git` 目录路径和内容列表，用于监控 VCS 变更 |

```typescript
// watcher.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const git = yield* Git.Service
    // ...
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Config.defaultLayer),
  Layer.provide(Git.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly init: () => Effect.Effect<void>  // 初始化文件监控（启动 watcher）
}

export class Service extends Context.Service<Service, Interface>()("@opencode/FileWatcher") {}

// 工具函数：检查是否有原生绑定可用
export const hasNativeBinding = () => !!watcher()
```

使用方式：

```typescript
// 初始化文件监控
yield* FileWatcher.Service.init()
```

## 数据结构

### Event.Updated

```typescript
export const Event = {
  Updated: BusEvent.define(
    "file.watcher.updated",
    Schema.Struct({
      file: Schema.String,                                         // 变更文件的绝对路径
      event: Schema.Literals(["add", "change", "unlink"]),         // 事件类型
    }),
  ),
}
```

### 平台后端映射

```typescript
function getBackend() {
  if (process.platform === "win32") return "windows"
  if (process.platform === "darwin") return "fs-events"
  if (process.platform === "linux") return "inotify"
}
```

## 关键实现细节

### 原生绑定延迟加载

`@parcel/watcher` 的原生绑定通过 `lazy` 工具函数延迟加载，按平台和架构选择对应的原生模块：

```typescript
const watcher = lazy((): typeof import("@parcel/watcher") | undefined => {
  try {
    const binding = require(
      `@parcel/watcher-${process.platform}-${process.arch}${process.platform === "linux" ? `-${OPENCODE_LIBC || "glibc"}` : ""}`,
    )
    return createWrapper(binding) as typeof import("@parcel/watcher")
  } catch (error) {
    log.error("failed to load watcher binding", { error })
    return
  }
})
```

加载失败时返回 `undefined`，服务优雅降级（不监控但不阻塞启动）。

### 订阅回调

文件变更通过 `EffectBridge` 桥接到 Effect 世界，然后在回调中发布 Bus 事件：

```typescript
const cb: ParcelWatcher.SubscribeCallback = bridge.bind((err, evts) => {
  if (err) return
  for (const evt of evts) {
    if (evt.type === "create") void Bus.publish(Event.Updated, { file: evt.path, event: "add" })
    if (evt.type === "update") void Bus.publish(Event.Updated, { file: evt.path, event: "change" })
    if (evt.type === "delete") void Bus.publish(Event.Updated, { file: evt.path, event: "unlink" })
  }
})
```

`@parcel/watcher` 的三种事件类型映射为：
- `create` → `"add"`
- `update` → `"change"`
- `delete` → `"unlink"`

### 双路径订阅

服务可能订阅两个路径：

1. **工作区目录**（仅当 `OPENCODE_EXPERIMENTAL_FILEWATCHER` 标志启用时）：监控整个项目目录，忽略规则包括 `FileIgnore.PATTERNS`、用户配置的 `cfg.watcher.ignore` 和 Protected 路径
2. **`.git` 目录**（Git VCS 项目）：通过 `git rev-parse --git-dir` 获取实际 git 目录路径，解析符号链接后监控。忽略 `HEAD` 文件以避免循环触发

```typescript
if (yield* Flag.OPENCODE_EXPERIMENTAL_FILEWATCHER) {
  yield* Effect.forkScoped(
    subscribe(ctx.directory, [...FileIgnore.PATTERNS, ...cfgIgnores, ...protecteds(ctx.directory)]),
  )
}

if (ctx.project.vcs === "git") {
  // ... 获取 vcsDir，过滤 HEAD
  yield* Effect.forkScoped(subscribe(vcsDir, ignore))
}
```

### 订阅超时与错误处理

每次订阅设置 10 秒超时（`SUBSCRIBE_TIMEOUT_MS = 10_000`），超时或失败时取消订阅：

```typescript
const subscribe = (dir: string, ignore: string[]) => {
  const pending = w.subscribe(dir, cb, { ignore, backend })
  return Effect.gen(function* () {
    const sub = yield* Effect.promise(() => pending)
    subs.push(sub)
  }).pipe(
    Effect.timeout(SUBSCRIBE_TIMEOUT_MS),
    Effect.catchCause((cause) => {
      log.error("failed to subscribe", { dir, cause: Cause.pretty(cause) })
      pending.then((s) => s.unsubscribe()).catch(() => {})
      return Effect.void
    }),
  )
}
```

### Protected 路径过滤

`protecteds` 函数计算相对于监控目录的 Protected 路径列表，用于排除受保护目录的监控：

```typescript
function protecteds(dir: string) {
  return Protected.paths().filter((item) => {
    const rel = path.relative(dir, item)
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
  })
}
```

### 生命周期

State 创建时注册 `Effect.addFinalizer`，在实例销毁时取消所有订阅：

```typescript
yield* Effect.addFinalizer(() =>
  Effect.promise(() => Promise.allSettled(subs.map((sub) => sub.unsubscribe()))),
)
```

### 实验性开关

- `OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER`：完全禁用文件监控
- `OPENCODE_EXPERIMENTAL_FILEWATCHER`：启用工作区目录级别的监控（生产环境中此功能受此标志控制）

## 关键设计决策

1. **原生绑定 + 优雅降级**：使用 `@parcel/watcher` 的 C 扩展实现高性能文件监控，加载失败时服务静默降级（不监控），不影响整体启动

2. **双路径独立订阅**：工作区目录和 `.git` 目录分开订阅，各自拥有独立的忽略规则。`.git` 目录监控排除 `HEAD` 文件以避免每次提交时触发大量变更事件

3. **EffectBridge 桥接**：文件变更回调发生在原生绑定的事件循环中，通过 `EffectBridge.bind` 桥接到 Effect 运行时，确保 Bus 事件发布在正确的 Effect Fiber 上下文中

4. **forkScoped 异步启动**：两个订阅都以 `Effect.forkScoped` 方式启动，不阻塞 State 初始化。订阅失败只记录日志，不影响其他订阅

5. **订阅超时保护**：每个订阅设置 10 秒超时，防止底层原生绑定挂起导致服务永久阻塞
