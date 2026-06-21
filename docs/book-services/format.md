# @opencode/Format — 代码格式化服务
> 婧愭枃浠? `opencode/packages/opencode/src/format/index.ts`

## 概述

`@opencode/Format` 是 OpenCode 的**代码格式化服务**，负责管理多种代码格式化工具的生命周期，对外提供统一的文件格式化接口。它基于 Effect 框架实现，内置了多种主流格式化工具（如 Prettier、Oxfmt、Biome、Ruff 等），并允许用户通过 `Config.formatter` 自定义和扩展。

格式化工具按需匹配文件扩展名，调用外部命令行工具对文件进行原地格式化。工具是否可用在初始化时通过 `enabled` 函数检测（检查命令行是否可执行）。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 读取格式化配置（`cfg.formatter`），获取自定义 formatter 定义、启用/禁用状态 |
| `AppProcess` | `@opencode-ai/core/process` | 执行外部格式化命令（`appProcess.run`） |
| `RuntimeFlags` | `@opencode-ai/core/runtime-flags` | 读取实验性开关（如 `experimentalOxfmt` 传递给 formatter 的 `enabled` 检测） |

```typescript
// index.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const appProcess = yield* AppProcess.Service
    const flags = yield* RuntimeFlags.Service
    // ...
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Config.defaultLayer),
  Layer.provide(AppProcess.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)
```

格式化工具的具体定义和检测逻辑在 `./formatter.ts` 模块中，作为枚举对象（`Formatter` namespace）被导入。

## 核心接口

```typescript
export interface Interface {
  readonly init: () => Effect.Effect<void>                     // 初始化格式化服务
  readonly status: () => Effect.Effect<Status[]>               // 获取所有格式化工具的状态
  readonly file: (filepath: string) => Effect.Effect<boolean>  // 格式化指定文件，返回是否执行了格式化
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Format") {}
```

使用方式：

```typescript
// 初始化格式化服务
yield* Format.Service.init()

// 格式化文件
const formatted = yield* Format.Service.file("/path/to/file.ts")

// 查看格式化工具状态
const statuses = yield* Format.Service.status()
```

## 数据结构

### Status

```typescript
export const Status = Schema.Struct({
  name: Schema.String,               // 格式化工具名称（如 "prettier"、"biome"）
  extensions: Schema.Array(Schema.String),  // 支持的文件扩展名列表
  enabled: Schema.Boolean,           // 当前是否可用
})
```

### Formatter.Info（来自 ./formatter.ts）

每个内置格式化工具实现 `Formatter.Info` 接口，包含：
- `name`：工具名称
- `extensions`：支持的文件扩展名
- `enabled`：异步检测函数，返回 `string[] | false`（可用时返回命令数组，不可用时返回 false）
- `command`（可选）：格式化命令模板，`$FILE` 会被替换为实际文件路径
- `environment`（可选）：执行时注入的环境变量

### State（内部状态）

```typescript
// 内部状态包含三个闭包：
{
  formatters: Record<string, Formatter.Info>   // 所有注册的格式化工具
  isEnabled: (item: Formatter.Info) => Promise<boolean>
  formatFile: (filepath: string) => Effect.Effect<boolean, ...>
}
```

## 关键实现细节

### 命令缓存

每个格式化工具的 `enabled` 检测结果被缓存在 `commands` 对象中：

```typescript
async function getCommand(item: Formatter.Info) {
  let cmd = commands[item.name]
  if (cmd === false || cmd === undefined) {
    cmd = await item.enabled({ ...ctx, experimentalOxfmt: flags.experimentalOxfmt })
    commands[item.name] = cmd
  }
  return cmd
}
```

`false` 表示已检测且不可用（跳过），`undefined` 表示尚未检测，`string[]` 表示可用。这种缓存避免了每次格式化前都重新检测命令可用性。

### 格式化流程

`formatFile` 的核心流程：

1. 根据文件扩展名匹配所有注册的 formatter
2. 异步检测每个 formatter 是否可用（`getCommand`）
3. 对每个可用的 formatter，将 `$FILE` 占位符替换为实际文件路径
4. 通过 `appProcess.run` 以 `stdin: "ignore"` 方式执行外部命令
5. 捕获 spawn 失败和退出码非零的情况，记录日志但不向上传播错误

```typescript
const replaced = cmd.map((x) => x.replace("$FILE", filepath))
const result = yield* appProcess.run(
  ChildProcess.make(replaced[0]!, replaced.slice(1), {
    cwd: dir,
    env: item.environment,
    extendEnv: true,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  }),
)
```

### 配置合并

格式化工具配置合并逻辑：

1. 加载所有内置 `Formatter` 模块中的工具
2. 如果 `cfg.formatter` 为 `true`（或未设置），使用全部内置工具
3. 如果 `cfg.formatter` 为对象，对每个 key：
   - 若 `disabled: true`，从列表中移除
   - 否则使用 `mergeDeep` 将用户配置深度合并到内置定义上
   - 用户可以覆盖 `extensions`、`command`、`environment` 等字段

### Ruff/uv 联动禁用

Ruff 和 uv 共享同一个后端（Ruff formatter），因此禁用任一个会同时移除两者：

```typescript
if (["ruff", "uv"].includes(name) && (cfg.formatter.ruff?.disabled || cfg.formatter.uv?.disabled)) {
  delete formatters.ruff
  delete formatters.uv
  continue
}
```

## 关键设计决策

1. **命令缓存避免重复检测**：每个 formatter 的可用性检测只执行一次，结果缓存后复用。这避免了每次格式化前都执行外部命令检测的开销

2. **错误不传播**：格式化失败（spawn 失败、退出码非零）只记录日志，不向上抛出错误。格式化是辅助功能，不应阻塞主流程

3. **多 formatter 串行执行**：一个文件可能匹配多个 formatter（如 `.ts` 同时匹配 Prettier 和 Biome），它们按顺序依次执行，每个都在前一个完成后运行

4. **$FILE 占位符**：格式化命令模板使用 `$FILE` 占位符，运行时替换为实际文件路径。这使得 formatter 配置更加灵活，用户可以通过 `command` 字段自定义完整的命令行

5. **`mergeDeep` 合并策略**：用户配置使用 `mergeDeep`（remeda）深度合并到内置定义上，而非简单覆盖。这使得用户可以只覆盖需要的字段而保留其他默认值
