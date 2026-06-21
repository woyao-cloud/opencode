# @opencode/Project — 项目发现与管理服务

## 概述

`@opencode/Project` 是 OpenCode 的**项目发现与管理中心**，负责从文件系统目录中识别 Git 项目、分配唯一 Project ID、管理项目元数据（名称、图标、沙箱目录），并将其持久化到 SQLite 数据库。它基于 Effect 框架实现，对外暴露为 Effect Service。

当用户在某个目录中启动 OpenCode 时，Project 服务通过 `fromDirectory()` 自动探测 `.git` 目录、解析 Git worktree 结构、分配 Project ID（基于首次 commit hash），并将项目信息 upsert 到数据库。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统操作：遍历目录、读写文件、glob 匹配 |
| `Path` | `@effect/platform-node` | 路径解析、规范化 |
| `ChildProcessSpawner` | `effect/unstable/process` | 执行 `git` 命令 |
| `Bus` | `@opencode/Bus` | 发布 `project.updated` 事件 |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 实验性功能开关（如 `experimentalIconDiscovery`） |

```typescript
// project.ts layer 定义
export const layer: Layer.Layer<
  Service,
  never,
  AppFileSystem.Service | Path.Path | ChildProcessSpawner.ChildProcessSpawner | Bus.Service | RuntimeFlags.Service
> = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service
  const pathSvc = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const bus = yield* Bus.Service
  const flags = yield* RuntimeFlags.Service
  // ...
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly fromDirectory: (directory: string) => Effect.Effect<{ project: Info; sandbox: string }>
  readonly discover: (input: Info) => Effect.Effect<void>
  readonly list: () => Effect.Effect<Info[]>
  readonly get: (id: ProjectID) => Effect.Effect<Info | undefined>
  readonly update: (input: UpdateInput) => Effect.Effect<Info>
  readonly initGit: (input: { directory: string; project: Info }) => Effect.Effect<Info>
  readonly setInitialized: (id: ProjectID) => Effect.Effect<void>
  readonly sandboxes: (id: ProjectID) => Effect.Effect<string[]>
  readonly addSandbox: (id: ProjectID, directory: string) => Effect.Effect<void>
  readonly removeSandbox: (id: ProjectID, directory: string) => Effect.Effect<void>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Project") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 从目录发现项目
const { project, sandbox } = yield* Project.Service.fromDirectory("/path/to/project")

// 列出所有已知项目
const projects = yield* Project.Service.list()

// 更新项目元数据
yield* Project.Service.update({ projectID: "abc123", name: "My Project" })
```

## 数据结构

### Info

```typescript
export const Info = Schema.Struct({
  id: ProjectID,                                        // 唯一标识（基于首次 commit hash 或 "global"）
  worktree: Schema.String,                              // git worktree 根目录
  vcs: optionalOmitUndefined(Schema.Literal("git")),    // 版本控制系统类型
  name: optionalOmitUndefined(Schema.String),           // 项目名称
  icon: optionalOmitUndefined(ProjectIcon),             // 项目图标
  commands: optionalOmitUndefined(ProjectCommands),     // 启动命令
  time: ProjectTime,                                    // 时间戳
  sandboxes: Schema.Array(Schema.String),               // 关联的沙箱目录列表
})
```

### ProjectIcon

```typescript
const ProjectIcon = Schema.Struct({
  url: optionalOmitUndefined(Schema.String),       // favicon 的 data: URI
  override: optionalOmitUndefined(Schema.String),  // 用户手动覆盖的图标 URL
  color: optionalOmitUndefined(Schema.String),     // 图标颜色
})
```

### ProjectCommands

```typescript
const ProjectCommands = Schema.Struct({
  start: optionalOmitUndefined(Schema.String),     // 创建 workspace 时执行的启动脚本
})
```

### ProjectTime

```typescript
const ProjectTime = Schema.Struct({
  created: NonNegativeInt,
  updated: NonNegativeInt,
  initialized: optionalOmitUndefined(NonNegativeInt),
})
```

### 数据库表 (project.sql.ts)

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | `text` (PK) | ProjectID |
| `worktree` | `text` | worktree 根目录路径 |
| `vcs` | `text?` | VCS 类型 |
| `name` | `text?` | 项目名称 |
| `icon_url` | `text?` | 图标 data URI |
| `icon_url_override` | `text?` | 手动覆盖的图标 URL |
| `icon_color` | `text?` | 图标颜色 |
| `time_created` / `time_updated` / `time_initialized` | `integer` | 时间戳 |
| `sandboxes` | `text` (JSON) | 沙箱目录数组 |
| `commands` | `text` (JSON) | 启动命令对象 |

## 关键实现细节

### fromDirectory — 项目发现流程

```
fromDirectory(directory)
  ├── 1. fs.up({ targets: [".git"] }) — 向上查找 .git 目录
  ├── 2. 如果未找到 .git → 返回全局项目 (ProjectID.global)
  ├── 3. git rev-parse --git-common-dir → 解析 git common dir
  ├── 4. git config --bool core.bare → 检查是否为 bare repo
  ├── 5. 计算 worktree 路径（普通 repo vs bare repo vs worktree）
  ├── 6. 读取 .git/opencode 缓存文件获取已分配的 Project ID
  ├── 7. git rev-list --max-parents=0 HEAD → 获取首次 commit hash 作为 ID
  │     └── 写入 .git/opencode 缓存文件
  ├── 8. git rev-parse --show-toplevel → 确定 sandbox 根目录
  └── 9. Upsert 到 project 表，合并 sandbox 列表
```

### Project ID 分配策略

- **优先读取缓存**：在 `.git/opencode` 文件中缓存 Project ID
- **fallback 到首次 commit**：使用 `git rev-list --max-parents=0 HEAD` 获取根 commit hash
- **全局项目**：非 git 目录或无 git 命令时使用 `ProjectID.global`（值为 `"global"`）
- **FAKE_VCS 标志**：通过 `Flag.OPENCODE_FAKE_VCS` 环境变量可在无 git 环境下模拟 VCS

### 图标自动发现 (discover)

当 `experimentalIconDiscovery` 标志启用时，`fromDirectory` 会在后台 fork 执行 `discover()`：

```
discover(input)
  ├── 跳过条件：非 git 项目 / 已有手动覆盖 / 已有图标 URL
  └── fs.glob("**/favicon.{ico,png,svg,jpg,jpeg,webp}") → 取最短路径
       └── 读取文件 → Base64 编码 → data: URI → 写入 icon.url
```

### 事件发布

每次项目更新后通过 `GlobalBus` 发布 `project.updated` 事件：

```typescript
const Event = {
  Updated: BusEvent.define("project.updated", Info),
}
```

### Sandbox 管理

- `addSandbox`：向项目的 sandbox 列表添加目录（去重）
- `removeSandbox`：从 sandbox 列表移除目录
- 每次 `fromDirectory` 调用时会验证所有 sandbox 目录是否存在，自动清理失效路径
- 同时提供同步版本的 `list()` 和 `get()` 函数（直接访问 Database，不经过 Effect）

### init — 实例初始化

监听 `/init` 命令的执行事件，当 `/init` 被触发时自动调用 `setInitialized` 记录初始化时间戳：

```typescript
const initState = yield* InstanceState.make(
  Effect.fn("Project.initState")(function* (ctx) {
    yield* bus.subscribe(Command.Event.Executed).pipe(
      Stream.runForEach((payload) =>
        payload.properties.name === Command.Default.INIT ? setInitialized(ctx.project.id) : Effect.void,
      ),
      Effect.forkScoped,
    )
  }),
)
```

## 关键设计决策

1. **基于首次 commit 的 ID 策略**：使用 `git rev-list --max-parents=0 HEAD` 的根 commit hash 作为项目唯一标识，确保同一仓库在不同机器上获得相同 ID，支持跨设备识别

2. **缓存文件机制**：在 `.git/opencode` 文件中缓存 Project ID，避免重复执行 `rev-list`，提升后续启动性能

3. **全局项目兜底**：非 Git 目录使用 `ProjectID.global`，确保在任何目录下都能正常工作

4. **Bare repo 与 worktree 支持**：正确处理 bare repository 和 git worktree 的路径解析，区分 `common dir` 与 `sandbox`

5. **Session 归属迁移**：当项目从 global 变为具体项目时，自动将关联的 session 的 `project_id` 从 global 更新为真实项目 ID

6. **图标自动发现为实验性功能**：通过 `RuntimeFlags.experimentalIconDiscovery` 控制，且以 `forkIn(scope)` 异步执行，不阻塞主流程

7. **Sandbox 存活检查**：每次加载时验证所有 sandbox 目录是否存在，自动清理已删除的目录，保持数据一致性
