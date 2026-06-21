# @opencode/TuiConfig — TUI 配置服务
> 婧愭枃浠? `opencode/packages/opencode/src/cli/cmd/tui/config/tui.ts`

## 概述

`@opencode/TuiConfig` 是 OpenCode 的**终端 UI（TUI）配置管理服务**，负责从多个来源加载、合并并解析 TUI 相关的配置（主题、快捷键、注意力提示音、插件等），输出统一的 `Resolved` 配置对象供 TUI 渲染使用。

与 `@opencode/Config`（主配置服务）不同，TuiConfig 专注于 TUI 层面的设置，有独立的配置文件（`tui.json`/`tui.jsonc`）和合并策略。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统操作（读取 tui 配置文件） |
| `Npm` | `@opencode-ai/core/npm` | npm 包管理，安装 `.opencode/` 下的插件依赖 |
| `CurrentWorkingDirectory` | `@opencode/TuiConfig/cwd` | 当前工作目录 |

```typescript
export const defaultLayer = layer.pipe(Layer.provide(Npm.defaultLayer), Layer.provide(AppFileSystem.defaultLayer))
```

## 核心接口

```typescript
export interface Interface {
  readonly get: () => Effect.Effect<Resolved>
  readonly waitForDependencies: () => Effect.Effect<void>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/TuiConfig") {}
```

### 使用示例

```typescript
// 获取解析后的 TUI 配置
const config = yield* TuiConfig.Service.get()

// 等待插件依赖安装完成
yield* TuiConfig.Service.waitForDependencies()
```

### 便捷函数（非 Effect 上下文）

```typescript
// 在非 Effect 上下文中获取配置
const config = await TuiConfig.get()

// 等待依赖安装
await TuiConfig.waitForDependencies()
```

## 数据结构

### 原始配置 (Info/TuiInfo)

| 字段 | 类型 | 说明 |
|------|------|------|
| `theme` | `string?` | 主题名称 |
| `keybinds` | `Record<string, string?>` | 快捷键绑定 |
| `leader_timeout` | `number?` | Leader 键超时（毫秒） |
| `attention` | `object?` | 注意力提示音配置（enabled、notifications、sound、volume、sound_pack、sounds） |
| `plugin` | `ConfigPlugin.Spec[]?` | TUI 插件声明 |

### 解析后配置 (Resolved)

| 字段 | 类型 | 说明 |
|------|------|------|
| `attention` | 展开后的 attention 对象 | 含默认值（enabled=false, volume=0.4, sound_pack="opencode.default"） |
| `keybinds` | `BindingLookupView` | 解析后的快捷键查找表 |
| `leader_timeout` | `number` | Leader 键超时（默认 `KeymapLeaderTimeoutDefault`） |
| `plugin_origins` | `ConfigPlugin.Origin[]?` | 插件来源追踪（内部使用） |

## 关键实现细节

### 配置加载优先级

```
TuiConfig.loadState(ctx)
  ├── 1. 全局 TUI 配置（最低优先级）
  │     └── Global.Path.config 下的 tui.json / tui.jsonc
  ├── 2. OPENCODE_TUI_CONFIG 环境变量覆盖
  │     └── 如果设置了 Flag.OPENCODE_TUI_CONFIG，加载该文件
  ├── 3. 项目级 TUI 文件（从根目录到当前目录）
  │     └── ConfigPaths.files("tui", ctx.directory)
  │     └── 按从根到近的顺序合并，最近的文件优先级最高
  └── 4. .opencode/ 目录下的 TUI 文件（最高优先级）
        └── 所有配置目录中的 .opencode/ 下的 tui 文件
```

### 配置合并

所有来源的配置通过 `mergeDeep`（remeda）深度合并，后加载的覆盖先加载的。

### 配置标准化

`normalize()` 函数处理旧格式兼容：

```typescript
function normalize(raw: Record<string, unknown>) {
  // 如果配置包含嵌套的 "tui" 键（旧 opencode.json 格式），将其展平
  if (isRecord(data.tui)) {
    const tui = data.tui
    delete data.tui
    return { ...tui, ...data }
  }
  return data
}
```

### 变量替换

配置文件内容在解析前通过 `ConfigVariable.substitute` 进行变量替换，支持 `{env:}` 和 `{file:}` 语法：

```typescript
const expanded = yield* Effect.promise(() =>
  ConfigVariable.substitute({ text, type: "path", path: configFilepath, missing: "empty" }),
)
```

### 未知快捷键过滤

`dropUnknownKeybinds()` 检测并过滤不在 TUI schema 中的快捷键绑定，记录警告日志：

```typescript
function dropUnknownKeybinds(input: Record<string, unknown>, configFilepath: string) {
  const invalid = TuiKeybind.unknownKeys(input.keybinds)
  if (!invalid.length) return input
  log.warn("ignored unknown tui keybinds", { path: configFilepath, keybinds: invalid })
  return {
    ...input,
    keybinds: Object.fromEntries(
      Object.entries(input.keybinds).filter(([key]) => !invalid.includes(key))
    ),
  }
}
```

### 平台适配（Windows）

Windows 终端不支持 POSIX suspend 信号，因此：

```typescript
if (process.platform === "win32") {
  keybinds.terminal_suspend = "none"
  keybinds.input_undo ??= unique(["ctrl+z", ...existingUndo]).join(",")
}
```

### 音频路径解析

如果配置了 `attention.sounds`，路径会相对于配置文件所在目录解析：

```typescript
attention: {
  ...parsed.attention,
  sounds: resolveAttentionSoundPaths(path.dirname(configFilepath), parsed.attention.sounds),
}
```

### 插件来源追踪

每个 TUI 插件声明附带了来源元数据：

```typescript
function pluginScope(file: string, ctx: { directory: string }): ConfigPlugin.Scope {
  if (Filesystem.contains(ctx.directory, file)) return "local"
  return "global"
}
```

合并后的插件列表会去重（`ConfigPlugin.deduplicatePluginOrigins`），`plugin_origins` 供运行时加载使用。

### 优雅降级

配置文件读取和解析的所有阶段都有错误处理：

- JSONC 解析失败 → 警告日志，返回空配置
- Schema 校验失败 → 警告日志，返回空配置
- 文件读取失败（权限等） → 警告日志，跳过该文件
- 插件解析失败 → 警告日志，跳过该插件

任何单个文件的失败都不会阻止其他文件的加载和合并。

### 依赖安装

加载完成后，自动在 `.opencode/` 目录安装插件依赖：

```typescript
const deps = yield* Effect.forEach(
  data.dirs,
  (dir) =>
    npm.install(dir, {
      add: [{ name: "@opencode-ai/plugin", version: InstallationLocal ? undefined : InstallationVersion }],
    }).pipe(Effect.forkScoped),
  { concurrency: "unbounded" },
)
```

安装以 `forkScoped` 方式在后台运行，可通过 `waitForDependencies()` 等待所有安装完成。

## 关键设计决策

1. **独立于主配置的 TUI 配置系统**：TUI 配置有独立的文件（`tui.json`）、加载路径和合并策略，与 `@opencode/Config` 解耦，TUI 启动不依赖完整的主配置加载

2. **嵌套 tui 键展平**：兼容旧格式中 `{ "tui": { ... } }` 的嵌套写法，自动展平为顶层键

3. **未知快捷键静默过滤**：不在 schema 中的快捷键绑定不会导致配置加载失败，而是被过滤并记录警告

4. **多来源深度合并**：全局 → 环境变量 → 项目文件 → .opencode 目录，层层叠加，最近的文件优先级最高

5. **平台感知的快捷键默认值**：Windows 上自动禁用 terminal_suspend 并将 ctrl+z 映射为 input_undo

6. **后台插件依赖安装**：插件 npm 依赖以 `forkScoped` 异步安装，不阻塞配置返回，同时提供 `waitForDependencies` 用于需要等待的场景

7. **全局优雅降级**：任何单个文件的加载失败都不会中断整个配置加载流程，所有错误都以警告日志形式记录
