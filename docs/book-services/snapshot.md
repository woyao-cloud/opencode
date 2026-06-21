# @opencode/Snapshot — 快照服务
> 婧愭枃浠? `opencode/packages/opencode/src/snapshot/index.ts`

## 概述

`@opencode/Snapshot` 提供基于 Git 的文件系统快照功能，用于追踪会话过程中的文件变更、生成 diff、还原文件以及回退 patch。它在一个独立的 bare Git 仓库中维护文件快照，支持 track（创建快照）、patch（获取变更文件列表）、diff（获取文本 diff）、diffFull（获取结构化 diff）、restore（还原到某次快照）和 revert（回退指定 patches）操作。

该服务是 Agent 工具调用文件操作后追踪变更、支持用户撤销和 diff 展示的核心基础设施。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统操作：读写文件、检查存在性、获取文件状态 |
| `AppProcess` | `@opencode-ai/core/process` | 子进程管理，执行 git 命令 |
| `Config` | `@opencode/Config` | 读取 `snapshot` 配置项（是否启用快照） |

```typescript
// index.ts layer 定义
export const layer: Layer.Layer<Service, never, AppFileSystem.Service | AppProcess.Service | Config.Service> =
  Layer.effect(Service, Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service
    const appProcess = yield* AppProcess.Service
    const config = yield* Config.Service
    // ...
  }))
```

## 核心接口

```typescript
export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly cleanup: () => Effect.Effect<void>
  readonly track: () => Effect.Effect<string | undefined>
  readonly patch: (hash: string) => Effect.Effect<Patch>
  readonly restore: (snapshot: string) => Effect.Effect<void>
  readonly revert: (patches: Patch[]) => Effect.Effect<void>
  readonly diff: (hash: string) => Effect.Effect<string>
  readonly diffFull: (from: string, to: string) => Effect.Effect<FileDiff[]>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Snapshot") {}
```

使用示例：

```typescript
// 创建快照
const hash = yield* Snapshot.Service.track()

// 获取变更
const patch = yield* Snapshot.Service.patch(hash)

// 还原文件
yield* Snapshot.Service.restore(hash)

// 获取结构化 diff
const diffs = yield* Snapshot.Service.diffFull(fromHash, toHash)
```

## 数据结构

### Patch

```typescript
export const Patch = Schema.Struct({
  hash: Schema.String,
  files: Schema.mutable(Schema.Array(Schema.String)),
})
```

| 字段 | 说明 |
|------|------|
| `hash` | 快照的 Git tree hash |
| `files` | 变更的绝对文件路径列表 |

### FileDiff

```typescript
export const FileDiff = Schema.Struct({
  file: Schema.optional(Schema.String),
  patch: Schema.optional(Schema.String),
  additions: Schema.Finite,
  deletions: Schema.Finite,
  status: Schema.optional(Schema.Literals(["added", "deleted", "modified"])),
})
```

| 字段 | 说明 |
|------|------|
| `file` | 文件路径（可选，兼容旧数据） |
| `patch` | unified diff 文本（可选） |
| `additions` | 新增行数 |
| `deletions` | 删除行数 |
| `status` | 文件状态：added / deleted / modified |

## 关键实现细节

### Git 仓库结构

快照使用独立的 bare Git 仓库，存储在 `Global.Path.data/snapshot/<project_id>/<worktree_hash>/` 路径下。通过 `--git-dir` 和 `--work-tree` 参数将 Git 操作指向独立的仓库和工作树。

### 实例绑定

服务通过 `InstanceState` 与项目实例绑定，每个项目实例有独立的 Git 仓库和工作树配置：

```typescript
const state = yield* InstanceState.make<State>(
  Effect.fn("Snapshot.state")(function* (ctx) {
    const state = {
      directory: ctx.directory,
      worktree: ctx.worktree,
      gitdir: path.join(Global.Path.data, "snapshot", ctx.project.id, Hash.fast(ctx.worktree)),
      vcs: ctx.project.vcs,
    }
    // ...
  })
)
```

### track 流程

```
track()
  ├── 1. 检查 enabled（vcs=git 且 config.snapshot !== false）
  ├── 2. 如果仓库不存在，git init + 配置（core.autocrlf、longpaths、symlinks、fsmonitor）
  ├── 3. add()：收集变更文件
  │     ├── git diff-files --name-only（已跟踪变更文件）
  │     ├── git ls-files --others（未跟踪文件）
  │     ├── 通过 git check-ignore 排除被 .gitignore 忽略的文件
  │     ├── 排除超过 2MB 的大文件（添加到 git info/exclude）
  │     └── git add 暂存允许的文件
  └── 4. git write-tree → 返回 tree hash
```

### 并发安全

所有 Git 操作通过 Semaphore（信号量）按 `gitdir` 加锁，防止同一个快照仓库的并发操作导致竞态条件：

```typescript
const locked = <A, E, R>(fx: Effect.Effect<A, E, R>) => lock(state.gitdir).withPermits(1)(fx)
```

### revert 批处理

`revert` 方法支持批量回退多个 patch，优化策略如下：

- 按 hash 分组，同一 hash 下的文件可批量 checkout
- 避免路径冲突（父子目录关系）的文件放在同一批次
- 每批最多 100 个文件
- 先用 `git ls-tree` 确认文件在快照中存在，不存在的直接删除
- 批量操作失败时回退到单文件 revert

### diffFull 流程

```
diffFull(from, to)
  ├── 1. git diff --name-status → 获取文件变更状态（A/D/M）
  ├── 2. git diff --numstat → 获取新增/删除行数
  ├── 3. git cat-file --batch → 批量读取文件内容（优化性能）
  │     └── 失败时回退到逐文件 git show
  ├── 4. 解析 cat-file 输出（header + content 的二进制格式）
  ├── 5. 使用 diff 库生成 structuredPatch → formatPatch
  └── 6. 过滤 gitignored 文件
```

### 清理

服务启动时自动启动一个定时清理任务，每小时执行一次 `git gc --prune=7.days`，清理 7 天前的松散对象。

## 关键设计决策

1. **独立 bare 仓库**：不依赖项目的 `.git` 目录，避免干扰项目自身的版本控制。使用 `GIT_DIR` 环境变量和 `--git-dir` 参数操作独立仓库

2. **按 worktree 隔离**：通过 `Hash.fast(ctx.worktree)` 哈希区分不同工作树，使得同一项目的多个工作树各自拥有独立的快照仓库

3. **gitignore 感知**：通过 `git check-ignore --no-index` 检查文件是否被忽略，自动排除用户不想追踪的文件

4. **大文件排除**：超过 2MB 的文件不追踪，并自动添加到 `info/exclude` 防止后续重复检查

5. **Semaphore 锁**：所有 Git 操作通过信号量串行化，避免并发写入导致的仓库损坏

6. **cat-file 批量读取**：`diffFull` 优先使用 `git cat-file --batch` 批量读取文件内容，比逐文件 `git show` 更高效；仅在批量模式失败时回退到逐文件模式

7. **文件删除策略**：`revert` 时如果文件在快照中不存在，直接删除文件（而非保留），确保回退到干净状态

8. **结构化 diff**：使用 `diff` 库的 `structuredPatch` + `formatPatch` 生成 unified diff，而非直接使用原始 git diff 输出
