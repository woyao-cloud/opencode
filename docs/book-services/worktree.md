# @opencode/Worktree — Git Worktree 管理服务

## 概述

`@opencode/Worktree` 是 OpenCode 的**Git Worktree 生命周期管理服务**，负责创建、列出、移除和重置 git worktree。每个 worktree 是项目仓库的一个独立工作副本，拥有自己的分支和工作目录，使得多个 Agent 会话可以在同一项目的不同分支上并行工作而互不干扰。

Worktree 创建后会自动执行 bootstrap 流程（加载配置、初始化服务），并可运行项目定义的启动脚本和用户自定义的 start command。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统操作：创建目录、检查存在性、删除目录 |
| `Path` | `@effect/platform-node` | 路径解析、规范化 |
| `AppProcess` | `@opencode-ai/core/process` | 执行 git 命令和启动脚本 |
| `Git` | `@opencode/Git` | Git 底层命令（branch、defaultBranch、fetch 等） |
| `Project` | `@opencode/Project` | 项目信息查询、沙箱管理 |
| `InstanceStore` | `@opencode/InstanceStore` | 实例加载（bootstrap 子进程） |

```typescript
// worktree/index.ts layer 定义
export const layer: Layer.Layer<
  Service,
  never,
  AppFileSystem.Service | Path.Path | AppProcess.Service | Git.Service | Project.Service | InstanceStore.Service
> = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service
  const pathSvc = yield* Path.Path
  const appProcess = yield* AppProcess.Service
  const gitSvc = yield* Git.Service
  const project = yield* Project.Service
  const store = yield* InstanceStore.Service
  // ...
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly makeWorktreeInfo: (options?: { name?: string; detached?: boolean }) => Effect.Effect<Info, Error>
  readonly createFromInfo: (info: Info, startCommand?: string) => Effect.Effect<void, Error>
  readonly create: (input?: CreateInput) => Effect.Effect<Info, Error>
  readonly list: () => Effect.Effect<(Omit<Info, "branch"> & { branch?: string })[], Error>
  readonly remove: (input: RemoveInput) => Effect.Effect<boolean, Error>
  readonly reset: (input: ResetInput) => Effect.Effect<boolean, Error>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Worktree") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 创建 worktree（一步完成：生成信息 + 创建 + bootstrap）
const info = yield* Worktree.Service.create({ name: "fix-bug-123" })

// 分步创建（自定义 name）
const info = yield* Worktree.Service.makeWorktreeInfo({ name: "my-branch" })
yield* Worktree.Service.createFromInfo(info, "npm install && npm run build")

// 列出所有 worktree
const worktrees = yield* Worktree.Service.list()

// 移除 worktree
yield* Worktree.Service.remove({ directory: "/path/to/worktree" })

// 重置 worktree 到默认分支
yield* Worktree.Service.reset({ directory: "/path/to/worktree" })
```

## 数据结构

### Info

```typescript
export const Info = Schema.Struct({
  name: Schema.String,                      // worktree 名称（slug）
  branch: Schema.optional(Schema.String),   // 关联的 git 分支名（detached 模式无分支）
  directory: Schema.String,                 // worktree 目录绝对路径
})
```

### CreateInput

```typescript
export const CreateInput = Schema.Struct({
  name: Schema.optional(Schema.String),     // 可选名称（会被 slugify 处理）
  startCommand: Schema.optional(Schema.String),  // 额外的启动命令
})
```

### RemoveInput / ResetInput

```typescript
export const RemoveInput = Schema.Struct({ directory: Schema.String })
export const ResetInput = Schema.Struct({ directory: Schema.String })
```

### 错误类型

| 错误类 | Tag | 触发条件 |
|--------|-----|----------|
| `NotGitError` | `"WorktreeNotGitError"` | 项目不是 git 仓库 |
| `NameGenerationFailedError` | `"WorktreeNameGenerationFailedError"` | 26 次尝试仍未生成唯一名称 |
| `CreateFailedError` | `"WorktreeCreateFailedError"` | `git worktree add` 失败 |
| `StartCommandFailedError` | `"WorktreeStartCommandFailedError"` | 启动命令执行失败 |
| `RemoveFailedError` | `"WorktreeRemoveFailedError"` | worktree 移除失败 |
| `ResetFailedError` | `"WorktreeResetFailedError"` | worktree 重置失败 |
| `ListFailedError` | `"WorktreeListFailedError"` | worktree 列表读取失败 |

## 关键实现细节

### create 完整流程

```
create(input?)
  ├── 1. makeWorktreeInfo({ name })
  │     ├── 检查 project.vcs === "git" → 否则 NotGitError
  │     ├── 确定 root = ~/.local/share/opencode/worktree/<projectId>
  │     ├── 创建 root 目录（递归）
  │     └── candidate({ root, name })
  │           ├── 循环最多 26 次
  │           ├── 生成 name = slugify(input.name) 或 Slug.create()
  │           ├── 生成 branch = "opencode/<name>"
  │           ├── 检查目录是否已存在
  │           ├── 检查分支是否已存在（git show-ref）
  │           └── 返回 { name, directory, branch }
  └── 2. createFromInfo(info, startCommand)
        ├── setup(info)
        │     ├── git worktree add --no-checkout -b <branch> <dir>
        │     ├── 失败 → CreateFailedError
        │     └── project.addSandbox(projectId, directory)
        └── boot(info, startCommand) [forkIn(scope), 异步执行]
              ├── git reset --hard → 填充文件
              ├── store.load({ directory }) → 加载实例（bootstrap）
              ├── 成功 → 发布 Event.Ready
              ├── 失败 → 发布 Event.Failed
              └── runStartScripts(directory, { projectID, extra })
                    ├── 执行项目级 start 命令（来自 project.commands.start）
                    └── 执行 worktree 级 startCommand
```

### remove 完整流程

```
remove({ directory })
  ├── 1. 检查 project.vcs === "git"
  ├── 2. canonical(directory) → 规范化路径
  ├── 3. git worktree list --porcelain → 列出所有 worktree
  ├── 4. locateWorktree(entries, directory) → 匹配目标 worktree
  ├── 5. 未匹配（可能已损坏）：
  │     ├── 检查目录是否存在
  │     ├── 停止 fsmonitor
  │     └── fs.rm() 强制删除目录
  ├── 6. 匹配到 worktree：
  │     ├── 停止 fsmonitor
  │     ├── git worktree remove --force <path>
  │     ├── 验证移除结果（再次 list 检查）
  │     ├── cleanDirectory(entry.path) → fs.rm 递归删除
  │     └── 删除关联分支：git branch -D <branch>
  └── 7. 返回 true
```

### reset 完整流程

```
reset({ directory })
  ├── 1. 检查 project.vcs === "git"
  ├── 2. 检查不是主 workspace（防止误重置主工作区）
  ├── 3. git worktree list --porcelain → 定位 worktree
  ├── 4. gitSvc.defaultBranch() → 获取默认分支
  ├── 5. 如果默认分支是远程引用：
  │     └── git fetch <remote> <branch> → 拉取最新代码
  ├── 6. git reset --hard <base.ref> → 重置到目标提交
  ├── 7. sweep(worktreePath) → 清理工作区
  │     ├── git clean -ffdx
  │     └── 失败时解析 "failed to remove" 警告 → fs.rm 逐个删除 → 重试 clean
  ├── 8. git submodule update --init --recursive --force → 更新子模块
  ├── 9. git submodule foreach --recursive git reset --hard → 重置子模块
  ├── 10. git submodule foreach --recursive git clean -fdx → 清理子模块
  ├── 11. git status --porcelain=v1 → 验证无残留变更
  └── 12. runStartScripts → 重新执行启动脚本 [forkIn(scope)]
```

### 名称生成 (slugify + candidate)

```typescript
function slugify(input: string) {
  return input.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")  // 非字母数字替换为连字符
    .replace(/^-+/, "")            // 去除首部连字符
    .replace(/-+$/, "")            // 去除尾部连字符
}
```

`candidate` 函数最多尝试 26 次生成唯一名称：
- 第 1 次：使用用户提供的名称（slugify 后）
- 后续：`<name>-<randomSlug>`
- 每次检查目录和分支是否冲突

### 启动脚本执行

启动脚本分为两级：

1. **项目级**：从 `project.commands.start` 读取（`project.sql.ts` 中的 `commands` JSON 字段）
2. **Worktree 级**：创建时通过 `startCommand` 参数传入

脚本执行：
- Windows：`cmd /c <command>`
- 其他平台：`bash -lc <command>`
- 项目级脚本失败 → 跳过 worktree 级脚本
- Worktree 级脚本失败 → 记录日志但不影响整体流程

### 路径规范化 (canonical)

所有 worktree 路径比较都经过 `canonical` 规范化：
1. `pathSvc.resolve(input)` → 绝对路径
2. `fs.realPath(abs)` → 解析符号链接（失败则使用绝对路径）
3. `pathSvc.normalize(real)` → 规范化分隔符
4. Windows：`.toLowerCase()` → 大小写不敏感比较

### 事件发布

| 事件 | 类型 | 触发时机 |
|------|------|----------|
| `Worktree.Event.Ready` | `"worktree.ready"` | Bootstrap 成功完成 |
| `Worktree.Event.Failed` | `"worktree.failed"` | Bootstrap 失败 |

事件通过 `GlobalBus` 发布，携带 `directory`、`project`、`workspace` 上下文。

## 关键设计决策

1. **两步创建（makeWorktreeInfo + createFromInfo）**：分离信息生成和实际创建，允许调用方在创建前检查或修改 worktree 参数，同时提供 `create` 便捷方法一步完成

2. **异步 bootstrap**：`boot` 过程通过 `Effect.forkIn(scope)` 异步执行，`create` 立即返回 Info，不阻塞调用方。bootstrap 结果通过 GlobalBus 事件通知

3. **最多 26 次名称尝试**：使用 `Array.from({ length: 26 })` 限制名称重试次数，避免无限循环。26 来自英文字母数量，提供了足够的命名空间

4. **统一存储路径**：所有 worktree 存放在 `~/.local/share/opencode/worktree/<projectId>/<name>` 下，按项目隔离，便于管理和清理

5. **detached HEAD 支持**：`makeWorktreeInfo({ detached: true })` 创建无分支的 detached worktree，适用于临时性工作

6. **fsmonitor 停止**：移除 worktree 前先执行 `git fsmonitor--daemon stop`，防止文件监控守护进程锁定目录导致删除失败

7. **分步验证的 remove**：移除后再次 `git worktree list` 验证，若 worktree 仍存在则报错，若已不存在但目录残留则直接 `fs.rm` 清理

8. **子模块全量重置**：reset 不仅重置主仓库，还递归更新、重置、清理所有子模块，确保完全干净的状态

9. **启动脚本分级**：项目级和 worktree 级脚本分离，项目级失败会阻止 worktree 级执行，防止在未准备好的环境中运行自定义脚本

10. **Platform-aware 脚本执行**：Windows 使用 `cmd /c`，其他平台使用 `bash -lc`，确保启动命令在不同操作系统上正确执行
