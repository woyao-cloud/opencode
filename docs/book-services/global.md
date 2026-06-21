# @opencode/Global — 全局状态服务
> 婧愭枃浠? `opencode/packages/core/src/global.ts`

## 概述

`@opencode/Global` 是 OpenCode 的**全局路径与状态管理服务**，负责定义和维护应用中所有标准化的文件系统路径（数据、缓存、配置、日志、临时目录等），并对外暴露为 Effect Service。它在模块加载时即同步初始化所有目录，是项目中最底层的基础设施服务之一。

该服务遵循 XDG Base Directory 规范，自动将路径映射到平台对应的标准目录，同时支持通过 `OPENCODE_TEST_HOME` 环境变量和 `Flag.OPENCODE_CONFIG_DIR` 进行覆盖，适配测试环境和自定义部署场景。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Flag.OPENCODE_CONFIG_DIR` | `@opencode-ai/core/flag` | 命令行标志，可覆盖 `config` 目录路径 |

`Global` 的 layer 定义使用 `Effect.sync`（同步 Effect），不使用 `Effect.gen`，因此没有 `yield*` 依赖。其唯一的外部依赖是 `Flag.OPENCODE_CONFIG_DIR` 静态标志变量。

此外，模块顶层会调用 `Flock.setGlobal({ state })` 来设置全局文件锁的状态目录，以及在模块加载时通过 `fs.mkdir` 确保所有路径目录存在。

```typescript
// global.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.sync(() => Service.of(make())),
)

export const defaultLayer = layer

export const layerWith = (input: Partial<Interface>) =>
  Layer.effect(
    Service,
    Effect.sync(() => Service.of(make(input))),
  )
```

## 核心接口

```typescript
export interface Interface {
  readonly home: string   // 用户主目录，可通过 OPENCODE_TEST_HOME 覆盖
  readonly data: string   // XDG_DATA_HOME/opencode — 持久化数据
  readonly cache: string  // XDG_CACHE_HOME/opencode — 缓存数据
  readonly config: string // XDG_CONFIG_HOME/opencode — 配置文件，可通过 Flag 覆盖
  readonly state: string  // XDG_STATE_HOME/opencode — 运行时状态
  readonly tmp: string    // os.tmpdir()/opencode — 临时文件
  readonly bin: string    // cache/bin — 二进制文件
  readonly log: string    // data/log — 日志文件
  readonly repos: string  // data/repos — 仓库数据
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Global") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取主目录
yield* Global.Service.home

// 获取日志目录
yield* Global.Service.log
```

### make 工厂函数

```typescript
export function make(input: Partial<Interface> = {}): Interface {
  return {
    home: Path.home,
    data: Path.data,
    cache: Path.cache,
    config: Flag.OPENCODE_CONFIG_DIR ?? Path.config,
    state: Path.state,
    tmp: Path.tmp,
    bin: Path.bin,
    log: Path.log,
    repos: Path.repos,
    ...input,
  }
}
```

`make` 支持通过 `input` 参数覆盖任意路径，配合 `layerWith` 用于自定义场景（如测试时注入临时目录）：

```typescript
// 自定义路径的 layer
const customLayer = Global.layerWith({ tmp: "/custom/tmp" })
```

## 数据结构

### Path 常量对象

模块顶层导出 `Path` 对象，包含所有预计算的路径常量，部分使用 getter 以支持延迟计算：

| 属性 | 来源 | 典型值 (Linux) |
|------|------|----------------|
| `home` | `OPENCODE_TEST_HOME` 或 `os.homedir()` | `/home/user` |
| `data` | `xdgData/opencode` | `~/.local/share/opencode` |
| `bin` | `xdgCache/opencode/bin` | `~/.cache/opencode/bin` |
| `log` | `xdgData/opencode/log` | `~/.local/share/opencode/log` |
| `repos` | `xdgData/opencode/repos` | `~/.local/share/opencode/repos` |
| `cache` | `xdgCache/opencode` | `~/.cache/opencode` |
| `config` | `xdgConfig/opencode` | `~/.config/opencode` |
| `state` | `xdgState/opencode` | `~/.local/state/opencode` |
| `tmp` | `os.tmpdir()/opencode` | `/tmp/opencode` |

`home` 使用 getter 以确保在测试环境（`OPENCODE_TEST_HOME` 在运行时设置）中也能正确获取。

### Interface 字段

所有字段均为 `readonly string` 类型，语义明确：

- **home**: 用户主目录，是许多其他路径的基准
- **data**: 持久化应用数据（如配置、日志、仓库）
- **cache**: 可安全删除的缓存数据
- **config**: 配置文件所在目录，可被 `Flag.OPENCODE_CONFIG_DIR` 覆盖
- **state**: 运行时状态，用作 `Flock` 文件锁的全局目录
- **tmp**: 临时文件
- **bin**: 可执行文件目录
- **log**: 日志输出目录
- **repos**: 仓库数据目录

## 关键实现细节

### 模块级目录初始化

模块加载时通过顶层 `await Promise.all([...])` 并行创建所有目录：

```typescript
await Promise.all([
  fs.mkdir(Path.data, { recursive: true }),
  fs.mkdir(Path.config, { recursive: true }),
  fs.mkdir(Path.state, { recursive: true }),
  fs.mkdir(Path.tmp, { recursive: true }),
  fs.mkdir(Path.log, { recursive: true }),
  fs.mkdir(Path.bin, { recursive: true }),
  fs.mkdir(Path.repos, { recursive: true }),
])
```

使用 `{ recursive: true }` 确保父目录不存在时也能一并创建，且重复创建已存在的目录不会报错。

### Flock 全局状态目录

在目录初始化之前，调用 `Flock.setGlobal({ state })` 将 `state` 目录注册为全局文件锁的工作目录：

```typescript
Flock.setGlobal({ state })
```

这确保了所有 `Flock` 实例的锁文件都统一存放在 `~/.local/state/opencode` 下。

### config 路径的可覆盖性

`config` 字段是唯一在 `make` 中通过外部标志覆盖的路径：

```typescript
config: Flag.OPENCODE_CONFIG_DIR ?? Path.config,
```

当用户通过 CLI 传入 `--config-dir` 或设置 `OPENCODE_CONFIG_DIR` 环境变量时，`Flag.OPENCODE_CONFIG_DIR` 为非空值，优先使用；否则回退到 XDG 规范路径。

### home 的测试环境支持

`Path.home` 使用 getter 以支持运行时覆盖：

```typescript
get home() {
  return process.env.OPENCODE_TEST_HOME ?? os.homedir()
}
```

测试代码可以通过设置 `OPENCODE_TEST_HOME` 环境变量来隔离测试环境，无需修改系统文件。

### 纯同步 Layer

与其他大多数服务不同，`Global.layer` 使用 `Effect.sync` 而非 `Effect.gen`，因为路径构建是纯同步操作，无需任何异步依赖。这使得 `Global` 的初始化开销极低且可预测。

### layerWith 工厂模式

提供 `layerWith(input)` 函数，接受 `Partial<Interface>` 来覆盖默认路径，用于测试和自定义部署：

```typescript
export const layerWith = (input: Partial<Interface>) =>
  Layer.effect(
    Service,
    Effect.sync(() => Service.of(make(input))),
  )
```

### 模块自引用导出

文件末尾通过命名空间重导出自身：

```typescript
export * as Global from "./global"
```

这使得其他模块可以通过 `import { Global } from "@opencode-ai/core/global"` 同时获取 `Global.Service` 类和 `Global.layer` 等所有导出。

## 关键设计决策

1. **XDG Base Directory 规范**：路径遵循 XDG 规范（`xdgData`、`xdgCache`、`xdgConfig`、`xdgState`），确保跨平台兼容性和用户数据组织的一致性

2. **模块级顶层初始化**：目录创建在模块加载时执行（顶层 `await`），而非在 Layer 初始化时，确保在任何 Effect 运行时启动前文件系统已就绪

3. **Effect Service 模式**：使用 Effect 的 `Context.Service` 实现依赖注入，类型安全的接口定义使得所有消费者可以通过 `yield*` 获取路径，天然支持测试时替换

4. **config 路径的 Flag 覆盖**：`config` 目录是唯一可通过 `Flag.OPENCODE_CONFIG_DIR` 覆盖的路径，其他路径始终保持 XDG 规范——这一设计反映了配置目录是用户最可能需要自定义的路径

5. **home 使用 getter 延迟求值**：`Path.home` 使用 getter 而非静态赋值，以支持 `OPENCODE_TEST_HOME` 在运行时设置（而非仅在进程启动时），为测试框架提供灵活性

6. **纯同步 Layer**：由于路径计算完全同步，Layer 使用 `Effect.sync` 而非 `Effect.gen`，避免不必要的异步开销，初始化速度极快

7. **模块自引用导出模式**：`export * as Global from "./global"` 使得消费者可以用单一 import 获取 Service 类、layer 和类型定义，API 简洁统一

8. **Flock 与 Global 的耦合**：`Flock.setGlobal({ state })` 在模块顶层直接调用，建立了文件锁与状态目录的隐式绑定——所有文件锁操作默认使用 `state` 目录
