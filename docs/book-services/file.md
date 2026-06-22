# @opencode/File — 文件操作服务
> 源文件: `opencode/packages/opencode/src/file/index.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/file/index.ts`

## 概述

`@opencode/File` 是 OpenCode 的**文件系统操作服务**，提供文件读取、目录列表、模糊搜索和 Git 状态查询等能力。它封装了文件类型检测（文本/二进制/图片）、Git diff 计算、gitignore 规则应用等功能，是对底层 `AppFileSystem` 的高级封装。

文件读取时自动计算 Git diff 并生成 unified diff patch；目录列表时应用 `.gitignore` 和 `.ignore` 规则标记忽略状态；文件搜索基于 `fuzzysort` 实现模糊匹配。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 底层文件系统操作（读文件、读目录、MIME 类型检测） |
| `Ripgrep` | `@opencode/Ripgrep` | 使用 ripgrep 的 `--files` 扫描项目文件列表 |
| `Git` | `@opencode/Git` | 执行 git 命令（`diff`、`ls-files`、`show`）获取文件状态和 diff |

```typescript
// index.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const appFs = yield* AppFileSystem.Service
    const rg = yield* Ripgrep.Service
    const git = yield* Git.Service
    const scope = yield* Scope.Scope
    // ...
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Ripgrep.defaultLayer),
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(Git.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly init: () => Effect.Effect<void>                                             // 初始化文件服务（后台扫描文件列表）
  readonly status: () => Effect.Effect<Info[]>                                          // 获取 Git 工作区状态（新增/修改/删除的文件）
  readonly read: (file: string) => Effect.Effect<Content>                               // 读取文件内容（含 diff）
  readonly list: (dir?: string) => Effect.Effect<Node[]>                                // 列出目录内容
  readonly search: (input: {
    query: string
    limit?: number
    dirs?: boolean
    type?: "file" | "directory"
  }) => Effect.Effect<string[]>                                                         // 模糊搜索文件/目录
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/File") {}
```

使用方式：

```typescript
// 读取文件（自动获取 diff）
const content = yield* File.Service.read("src/main.ts")

// 列出目录
const nodes = yield* File.Service.list("src/")

// 模糊搜索文件
const results = yield* File.Service.search({ query: "config", type: "file" })

// 获取 Git 状态
const changes = yield* File.Service.status()
```

## 数据结构

### Info（文件变更信息）

```typescript
export const Info = Schema.Struct({
  path: Schema.String,
  added: NonNegativeInt,
  removed: NonNegativeInt,
  status: Schema.Literals(["added", "deleted", "modified"]),
})
```

### Node（文件/目录节点）

```typescript
export const Node = Schema.Struct({
  name: Schema.String,                                      // 文件/目录名
  path: Schema.String,                                      // 相对于项目根目录的路径
  absolute: Schema.String,                                  // 绝对路径
  type: Schema.Literals(["file", "directory"]),
  ignored: Schema.Boolean,                                  // 是否被 .gitignore/.ignore 忽略
})
```

### Content（文件内容）

```typescript
export const Content = Schema.Struct({
  type: Schema.Literals(["text", "binary"]),
  content: Schema.String,                                   // 文本内容或 base64 编码内容
  diff: Schema.optional(Schema.String),                     // unified diff 格式的差异
  patch: Schema.optional(Patch),                            // 结构化 patch
  encoding: Schema.optional(Schema.Literal("base64")),      // 编码方式
  mimeType: Schema.optional(Schema.String),                 // MIME 类型
})
```

### Patch（结构化补丁）

```typescript
const Hunk = Schema.Struct({
  oldStart: NonNegativeInt,
  oldLines: NonNegativeInt,
  newStart: NonNegativeInt,
  newLines: NonNegativeInt,
  lines: Schema.Array(Schema.String),
})

const Patch = Schema.Struct({
  oldFileName: Schema.String,
  newFileName: Schema.String,
  oldHeader: Schema.optional(Schema.String),
  newHeader: Schema.optional(Schema.String),
  hunks: Schema.Array(Hunk),
  index: Schema.optional(Schema.String),
})
```

## 关键实现细节

### 文件类型检测

文件类型通过三组预定义扩展名集合判定：

- **`binary`**：已知二进制格式（exe, dll, zip, pdf, wasm, jar 等 90+ 种扩展名）
- **`image`**：图片格式（png, jpg, svg, webp, avif, heic 等 20+ 种扩展名）
- **`text`**：已知文本格式（ts, js, json, yaml, md, html, css, sql 等 30+ 种扩展名）
- **`textName`**：按文件名识别的文本类型（dockerfile, makefile, .gitignore, .editorconfig 等）

检测逻辑在 `read` 中的优先级：
1. 图片扩展名 → 读取并 base64 编码
2. 二进制扩展名（且不在 text/textName 中）→ 返回 binary 类型
3. 未知类型 → 通过 `AppFileSystem.mimeType` 和 `shouldEncode` 判断是否需要 base64 编码
4. 文本类型 → 直接读取字符串

```typescript
const isImageByExtension = (file: string) => image.has(ext(file))
const isTextByExtension = (file: string) => text.has(ext(file))
const isTextByName = (file: string) => textName.has(name(file))
const isBinaryByExtension = (file: string) => binary.has(ext(file))
```

### Git Diff 计算

在 `read` 中，当项目使用 Git VCS 时：
1. 先用 `git diff -- <file>` 获取未暂存的变更
2. 如果为空，再用 `git diff --staged -- <file>` 获取已暂存的变更
3. 如果有 diff，通过 `git show HEAD:<file>` 获取原始内容
4. 使用 `diff` 库的 `structuredPatch` + `formatPatch` 生成 unified diff 格式的差异

```typescript
if (ctx.project.vcs === "git") {
  let diff = yield* gitText(["-c", "core.fsmonitor=false", "diff", "--", file])
  if (!diff.trim()) {
    diff = yield* gitText(["-c", "core.fsmonitor=false", "diff", "--staged", "--", file])
  }
  if (diff.trim()) {
    const original = yield* git.show(ctx.directory, "HEAD", file)
    const patch = structuredPatch(file, file, original, content, "old", "new", { ... })
    return { type: "text" as const, content, patch, diff: formatPatch(patch) }
  }
}
```

### 文件扫描与缓存

`scan` 函数负责构建文件/目录缓存：

- **Global Home 模式**：只扫描两级目录，过滤 `.` 开头的目录、`node_modules`/`dist`/`build` 等嵌套忽略目录，以及 Protected 目录
- **普通项目模式**：通过 `rg.files()` 获取所有文件，再从文件路径反向推导出目录树

缓存通过 `Effect.cached` 包装，`ensure` 函数每次调用后重建缓存：

```typescript
let cachedScan = yield* Effect.cached(scan().pipe(Effect.catchCause(() => Effect.void)))

const ensure = Effect.fn("File.ensure")(function* () {
  yield* cachedScan
  cachedScan = yield* Effect.cached(scan().pipe(Effect.catchCause(() => Effect.void)))
})
```

### Git Status

`status` 方法通过三个 git 命令获取工作区状态：

1. `git diff --numstat HEAD`：获取修改的文件（含 added/removed 行数）
2. `git ls-files --others --exclude-standard`：获取未跟踪的新文件（读取内容计算行数，标记为 added）
3. `git diff --name-only --diff-filter=D HEAD`：获取已删除的文件

### 模糊搜索

`search` 使用 `fuzzysort` 库实现模糊匹配：

- 空查询返回全部文件/目录
- 搜索目录时，如果查询不以 `.` 开头且不包含 `/.`，则将隐藏目录排在结果末尾（`sortHiddenLast`）
- 目录搜索会扩大搜索范围（`limit * 20`）以提高匹配质量

### 路径安全

`read` 和 `list` 中使用 `containsPath` 检查防止路径遍历攻击：

```typescript
if (!containsPath(full, ctx)) {
  throw new Error("Access denied: path escapes project directory")
}
```

## 关键设计决策

1. **扩展名白名单 vs MIME 检测**：文件类型优先通过扩展名白名单判定，仅在扩展名未知时才回退到 MIME 检测。这是因为扩展名检测更快且更可靠，避免了读取文件头部的开销

2. **图片 Base64 内联**：图片文件在读取时自动转为 base64 编码并附带 MIME 类型，使前端可以直接以内联方式渲染图片，无需额外的文件传输

3. **Diff 随文件内容一起返回**：`read` 方法在返回文件内容的同时计算并返回 Git diff，使调用方可以一次性获取文件的完整上下文（原始内容 + 变更）

4. **延迟扫描 + 缓存重建**：文件扫描不在 init 时立即执行，而是通过 `Effect.forkIn(scope)` 后台启动；且每次 `ensure()` 调用都会重建缓存，保证文件列表的时效性

5. **Git 命令禁用 fsmonitor**：所有 git 命令都传入 `-c core.fsmonitor=false`，避免文件系统监控器（如 Watchman）的缓存导致状态滞后
