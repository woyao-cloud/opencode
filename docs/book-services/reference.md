# @opencode/Reference — 引用解析服务

## 概述

`@opencode/Reference` 负责解析和管理命名引用（`@alias`），支持两种引用类型：**本地路径引用**（`path` / `~/` / `.` 开头）和 **Git 仓库引用**（Git URL 或 GitHub `owner/repo` 简写）。它通过 Effect 框架实现，按项目实例缓存解析结果，并在需要时自动克隆（materialize）Git 引用仓库。

该服务是 Agent 访问项目外部文件资源（如共享文档库、代码模板库）的核心通道。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 读取 `reference` 配置项（命名引用映射） |
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统操作，路径规范化 |
| `Git` | `@opencode/Git` | Git 操作，克隆和管理引用仓库 |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 功能开关（`experimentalScout` 控制是否启用） |

```typescript
// reference.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service
  const fs = yield* AppFileSystem.Service
  const git = yield* Git.Service
  const flags = yield* RuntimeFlags.Service
  // ...
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly list: () => Effect.Effect<Resolved[]>
  readonly get: (name: string) => Effect.Effect<Resolved | undefined>
  readonly ensure: (target?: string) => Effect.Effect<void>
  readonly contains: (target?: string) => Effect.Effect<boolean>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Reference") {}
```

使用示例：

```typescript
// 列出所有引用
const refs = yield* Reference.Service.list()

// 获取特定引用
const ref = yield* Reference.Service.get("docs")

// 确保引用仓库已克隆
yield* Reference.Service.ensure("/path/to/file")

// 检查目标是否在引用仓库中
const isInRef = yield* Reference.Service.contains("/some/file")
```

## 数据结构

### Resolved（解析结果，联合类型）

```typescript
export type Resolved =
  | { name: string; kind: "local"; path: string }
  | { name: string; kind: "git"; repository: string; reference: RepositoryReference; path: string; branch?: string }
  | { name: string; kind: "invalid"; repository: string; message: string }
```

| 字段 | 说明 |
|------|------|
| `name` | 引用别名（`@name`） |
| `kind` | 类型：`"local"`（本地路径）、`"git"`（Git 仓库）、`"invalid"`（无效） |
| `path` | 解析后的绝对路径 |
| `repository` | Git 引用时的仓库 URL |
| `reference` | 解析后的仓库引用结构（owner/repo/protocol 等） |
| `branch` | 指定分支（可选） |
| `message` | 无效引用时的错误说明 |

### ReferenceEntry（配置中的引用定义）

```typescript
type ReferenceEntry = NonNullable<Config.Info["reference"]>[string]
// 可以是 string（路径或仓库 URL）或 { path: string } 或 { repository: string; branch?: string }
```

## 关键实现细节

### 引用解析流程

```
resolve({ name, reference, directory, worktree })
  ├── reference 是 string
  │     ├── 以 . / / ~ 开头 → 本地路径引用
  │     └── 其他 → Git 仓库引用
  └── reference 是 object
        ├── 含 path → 本地路径引用
        └── 含 repository → Git 仓库引用
```

### 本地路径解析

```typescript
export function referencePath(input: { directory: string; worktree: string; value: string }) {
  if (input.value.startsWith("~/"))
    return path.join(Global.Path.home, input.value.slice(2))
  return path.isAbsolute(input.value)
    ? input.value
    : path.resolve(input.worktree === "/" ? input.directory : input.worktree, input.value)
}
```

- `~/` 前缀 → 相对于用户 home 目录
- 绝对路径 → 直接使用
- 相对路径 → 相对于 worktree 解析

### Git 引用校验

```typescript
function resolveGit(input): Resolved {
  const parsed = parseRepositoryReference(input.repository)
  if (!parsed || parsed.protocol === "file:")
    return { kind: "invalid", message: "Repository must be a git URL, host/path reference, or GitHub owner/repo shorthand" }
  return { kind: "git", repository, reference: parsed, path: repositoryCachePath(parsed), ...branch }
}
```

支持格式：Git URL（`https://`、`git@`）、GitHub 简写（`owner/repo`）。不支持 `file:` 协议。

### 冲突检测

`resolveAll` 检测多个引用指向同一缓存路径但要求不同分支的冲突：

```typescript
if (existing.branch === resolved.branch) return resolved
return {
  kind: "invalid",
  message: `Reference conflicts with @${existing.name}: both use ${resolved.path}, but @${existing.name} requests ${branchLabel(existing.branch)} and @${name} requests ${branchLabel(resolved.branch)}`
}
```

### 延迟克隆（Materialize）

Git 引用仓库不会在启动时立即克隆，而是通过以下机制延迟加载：

- `init()`：仅在 `experimentalScout` 开关启用时，在后台 Scope 中 fork 所有克隆任务
- `ensure(target?)`：
  - 无 target → 克隆所有引用仓库
  - 有 target → 只克隆包含该 target 路径的引用仓库
- 克隆结果通过 `Effect.cached` 缓存，多次调用复用同一结果

```typescript
const materializeByPath = yield* Effect.forEach(
  gitReferences,
  Effect.fnUntraced(function* (reference) {
    const run = yield* Effect.cached(
      RepositoryCache.ensure({ reference: reference.reference, branch: reference.branch, refresh: true }, { fs, git })
    )
    return { path: reference.path, run }
  }),
  { concurrency: "unbounded" },
)
```

### contains 判断

```typescript
function containsReferencePath(referencePath: string, target: string) {
  return AppFileSystem.contains(normalizedTarget(referencePath) ?? referencePath, target)
}
```

判断给定 target 是否在某个引用仓库的路径内，用于决定是否需要克隆该仓库。

## 关键设计决策

1. **三类引用类型**：`local`（本地路径）、`git`（Git 仓库）、`invalid`（无效），用 discriminated union 实现类型安全的处理

2. **延迟克隆**：Git 引用仓库不立即克隆，而是按需通过 `ensure` 触发，减少启动开销

3. **experimentalScout 开关**：通过 `RuntimeFlags.experimentalScout` 控制引用功能的总开关，关闭时所有操作都是 no-op

4. **分支冲突检测**：多个引用指向同一仓库但要求不同分支时，标记为 `invalid` 并给出明确的冲突说明

5. **路径规范化**：在 Windows 上使用 `AppFileSystem.normalizePath` 规范化路径，确保跨平台一致性

6. **并行克隆**：多个 Git 引用仓库以 `concurrency: "unbounded"` 并行克隆，但通过 `Effect.cached` 避免重复克隆同一仓库
