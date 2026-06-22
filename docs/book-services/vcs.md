# @opencode/Vcs — 版本控制抽象服务
> 源文件: `opencode/packages/opencode/src/project/vcs.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/project/vcs.ts`

## 概述

`@opencode/Vcs` 是 OpenCode 的**版本控制抽象层**，在 Git 之上提供统一的文件变更追踪、差异生成和补丁应用接口。它封装了 `@opencode/Git` 服务，将原始的 git 输出转换为结构化的文件状态、差异数据，并支持分支感知的差异计算（当前分支 vs 默认分支）。对外暴露为 Effect Service，是 Agent 感知代码变更的核心依赖。

Vcs 支持两种 diff 模式：`"git"`（diff against HEAD，即未提交变更）和 `"branch"`（diff against merge-base with default branch，即分支级变更）。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Git` | `@opencode/Git` | 底层 Git 命令执行（status、diff、patch、merge-base 等） |
| `Bus` | `@opencode/Bus` | 发布 `vcs.branch.updated` 事件 |
| `FileWatcher` | `@opencode/FileWatcher` | 监听 `.git/HEAD` 文件变更以检测分支切换 |

```typescript
// vcs.ts layer 定义
export const layer: Layer.Layer<Service, never, Git.Service | Bus.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const git = yield* Git.Service
    const bus = yield* Bus.Service
    const scope = yield* Scope.Scope
    // ...
  }),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly branch: () => Effect.Effect<string | undefined>
  readonly defaultBranch: () => Effect.Effect<string | undefined>
  readonly status: () => Effect.Effect<FileStatus[]>
  readonly diff: (mode: Mode) => Effect.Effect<FileDiff[]>
  readonly diffRaw: () => Effect.Effect<string>
  readonly apply: (input: ApplyInput) => Effect.Effect<ApplyResult, PatchApplyError>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Vcs") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取分支名
const branch = yield* Vcs.Service.branch()

// 获取文件变更状态
const status = yield* Vcs.Service.status()

// 获取未提交变更的 diff（含 patch 内容）
const diffs = yield* Vcs.Service.diff("git")

// 获取相对于默认分支的 diff
const branchDiffs = yield* Vcs.Service.diff("branch")

// 应用补丁
yield* Vcs.Service.apply({ patch: "diff --git ..." })
```

## 数据结构

### Mode

```typescript
export const Mode = Schema.Literals(["git", "branch"])
// "git"    — diff against HEAD（未提交变更）
// "branch" — diff against merge-base with default branch（分支级变更）
```

### Info (VcsInfo)

```typescript
export const Info = Schema.Struct({
  branch: Schema.optional(Schema.String),          // 当前分支名
  default_branch: Schema.optional(Schema.String),  // 默认分支名
})
```

### FileDiff

```typescript
export const FileDiff = Schema.Struct({
  file: Schema.String,                                       // 文件路径
  patch: Schema.optional(Schema.String),                     // diff patch 内容
  additions: Schema.Finite,                                  // 新增行数
  deletions: Schema.Finite,                                  // 删除行数
  status: Schema.optional(Schema.Literals(["added", "deleted", "modified"])),
})
```

### FileStatus

```typescript
export const FileStatus = Schema.Struct({
  file: Schema.String,
  additions: Schema.Finite,
  deletions: Schema.Finite,
  status: Schema.Literals(["added", "deleted", "modified"]),
})
```

### ApplyInput / ApplyResult

```typescript
export const ApplyInput = Schema.Struct({ patch: Schema.String })
export const ApplyResult = Schema.Struct({ applied: Schema.Boolean })
```

### PatchApplyError

```typescript
export class PatchApplyError extends Schema.TaggedErrorClass<PatchApplyError>()("VcsPatchApplyError", {
  message: Schema.String,
  reason: Schema.Literals(["non-git", "not-clean"]),
}) {}
```

## 关键实现细节

### 分支状态管理

Vcs 在 `init()` 时通过 `InstanceState` 缓存当前分支和默认分支信息，并监听 `FileWatcher.Event.Updated`（过滤 `.git/HEAD` 文件变更）来检测分支切换：

```typescript
const state = yield* InstanceState.make<State>(
  Effect.fn("Vcs.state")(function* (ctx) {
    if (ctx.project.vcs !== "git") {
      return { current: undefined, root: undefined }
    }
    const [current, root] = yield* Effect.all([git.branch(ctx.directory), git.defaultBranch(ctx.directory)], {
      concurrency: 2,
    })
    // 监听 HEAD 文件变更
    yield* bus.subscribe(FileWatcher.Event.Updated).pipe(
      Stream.filter((evt) => evt.properties.file.endsWith("HEAD")),
      Stream.runForEach((_evt) => /* 检查分支是否变化 */),
      Effect.forkScoped,
    )
    return { current, root }
  }),
)
```

分支变更时自动发布 `Vcs.Event.BranchUpdated` 事件。

### diff("git") — 未提交变更

```
diff("git")
  ├── 非 git 项目 → 返回空数组
  ├── 无 HEAD → track(git, cwd, undefined) 只返回 status 结果（无 patch）
  └── 有 HEAD → track(git, cwd, "HEAD")
       ├── git.diff(cwd, "HEAD")  → 获取变更文件列表
       ├── git.stats(cwd, "HEAD") → 获取增删行数
       ├── git.status(cwd)        → 获取未追踪文件
       ├── batchPatches()         → 批量获取 patch（一次 git patchAll）
       └── files()                → 逐文件组装 FileDiff 结果
```

### diff("branch") — 分支级变更

```
diff("branch")
  ├── 非 git 项目 → 返回空数组
  ├── 无默认分支 → 返回空数组
  ├── 当前分支 == 默认分支 → 返回空数组
  └── git.mergeBase(cwd, root.ref) → 计算 merge-base
       └── diffAgainstRef(git, cwd, mergeBaseRef)
            ├── git.diff(cwd, ref) → 变更文件列表
            ├── git.stats(cwd, ref) → 增删行数
            └── batchPatches + files → 组装结果
```

### Patch 生成策略

- **批量优先**：先通过 `git.patchAll()` 一次性获取所有文件的 patch，再按文件拆分
- **独立回退**：批量 patch 中未覆盖的文件（如 untracked `??`），单独调用 `git.patchUntracked()`
- **大小限制**：
  - 单文件 patch：`MAX_PATCH_BYTES = 10,000,000` (10MB)
  - 总 patch 预算：`MAX_TOTAL_PATCH_BYTES = 10,000,000` (10MB)
  - 上下文行数：`PATCH_CONTEXT_LINES = 2,147,483,647`（即 `--unified=` 无限上下文）
- **超限回退**：超出限制时返回空 patch（`emptyPatch`），防止内存溢出

### diffRaw — 原始 diff 文本

直接拼接所有文件的 raw diff 输出，用于跨 workspace session warp 时传递文件变更：

```typescript
diffRaw()
  ├── git.patchAll(cwd, "HEAD") → 已追踪文件的 diff
  └── git.patchUntracked(cwd, file) × N → 未追踪文件逐个 diff
       └── 用 "\n" 连接所有结果
```

### apply — 补丁应用

```typescript
apply(input: ApplyInput)
  ├── 非 git 项目 → PatchApplyError("non-git")
  ├── git.applyPatch(cwd, patch) → 调用 git apply
  └── 失败 → PatchApplyError("not-clean")
```

### Git Patch 解析工具函数

- `parseQuotedPath` — 解析 C 风格转义的引号路径（`\t`, `\n`, `\"` 等）
- `fileFromDiffPath` — 从 `a/` / `b/` 前缀路径提取文件名
- `fileFromGitHeader` — 从 `diff --git a/file b/file` 头部提取文件名
- `splitGitPatch` — 将批量 patch 按 `diff --git` 分割为独立文件 patch
- `merge` — 合并多个文件列表（去重，保留最后出现的项）

## 关键设计决策

1. **双模式 diff**：`"git"` 模式用于展示未提交变更（Agent 工作上下文），`"branch"` 模式用于展示分支级变更（PR 上下文），通过 merge-base 计算确保只展示当前分支独有的变更

2. **批量 patch 获取**：优先使用 `git patchAll` 一次性获取所有文件的 patch（一次 git 调用），而非逐文件调用，大幅减少 git 进程启动开销

3. **严格的字节预算**：单文件和总 patch 均限制在 10MB，超出部分返回空 patch，防止大文件导致内存问题

4. **无限上下文**：patch 生成使用 `--unified=2,147,483,647`（接近 int32 最大值），确保 Agent 获得完整的文件上下文

5. **分支变更实时检测**：通过 FileWatcher 监听 `.git/HEAD` 文件变更，而非轮询 git 命令，实现零开销的分支切换检测

6. **错误类型化**：使用 Effect Schema 的 `TaggedErrorClass` 定义 `PatchApplyError`，使调用方可以精确匹配 `reason`（`"non-git"` vs `"not-clean"`）进行差异化处理
