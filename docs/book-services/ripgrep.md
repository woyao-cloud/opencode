# @opencode/Ripgrep — Ripgrep 搜索服务

## 概述

`@opencode/Ripgrep` 是 OpenCode 的**代码搜索服务**，封装了 ripgrep（rg）命令行工具，提供文件列表、全文搜索和目录树生成三种能力。它通过 Effect 的 `ChildProcess` 和 `Stream` 机制实现流式输出处理，并支持自动下载和缓存 ripgrep 二进制文件。

该服务是 `@opencode/File` 的文件扫描和搜索能力的底层支撑。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统操作（检查二进制路径、创建临时目录、下载/解压 ripgrep） |
| `ChildProcessSpawner` | `effect/unstable/process` | 子进程 spawn 管理 |
| `HttpClient` | `effect/unstable/http` | HTTP 客户端，用于从 GitHub Releases 下载 ripgrep 二进制 |

```typescript
// ripgrep.ts layer 定义
export const layer: Layer.Layer<Service, never, AppFileSystem.Service | ChildProcessSpawner | HttpClient.HttpClient> =
  Layer.effect(Service, Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service
    const http = HttpClient.filterStatusOk(yield* HttpClient.HttpClient)
    const spawner = yield* ChildProcessSpawner
    // ...
  }))

export const defaultLayer = layer.pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(CrossSpawnSpawner.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly files: (input: FilesInput) => Stream.Stream<string, PlatformError | Error>
  readonly tree: (input: TreeInput) => Effect.Effect<string, PlatformError | Error>
  readonly search: (input: SearchInput) => Effect.Effect<SearchResult, PlatformError | Error>
}

export interface SearchResult {
  items: Item[]
  partial: boolean
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Ripgrep") {}
```

使用方式：

```typescript
// 列出文件
const files = yield* rg.files({ cwd: "/project" }).pipe(Stream.runCollect)

// 全文搜索
const result = yield* rg.search({ cwd: "/project", pattern: "useState" })

// 生成目录树
const tree = yield* rg.tree({ cwd: "/project", limit: 200 })
```

## 数据结构

### 输入类型

```typescript
export interface FilesInput {
  cwd: string
  glob?: string[]        // 额外的 glob 过滤模式
  hidden?: boolean       // 是否包含隐藏文件（默认 true）
  follow?: boolean       // 是否跟随符号链接
  maxDepth?: number      // 最大深度
  signal?: AbortSignal   // 取消信号
}

export interface SearchInput {
  cwd: string
  pattern: string
  glob?: string[]        // glob 过滤
  limit?: number         // 每个文件的最大匹配数（映射为 --max-count）
  follow?: boolean
  file?: string[]        // 要搜索的文件/目录列表
  signal?: AbortSignal
}

export interface TreeInput {
  cwd: string
  limit?: number         // 最大条目数
  signal?: AbortSignal
}
```

### 输出类型

```typescript
// SearchMatch — 单次匹配结果
export const SearchMatch = Schema.Struct({
  path: PathText,
  lines: Schema.Struct({ text: Schema.String }),
  line_number: NonNegativeInt,
  absolute_offset: NonNegativeInt,
  submatches: Schema.Array(Schema.Struct({
    match: Schema.Struct({ text: Schema.String }),
    start: NonNegativeInt,
    end: NonNegativeInt,
  })),
})

// Match — ripgrep JSON 输出中的 match 行
export const Match = Schema.Struct({
  type: Schema.Literal("match"),
  data: SearchMatch,
})

// Begin / End / Summary — ripgrep JSON 输出的其他行类型
const Begin = Schema.Struct({ type: Schema.Literal("begin"), data: Schema.Struct({ path: PathText }) })
const End = Schema.Struct({ type: Schema.Literal("end"), data: Schema.Struct({ path: PathText, binary_offset: ..., stats: Stats }) })
const Summary = Schema.Struct({ type: Schema.Literal("summary"), data: Schema.Struct({ elapsed_total: TimeStats, stats: Stats }) })

export type Item = Match["data"]
export type Row = Match["data"]
```

## 关键实现细节

### Ripgrep 二进制管理

服务优先使用系统已安装的 `rg`，如果不存在则自动从 GitHub Releases 下载：

```typescript
const filepath = yield* Effect.cached(
  Effect.gen(function* () {
    // 1. 检查系统 PATH 中的 rg
    const system = yield* Effect.sync(() => which(process.platform === "win32" ? "rg.exe" : "rg"))
    if (system && (yield* fs.isFile(system).pipe(Effect.orDie))) return system

    // 2. 检查缓存目录中的 rg
    const target = path.join(Global.Path.bin, `rg${process.platform === "win32" ? ".exe" : ""}`)
    if (yield* fs.isFile(target).pipe(Effect.orDie)) return target

    // 3. 下载对应平台的 ripgrep 15.1.0
    const platformKey = `${process.arch}-${process.platform}`
    const config = PLATFORM[platformKey]
    // ... 下载、解压、复制到 Global.Path.bin
    return target
  }),
)
```

支持的平台：arm64/x64-darwin, arm64/x64-linux, arm64/ia32/x64-win32。下载的二进制缓存在 `Global.Path.bin` 目录中。

### 平台解压

- **Windows（zip）**：使用 PowerShell 的 `Expand-Archive` 命令解压
- **Unix（tar.gz）**：使用系统 `tar -xzf` 命令解压

```typescript
if (config.extension === "zip") {
  const shell = (yield* Effect.sync(() => which("powershell.exe") ?? which("pwsh.exe"))) ?? "powershell.exe"
  const result = yield* run(shell, ["-NoProfile", "-NonInteractive", "-Command",
    `$global:ProgressPreference = 'SilentlyContinue'; Expand-Archive -LiteralPath '${archive}' -DestinationPath '${dir}' -Force`])
}
```

### files — 流式文件列表

使用 ripgrep 的 `--files` 模式列出文件，输出为 `Stream`，逐行产生文件路径：

```typescript
const files: Interface["files"] = (input) =>
  Stream.callback<string, PlatformError | Error>((queue) =>
    Effect.gen(function* () {
      // ... spawn rg --no-config --files --hidden --glob=!.git/* .
      // stdout 逐行解码 → Stream.splitLines → filter → queue.offer
    }),
  )
```

默认参数：`--no-config --files --hidden --glob=!.git/*`

### search — JSON 流式搜索

使用 ripgrep 的 `--json` 模式进行全文搜索，通过 Effect Schema 解析每一行 JSON 输出：

```typescript
const search: Interface["search"] = Effect.fn("Ripgrep.search")(function* (input: SearchInput) {
  // ... spawn rg --no-config --json --hidden --glob=!.git/* --no-messages
  // stdout → Stream.splitLines → Stream.mapEffect(parse) → filter type === "match" → map(row)
})
```

默认参数：`--no-config --json --hidden --glob=!.git/* --no-messages`

`parse` 函数使用 `Schema.decodeUnknownEffect(Schema.fromJsonString(Result))` 解析每行 JSON，只收集 `type === "match"` 的行，并调用 `row()` 规范化路径。

退出码含义：
- `0`：正常完成（有结果）
- `1`：正常完成（无匹配）
- `2`：部分结果（被截断）
- 其他：错误

### tree — 目录树生成

`tree` 方法基于 `files` 的流式输出，在内存中构建树形结构并格式化为文本：

```typescript
const tree: Interface["tree"] = Effect.fn("Ripgrep.tree")(function* (input: TreeInput) {
  const list = Array.from(yield* files({ cwd: input.cwd, signal: input.signal }).pipe(Stream.runCollect))
  // 构建 Node 树 → BFS 遍历 → 按 limit 截断 → 生成文本行
})
```

跳过包含 `.opencode` 的路径，按字母顺序排序，超出 limit 时追加 `[N truncated]` 提示。

### AbortSignal 支持

`files` 和 `search` 都支持通过 `AbortSignal` 取消操作：

```typescript
function raceAbort<A, E, R>(effect: Effect.Effect<A, E, R>, signal?: AbortSignal) {
  return signal ? effect.pipe(Effect.raceFirst(waitForAbort(signal))) : effect
}
```

`waitForAbort` 创建一个在 signal abort 时 fail 的 Effect。

### 环境变量清理

spawn ripgrep 前清除 `RIPGREP_CONFIG_PATH` 环境变量，防止用户的 rg 配置文件干扰搜索行为：

```typescript
function env() {
  const env = sanitizedProcessEnv()
  delete env.RIPGREP_CONFIG_PATH
  return env
}
```

### 路径规范化

`clean` 函数移除输出路径前导的 `./`，并调用 `path.normalize`：

```typescript
function clean(file: string) {
  return path.normalize(file.replace(/^\.[\\/]/, ""))
}
```

## 关键设计决策

1. **自动下载二进制**：系统未安装 ripgrep 时自动从 GitHub Releases 下载，避免用户手动安装依赖。二进制缓存在 `Global.Path.bin`，通过 `Effect.cached` 确保只下载一次

2. **JSON 流式解析 + Schema 校验**：search 使用 ripgrep 的 `--json` 模式，通过 Effect Schema 解析每行 JSON，既保证了类型安全，又避免了正则解析的脆弱性

3. **Stream 返回文件列表**：`files` 返回 `Stream` 而非数组，允许调用方在文件列表尚未完全生成时就开始处理，减少内存占用和首次响应延迟

4. **退出码容错**：search 将退出码 0、1、2 视为正常（分别表示有结果、无结果、部分结果），只有其他退出码才抛出错误

5. **取消支持**：通过 `AbortSignal` + `Effect.raceFirst` 实现可取消的搜索，避免长时间搜索阻塞资源

6. **隔离用户配置**：清除 `RIPGREP_CONFIG_PATH` 确保搜索行为一致，不受用户本地 ripgrep 配置文件影响
