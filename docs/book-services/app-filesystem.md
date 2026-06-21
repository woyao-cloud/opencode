# @opencode/FileSystem — 文件系统服务

## 概述

`@opencode/FileSystem` (`AppFileSystem`) 是 OpenCode 的**统一文件系统抽象层**，基于 Effect 的 `FileSystem.FileSystem` 接口扩展而来。它在标准文件系统操作之上提供了安全包装（如 `existsSafe`、`readFileStringSafe`）、便捷读写（如 `readJson`/`writeJson`）、目录树遍历（`findUp`、`up`、`globUp`）、glob 模式匹配以及纯函数路径工具。几乎所有需要文件 I/O 的模块都通过 `AppFileSystem.Service` 访问文件系统。

它位于 `@opencode-ai/core` 包中，是核心基础服务之一，被 `Config`、`Auth`、`Npm`、`Models`、`EffectFlock` 等服务以及 `opencode` 包中的工具、存储、会话、技能发现等模块广泛依赖。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `FileSystem.FileSystem` | `effect` | Effect 原生文件系统接口，提供 `exists`、`stat`、`readFileString`、`writeFileString`、`writeFile`、`makeDirectory`、`chmod`、`remove` 等底层操作 |

```typescript
// filesystem.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem  // Effect 原生文件系统

    // ... 基于 fs 构建所有扩展方法 ...

    return Service.of({
      ...fs,                  // 透传所有 FileSystem.FileSystem 方法
      existsSafe,
      readFileStringSafe,
      isDir,
      isFile,
      readDirectoryEntries,
      readJson,
      writeJson,
      ensureDir,
      writeWithDirs,
      findUp,
      up,
      globUp,
      glob,
      globMatch: Glob.match,
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(NodeFileSystem.layer))
```

`AppFileSystem` 的依赖链非常简洁——它只依赖 Effect 的 `FileSystem.FileSystem` 接口，在生产环境中由 `@effect/platform-node` 的 `NodeFileSystem.layer` 提供具体实现。`Glob` 是纯工具模块（`./util/glob`），通过普通 import 引入，不作为 Effect Service 注入。

## 核心接口

```typescript
export interface Interface extends FileSystem.FileSystem {
  readonly isDir: (path: string) => Effect.Effect<boolean>
  readonly isFile: (path: string) => Effect.Effect<boolean>
  readonly existsSafe: (path: string) => Effect.Effect<boolean>
  readonly readFileStringSafe: (path: string) => Effect.Effect<string | undefined, Error>
  readonly readJson: (path: string) => Effect.Effect<unknown, Error>
  readonly writeJson: (path: string, data: unknown, mode?: number) => Effect.Effect<void, Error>
  readonly ensureDir: (path: string) => Effect.Effect<void, Error>
  readonly writeWithDirs: (path: string, content: string | Uint8Array, mode?: number) => Effect.Effect<void, Error>
  readonly readDirectoryEntries: (path: string) => Effect.Effect<DirEntry[], Error>
  readonly findUp: (target: string, start: string, stop?: string) => Effect.Effect<string[], Error>
  readonly up: (options: { targets: string[]; start: string; stop?: string }) => Effect.Effect<string[], Error>
  readonly globUp: (pattern: string, start: string, stop?: string) => Effect.Effect<string[], Error>
  readonly glob: (pattern: string, options?: Glob.Options) => Effect.Effect<string[], Error>
  readonly globMatch: (pattern: string, filepath: string) => boolean
}
```

`Interface` 通过 `extends FileSystem.FileSystem` 继承了 Effect 原生文件系统的所有方法（`exists`、`stat`、`readFileString`、`writeFileString`、`writeFile`、`makeDirectory`、`chmod`、`remove`、`access`、`readDirectory`、`copy`、`copyFile` 等），因此通过 `AppFileSystem.Service` 可以同时访问原生方法和扩展方法。

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/FileSystem") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 安全读取文件（不存在返回 undefined 而非抛错）
const content = yield* AppFileSystem.Service.readFileStringSafe("/path/to/file")

// 读取 JSON
const data = yield* AppFileSystem.Service.readJson("/path/to/config.json")

// 写入文件并自动创建父目录
yield* AppFileSystem.Service.writeWithDirs("/deep/nested/file.txt", "hello")

// 向上查找配置文件
const configs = yield* AppFileSystem.Service.findUp("opencode.jsonc", process.cwd())

// 向上查找多个目标文件
const results = yield* AppFileSystem.Service.up({
  targets: ["package.json", "tsconfig.json"],
  start: process.cwd(),
})

// glob 模式匹配
const tsFiles = yield* AppFileSystem.Service.glob("src/**/*.ts", { cwd: projectRoot, absolute: true })

// 纯函数：同步 glob 匹配（不产生 Effect）
const matches = AppFileSystem.Service.globMatch("*.ts", "foo.ts")  // true

// 透传的原生方法也可以直接用
const exists = yield* AppFileSystem.Service.exists("/some/path")
const stat = yield* AppFileSystem.Service.stat("/some/path")
```

## 数据结构

### FileSystemError

```typescript
export class FileSystemError extends Schema.TaggedErrorClass<FileSystemError>()("FileSystemError", {
  method: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}
```

用于包装 `readDirectoryEntries` 和 `glob` 等操作的异常，记录出错的方法名和原始错误原因。

### DirEntry

```typescript
export interface DirEntry {
  readonly name: string
  readonly type: "file" | "directory" | "symlink" | "other"
}
```

`readDirectoryEntries` 的返回元素类型，封装了 Node.js `fs.Dirent` 的简化表示。

### Glob.Options

```typescript
export namespace Glob {
  export interface Options {
    cwd?: string          // 搜索根目录
    absolute?: boolean    // 是否返回绝对路径
    include?: "file" | "all"  // "file" 仅返回文件（默认），"all" 返回文件和目录
    dot?: boolean         // 是否匹配点文件
    symlink?: boolean     // 是否跟随符号链接
  }
}
```

Glob 搜索的配置选项，由 `Glob.scan` 内部转换为 `glob` 库的 `GlobOptions`。

### Error 类型

```typescript
export type Error = PlatformError | FileSystemError
```

`AppFileSystem` 方法可能返回的联合错误类型，组合了 Effect 的平台错误和自定义的 `FileSystemError`。

## 关键实现细节

### 安全包装方法

`existsSafe` 和 `readFileStringSafe` 是"不抛错"版本的文件系统操作：

```typescript
const existsSafe = Effect.fn("FileSystem.existsSafe")(function* (path: string) {
  return yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false))
})

const readFileStringSafe = Effect.fn("FileSystem.readFileStringSafe")(function* (path: string) {
  return yield* fs
    .readFileString(path)
    .pipe(Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)))
})
```

- `existsSafe`：任何错误都返回 `false`
- `readFileStringSafe`：仅捕获 `NotFound` 错误返回 `undefined`，其他错误仍然抛出

### writeWithDirs：自动创建父目录

```typescript
const writeWithDirs = Effect.fn("FileSystem.writeWithDirs")(function* (
  path: string,
  content: string | Uint8Array,
  mode?: number,
) {
  const write = typeof content === "string" ? fs.writeFileString(path, content) : fs.writeFile(path, content)

  yield* write.pipe(
    Effect.catchIf(
      (e) => e.reason._tag === "NotFound",
      () =>
        Effect.gen(function* () {
          yield* fs.makeDirectory(dirname(path), { recursive: true })
          yield* write
        }),
    ),
  )
  if (mode) yield* fs.chmod(path, mode)
})
```

先尝试直接写入，如果父目录不存在（`NotFound`），则递归创建所有父目录后重试写入。同时支持写入后的权限设置（`chmod`）。

### 目录树向上遍历

`findUp`、`up` 和 `globUp` 三个方法都实现了从起始目录向上遍历目录树的行为：

- **`findUp(target, start, stop?)`**：查找单个目标文件名，返回所有匹配的完整路径
- **`up({ targets, start, stop? })`**：同时查找多个目标文件名，返回所有匹配的完整路径
- **`globUp(pattern, start, stop?)`**：在每一层目录中执行 glob 模式匹配，汇总所有匹配结果

三个方法的遍历终止条件相同：
1. 到达 `stop` 目录（如果指定）
2. 到达文件系统根目录（`dirname(current) === current`）

`globUp` 对每一层的 glob 调用使用了 `Effect.catch` 降级为空数组，因此单层 glob 失败不会中断整个向上遍历。

### readJson / writeJson

`readJson` 直接使用 `JSON.parse`，不做 schema 校验——调用方负责类型安全。`writeJson` 使用 `JSON.stringify(data, null, 2)` 格式化输出，支持可选的 `mode` 参数设置文件权限。

### Layer 透传原生方法

```typescript
return Service.of({
  ...fs,     // 展开所有 FileSystem.FileSystem 方法
  existsSafe,
  readFileStringSafe,
  // ... 其他扩展方法
})
```

通过 `...fs` 展开，`AppFileSystem.Service` 同时提供 Effect 原生文件系统的所有方法，使用者无需单独注入 `FileSystem.FileSystem`。

### 纯函数工具

以下函数是同步的纯函数，不依赖 Effect 运行时：

| 函数 | 用途 |
|------|------|
| `mimeType(p)` | 根据文件扩展名返回 MIME 类型，使用 `mime-types` 库 |
| `normalizePath(p)` | Windows 上解析为真实路径（`realpathSync.native`），非 Windows 原样返回 |
| `normalizePathPattern(p)` | 规范化 glob 模式中的路径，处理 Windows 盘符和 `*` 通配符 |
| `resolve(p)` | 解析路径并规范化，`ENOENT` 时降级为纯 `path.resolve` |
| `windowsPath(p)` | 将 Unix 风格路径（`/c/Users/...`、`/cygdrive/c/...`、`/mnt/c/...`）转为 Windows 路径 |
| `overlaps(a, b)` | 判断两个路径是否有交集（互为前缀或相等） |
| `contains(parent, child)` | 判断 `parent` 是否包含 `child`（`child` 在 `parent` 内部） |

## 关键设计决策

1. **继承而非包装**：`Interface extends FileSystem.FileSystem`，通过 `...fs` 展开透传所有原生方法，使用者只需注入一个 Service 即可获得完整文件系统能力

2. **安全包装优先**：`existsSafe` 和 `readFileStringSafe` 将常见错误（文件不存在）转为返回值而非抛异常，减少上层调用方的错误处理负担

3. **自动创建目录**：`writeWithDirs` 采用"先写后补救"策略——先尝试写入，仅在 `NotFound` 时创建父目录并重试，避免不必要的 `stat` 调用

4. **错误类型统一**：使用 `Schema.TaggedErrorClass` 定义 `FileSystemError`，与 Effect 的 `PlatformError` 组合为联合类型 `Error`，保持错误类型的可追溯性

5. **Glob 集成**：将 `glob` 库封装为 Effect 风格的异步操作（`Glob.scan`），同时暴露同步的 `globMatch`（基于 `minimatch`）供纯函数场景使用

6. **Windows 路径兼容**：`normalizePath`、`normalizePathPattern`、`resolve`、`windowsPath` 等函数专门处理 Windows 平台的路径差异（盘符、cygwin/msys2 路径格式），确保跨平台一致性

7. **Layer 设计简洁**：`AppFileSystem.layer` 仅依赖 `FileSystem.FileSystem`，`defaultLayer` 直接提供 `NodeFileSystem.layer`，依赖链极短，便于测试时替换为内存文件系统
