# @opencode/Git — Git 命令执行服务
> 源文件: `opencode/packages/opencode/src/git/index.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/git/index.ts`

## 概述

`@opencode/Git` 是 OpenCode 的**Git 底层命令封装**，通过 Effect 框架统一管理所有 `git` 子进程调用。它使用预定义的全局配置参数（如 `core.autocrlf=false`、`core.longpaths=true`）确保跨平台行为一致，并通过 `AppProcess` 服务管理进程生命周期和输出截断。

它是 `@opencode/Vcs` 和 `@opencode/Worktree` 的底层依赖，提供分支查询、状态检查、差异计算、补丁生成、补丁应用等基础能力。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppProcess` | `@opencode-ai/core/process` | 进程管理，执行 git 命令并捕获输出 |

```typescript
// index.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const appProcess = yield* AppProcess.Service
    // ...
  }),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly run: (args: string[], opts: Options) => Effect.Effect<Result>
  readonly branch: (cwd: string) => Effect.Effect<string | undefined>
  readonly prefix: (cwd: string) => Effect.Effect<string>
  readonly defaultBranch: (cwd: string) => Effect.Effect<Base | undefined>
  readonly hasHead: (cwd: string) => Effect.Effect<boolean>
  readonly mergeBase: (cwd: string, base: string, head?: string) => Effect.Effect<string | undefined>
  readonly show: (cwd: string, ref: string, file: string, prefix?: string) => Effect.Effect<string>
  readonly status: (cwd: string) => Effect.Effect<Item[]>
  readonly diff: (cwd: string, ref: string) => Effect.Effect<Item[]>
  readonly stats: (cwd: string, ref: string) => Effect.Effect<Stat[]>
  readonly patch: (cwd: string, ref: string, file: string, options?: PatchOptions) => Effect.Effect<Patch>
  readonly patchAll: (cwd: string, ref: string, options?: PatchOptions) => Effect.Effect<Patch>
  readonly patchUntracked: (cwd: string, file: string, options?: PatchOptions) => Effect.Effect<Patch>
  readonly statUntracked: (cwd: string, file: string) => Effect.Effect<Stat | undefined>
  readonly applyPatch: (cwd: string, patch: string) => Effect.Effect<Result>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Git") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取当前分支
const branch = yield* Git.Service.branch(cwd)

// 获取文件状态
const items = yield* Git.Service.status(cwd)

// 生成文件 patch
const patch = yield* Git.Service.patch(cwd, "HEAD", "src/index.ts")

// 执行任意 git 命令
const result = yield* Git.Service.run(["log", "--oneline", "-5"], { cwd })
```

## 数据结构

### Base (默认分支信息)

```typescript
export type Base = {
  readonly name: string   // 分支名称（如 "main"）
  readonly ref: string    // 分支引用（如 "origin/main"）
}
```

### Item (文件状态项)

```typescript
export type Item = {
  readonly file: string    // 文件路径
  readonly code: string    // git status 双字符代码（如 "M ", "??", "A "）
  readonly status: Kind    // 语义化状态
}
```

### Stat (文件统计)

```typescript
export type Stat = {
  readonly file: string
  readonly additions: number
  readonly deletions: number
}
```

### Patch

```typescript
export type Patch = {
  readonly text: string       // diff 文本
  readonly truncated: boolean // 是否因超出 maxOutputBytes 被截断
}
```

### Kind (文件变更类型)

```typescript
export type Kind = "added" | "deleted" | "modified"
```

`kind()` 函数将 git 双字符状态码转换为语义化类型：
- `"??"` → `"added"`（未追踪文件视为新增）
- 含 `"U"` → `"modified"`（未合并状态）
- 含 `"A"` 不含 `"D"` → `"added"`
- 含 `"D"` 不含 `"A"` → `"deleted"`
- 其余 → `"modified"`

### Result (命令执行结果)

```typescript
export type Result = {
  readonly exitCode: number
  readonly text: () => string     // stdout 文本（惰性求值）
  readonly stdout: Buffer
  readonly stderr: Buffer
  readonly truncated: boolean     // 输出是否被截断
}
```

### Options

```typescript
export interface Options {
  readonly cwd: string
  readonly env?: Record<string, string>
  readonly maxOutputBytes?: number    // 输出字节上限
  readonly stdin?: ChildProcess.CommandInput
}
```

### PatchOptions

```typescript
export interface PatchOptions {
  readonly context?: number           // diff 上下文行数（unified= 参数）
  readonly maxOutputBytes?: number    // 输出字节上限
}
```

## 关键实现细节

### 全局 Git 配置

所有 git 命令都带有统一的配置参数：

```typescript
const cfg = [
  "--no-optional-locks",      // 禁用可选锁，避免并发冲突
  "-c", "core.autocrlf=false",   // 禁用自动换行转换
  "-c", "core.fsmonitor=false",  // 禁用文件系统监控
  "-c", "core.longpaths=true",   // 启用长路径支持（Windows）
  "-c", "core.symlinks=true",    // 启用符号链接支持（Windows）
  "-c", "core.quotepath=false",  // 禁用路径引号转义
] as const
```

### 命令执行流程

```
run(args, opts)
  └── appProcess.run(
       ChildProcess.make("git", [...cfg, ...args], {
         cwd, env, extendEnv: true,
         stdin, stdout: "pipe", stderr: "pipe"
       }),
       { maxOutputBytes }
     )
  └── 错误捕获 → fail(err) 返回 exitCode: 1
```

### 默认分支推断策略

```
defaultBranch(cwd)
  ├── 1. git remote → 确定主远程名
  │     └── 优先级：origin > 唯一 remote > upstream > 第一个
  ├── 2. git symbolic-ref refs/remotes/<remote>/HEAD → 解析远程 HEAD 引用
  │     └── 成功 → 返回 { name, ref }
  ├── 3. git for-each-ref refs/heads → 列出所有本地分支
  ├── 4. git config init.defaultBranch → 检查本地配置的默认分支名
  │     └── 匹配 → 返回
  ├── 5. 检查 "main" 分支
  └── 6. 检查 "master" 分支
```

### status 实现

使用 null 分隔符（`-z`）输出，支持文件名中的空格和特殊字符：

```
git status --porcelain=v1 --untracked-files=all --no-renames -z -- .
  └── 输出格式: XY filename\0
  └── 解析为 Item[]（code: XY 双字符，file: 文件路径，status: kind(XY)）
```

### diff 实现

```
git diff --no-ext-diff --no-renames --name-status -z <ref> -- .
  └── 输出格式: code\0filename\0...
  └── 解析为 Item[]（code: 单字符状态码，file: 文件路径）
```

### stats 实现

```
git diff --no-ext-diff --no-renames --numstat -z <ref> -- .
  └── 输出格式: additions\0deletions\0file\0...
  └── 解析为 Stat[]
  └── "-" 值视为 0
```

### patch / patchAll / patchUntracked

| 方法 | Git 命令 | 用途 |
|------|----------|------|
| `patch(cwd, ref, file)` | `git diff --patch --unified=N <ref> -- <file>` | 单文件已追踪 diff |
| `patchAll(cwd, ref)` | `git diff --patch --unified=N <ref> -- .` | 所有文件已追踪 diff |
| `patchUntracked(cwd, file)` | `git diff --no-index --patch --unified=N -- /dev/null <file>` | 未追踪文件 diff |

### applyPatch

```
git apply -   (stdin 传入 patch 文本)
```

### 输出截断保护

所有命令支持 `maxOutputBytes` 参数，由 `AppProcess` 在进程输出级别进行截断。截断后 `Result.truncated = true`，`patch` 方法在截断时返回空文本。

### 错误处理

`run` 方法包装了 `Effect.catch`，所有异常（进程崩溃、无法启动等）都统一转换为 `exitCode: 1` 的 Result 对象，避免异常传播：

```typescript
const fail = (err: unknown) => ({
  exitCode: 1,
  text: () => "",
  stdout: Buffer.alloc(0),
  stderr: Buffer.from(err instanceof Error ? err.message : String(err)),
  truncated: false,
}) satisfies Result
```

## 关键设计决策

1. **统一配置注入**：所有 git 命令强制使用 `cfg` 配置数组，确保跨平台（Windows/Linux/macOS）行为一致，特别是 `core.autocrlf=false` 和 `core.longpaths=true`

2. **Null 分隔符解析**：status 和 diff 命令使用 `-z` 选项（null 分隔符）输出，而非默认的换行分隔，正确处理文件名中的空格、换行等特殊字符

3. **惰性 text() 求值**：`Result.text()` 设计为惰性求值函数，避免在不需要文本内容时进行不必要的 Buffer→String 转换

4. **输出截断而非崩溃**：超长输出通过 `maxOutputBytes` 截断并标记 `truncated: true`，而非抛出异常，让上层自行决定如何处理

5. **默认分支多级回退**：`defaultBranch()` 不依赖单一机制，而是依次尝试远程 HEAD 引用、本地配置、常见分支名（main/master），最大程度覆盖各种仓库配置

6. **--no-ext-diff --no-renames**：diff 操作始终禁用外部 diff 工具和重命名检测，确保输出格式可预测、可解析

7. **进程级错误统一处理**：所有异常被捕获并转换为 `exitCode: 1` 的 Result，上层不需要处理进程启动失败等边界情况
