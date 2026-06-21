# @opencode/Npm — NPM 包管理服务
> 婧愭枃浠? `opencode/packages/core/src/npm.ts`

## 概述

`@opencode/Npm` 是 OpenCode 的 **npm 包安装与管理服务**，封装了 `@npmcli/arborist` 库，提供声明式的包安装、依赖解析和二进制查找能力。它基于 Effect 框架实现，负责管理缓存在全局目录（`global.cache/packages/`）下的独立 node_modules，并通过 `EffectFlock` 文件锁防止并发安装冲突。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统抽象，检查目录/文件是否存在、读取 JSON 文件、写入权限检查 |
| `Global` | `@opencode-ai/core/global` | 全局状态，提供缓存目录路径（`global.cache`） |
| `FileSystem` | `effect/FileSystem` | Effect 原生文件系统，用于读取 `.bin` 目录、删除 lock 文件 |
| `EffectFlock` | `@opencode-ai/core/util/effect-flock` | 文件锁，防止同一目录的 npm install 并发执行 |
| `NodeFileSystem` | `@effect/platform-node/NodeFileSystem` | Node.js 文件系统实现，由 `defaultLayer` 注入 |

```typescript
// npm.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const afs = yield* AppFileSystem.Service
    const global = yield* Global.Service
    const fs = yield* FileSystem.FileSystem
    const flock = yield* EffectFlock.Service
    // ...
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(EffectFlock.layer),
  Layer.provide(AppFileSystem.layer),
  Layer.provide(Global.layer),
  Layer.provide(NodeFileSystem.layer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly add: (pkg: string) => Effect.Effect<EntryPoint, InstallFailedError | EffectFlock.LockError>
  readonly install: (
    dir: string,
    input?: {
      add: {
        name: string
        version?: string
      }[]
    },
  ) => Effect.Effect<void, EffectFlock.LockError | InstallFailedError>
  readonly which: (pkg: string, bin?: string) => Effect.Effect<Option.Option<string>>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Npm") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 安装包并获取入口点
const entry = yield* Npm.Service.add("typescript")

// 安装目录的依赖
yield* Npm.Service.install(projectDir, {
  add: [{ name: "@opencode-ai/plugin", version: "latest" }],
})

// 查找包的二进制文件路径
const binPath = yield* Npm.Service.which("prettier")
```

### 顶层异步辅助函数

模块导出了三个非 Effect 的 `async` 函数，内部通过 `makeRuntime` 创建 Effect 运行时来执行：

```typescript
export async function install(...args: Parameters<Interface["install"]>)
export async function add(...args: Parameters<Interface["add"]>)
export async function which(...args: Parameters<Interface["which"]>)
```

这些函数使得非 Effect 上下文的调用方可以直接使用 Npm 服务而不需要手动构建 Effect 运行时。

## 数据结构

### InstallFailedError

```typescript
export class InstallFailedError extends Schema.TaggedErrorClass<InstallFailedError>()("NpmInstallFailedError", {
  add: Schema.Array(Schema.String).pipe(Schema.optional),
  dir: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}
```

安装失败时抛出，包含：
- `add`：触发安装的包名列表
- `dir`：安装目标目录
- `cause`：底层错误原因（`@npmcli/arborist` 的原始异常）

### EntryPoint

```typescript
export interface EntryPoint {
  readonly directory: string
  readonly entrypoint: Option.Option<string>
}
```

`add()` 的返回值，描述包的入口信息：
- `directory`：包被安装到的目录（`global.cache/packages/{sanitized_name}`）
- `entrypoint`：`import.meta.resolve` 解析出的入口文件路径，解析失败时为 `Option.none()`

### 内部类型（不导出）

```typescript
interface ArboristNode {
  name: string
  path: string
}

interface ArboristTree {
  edgesOut: Map<string, { to?: ArboristNode }>
}
```

`ArboristNode` 和 `ArboristTree` 是 `@npmcli/arborist` 的 `reify()` 返回类型的简化接口定义，用于提取安装后的依赖树信息。

## 关键实现细节

### 包名清理（sanitize）

Windows 平台上，包名中的非法文件名字符（`<`, `>`, `:`, `"`, `|`, `?`, `*`）和控制字符（ASCII < 32）会被替换为 `_`，确保生成的目录路径合法：

```typescript
const illegal = process.platform === "win32"
  ? new Set(["<", ">", ":", '"', "|", "?", "*"])
  : undefined

export function sanitize(pkg: string) {
  if (!illegal) return pkg
  return Array.from(pkg, (char) =>
    (illegal.has(char) || char.charCodeAt(0) < 32 ? "_" : char)
  ).join("")
}
```

### 缓存目录策略

所有包被安装到全局缓存目录下的独立子目录，而非项目的 `node_modules`：

```typescript
const directory = (pkg: string) =>
  path.join(global.cache, "packages", sanitize(pkg))
```

这意味着每个包拥有独立的 `node_modules`，避免了依赖冲突。

### reify 流程（文件锁 + Arborist）

`reify` 内部函数封装了完整的安装流程：

1. 获取文件锁（`flock.acquire`），key 为 `npm-install:{dir}`，防止同一目录并发安装
2. 动态 `import("@npmcli/arborist")`，避免非 npm 场景下的启动开销
3. 加载 npm 配置（`NpmConfig.load`），支持 `.npmrc` 等配置文件
4. 创建 Arborist 实例，配置 `binLinks: true`、`progress: false`、`ignoreScripts: true`
5. 调用 `arborist.reify()` 执行安装
6. 失败时抛出 `InstallFailedError`，包含安装参数和原始错误

### add 方法：幂等安装 + 入口解析

1. 计算缓存目录：`global.cache/packages/{sanitized_name}`
2. 解析 npm 包名（`npm-package-arg`），处理 scoped package（`@scope/name`）
3. **快速路径**：如果 `node_modules/{name}` 已存在，直接返回入口点，跳过安装
4. **慢路径**：调用 `reify` 安装，从 `ArboristTree.edgesOut` 中提取第一个依赖节点作为入口
5. 如果 `reify` 成功但无依赖边且入口解析失败，抛出 `InstallFailedError`

```typescript
const add = Effect.fn("Npm.add")(function* (pkg: string) {
  const dir = directory(pkg)
  const name = npa(pkg).name ?? pkg

  // 快速路径：已安装
  if (yield* afs.existsSafe(path.join(dir, "node_modules", name))) {
    return resolveEntryPoint(name, path.join(dir, "node_modules", name))
  }

  // 慢路径：安装
  const tree = yield* reify({ dir, add: [pkg] })
  const first = tree.edgesOut.values().next().value?.to
  // ...
}, Effect.scoped)
```

### install 方法：增量安装 + 脏检测

`install` 用于为已有项目目录安装依赖（如 `.opencode/` 下的 `package.json`）。它采用两级检查策略：

1. **节点模块检查**：如果 `node_modules/` 不存在，直接 `reify` 安装
2. **脏检测**：如果 `node_modules/` 已存在，对比 `package.json` 中声明的依赖与 `package-lock.json` 中锁定的依赖。如果 `package.json` 声明了 lock 中不存在的包（即新增了依赖），重新 `reify`。只比较顶层依赖名（不比较版本），避免不必要的重安装
3. 目录不可写时静默跳过（`return`）

```typescript
const canWrite = yield* afs.access(dir, { writable: true }).pipe(
  Effect.as(true),
  Effect.orElseSucceed(() => false),
)
if (!canWrite) return
```

### which 方法：二进制查找 + 自动安装

`which` 返回包的二进制文件完整路径，用于执行 npm 包提供的 CLI 工具：

1. 构造 `.bin` 目录路径：`{cache}/packages/{pkg}/node_modules/.bin`
2. **第一次查找**（`pick`）：
   - 读取 `.bin` 目录下的文件列表
   - 如果调用方指定了 `bin` 参数，精确匹配该名称
   - 如果只有一个文件，直接返回
   - 如果有多个文件，读取包的 `package.json` 中的 `bin` 字段推断主入口
3. **失败回退**：删除 `package-lock.json` 后重新 `add` 安装，再次 `pick`
4. 整体以 `Effect.orElseSucceed(() => Option.none())` 包裹，任何错误都不抛出，返回 `Option.none()`

`bin` 字段解析逻辑：
- `string` 类型：返回 unscoped 名称（`@foo/bar` → `bar`）
- `Record` 类型且只有一个 key：返回该 key
- `Record` 类型且包含 unscoped 名称：返回 unscoped 名称
- 否则返回第一个 key

## 关键设计决策

1. **Effect Service 模式**：使用 Effect 的 `Context.Service` 实现依赖注入，所有操作都是纯 Effect，天然支持并发控制、错误传播和 span 追踪（`Effect.withSpan`）

2. **独立缓存目录**：每个包安装到 `global.cache/packages/{sanitized_name}` 而非共享的 `node_modules`，避免依赖冲突，每个包拥有完全隔离的依赖树

3. **文件锁并发控制**：所有 `reify` 操作前获取 `EffectFlock` 锁，key 为 `npm-install:{dir}`，防止同一目录的并发安装导致 `node_modules` 损坏

4. **幂等安装 + 快速路径**：`add` 方法先检查缓存是否已存在，避免重复安装；`install` 方法通过对比 `package.json` 和 `package-lock.json` 做脏检测，只在依赖变更时重装

5. **延迟导入 Arborist**：`@npmcli/arborist` 通过动态 `import()` 加载，避免在非 npm 操作场景下的模块解析开销

6. **ignoreScripts: true**：安装时不执行 npm lifecycle scripts（`preinstall`、`postinstall` 等），这是安全设计——避免安装第三方包时执行任意代码

7. **Windows 路径兼容**：`sanitize` 函数处理 Windows 文件名非法字符，`process.platform` 检查确保跨平台兼容

8. **非 Effect 辅助函数**：导出顶层 `async` 函数（`add`、`install`、`which`），通过 `makeRuntime` 桥接 Effect 世界，降低非 Effect 调用方的接入成本

9. **静默失败策略**：`install` 在目录不可写时静默跳过；`which` 在所有错误情况下返回 `Option.none()` 而非抛出——这些设计使得服务在受限环境中优雅降级
