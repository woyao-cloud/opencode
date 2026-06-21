# @opencode/v2/PluginBoot — 插件启动服务
> 婧愭枃浠? `opencode/packages/core/src/plugin/boot.ts`

## 概述

PluginBoot 是插件系统的核心启动服务，实现 `Plugin.Boot` Tag 所约定的启动函数。它负责解析插件配置、安装依赖、加载插件模块、运行插件，并将插件导出的实例注册到全局 `Instance` 容器中。

### 依赖的 Services

| Service | 用途 |
|---|---|
| `PathMaker` | 获取项目目录（`.opencode`）、系统目录、worktree 路径、home 目录 |
| `Log` | 日志记录（传递给底层插件函数） |
| `Instance` | 将插件加载后的导出实例注册到全局容器 |

## 核心接口

```ts
// --- 接口定义 ---
export class PluginBoot extends Service<PluginBoot>() {
  readonly [PluginBootProvide] = PluginBootProvide
  boot(): Effect<never, never, void>
}
```

`PluginBoot` 通过 `layer` 函数注册到 `Service`：

```ts
// 构建层
const pluginBootLayer = PluginBoot.layer() // = PluginBoot.provide()

// 服务访问
const pluginBoot = yield* PluginBoot
yield* pluginBoot.boot()
```

## 数据结构

本服务无自定义 Schema 或数据结构。插件列表由底层 `resolvePlugins` 返回。

## 关键实现细节

- **四步加载流程**: `boot()` 按以下顺序处理每个插件：
  1. `resolvePlugins` — 解析插件配置，返回插件列表
  2. `installPlugin` — 安装插件依赖
  3. `loadPlugin` — 加载插件模块
  4. `runPlugin` — 运行插件并获取导出实例
- **PluginLoader 模式**: 内部定义 `loader: PluginLoader` 函数，封装 install → load → run 三步，对每个插件依次执行
- **实例注册**: `runPlugin` 返回的实例通过 `instance.set(loaded)` 注册到全局容器，使其他服务可以通过 Tag 查找到插件提供的功能
- **路径解析**: 通过 `PathMaker` 获取 4 个路径上下文：
  - `path.project.dir(".opencode")` — 项目级插件配置目录
  - `path.project.dir("system")` — 系统级插件目录
  - `path.worktree` — worktree 路径
  - `path.home` — 用户 home 目录
- **日志埋点**: 每个插件加载时输出 `"Loading plugin: {name}"` 日志

## 关键设计决策

1. 插件加载流程是顺序的（`for...of`），而非并行——保证插件按依赖顺序加载
2. 插件解析使用多个路径源（项目、系统、worktree、home），支持多层级的插件配置
3. `PluginLoader` 类型由 `@open-code-ai-v2/plugin/loader` 定义，保持了类型安全
4. 插件导出通过 `instance.set()` 注册到全局容器，利用 Instance 的 `Object.entries` 遍历机制支持多 Tag 注册
5. 若插件加载失败，Effect 的错误传播机制会中断后续插件的加载
