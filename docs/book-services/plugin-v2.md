# @opencode/v2/Plugin — 插件服务

## 概述

Plugin 服务是插件系统的顶层入口。它定义 `Plugin.Boot` Tag 并通过 `Instance` 容器查找已注册的启动函数，调用 `boot()` 触发整个插件加载流程。实际的插件解析、安装、加载、运行逻辑由 `PluginBoot` 服务实现。

### 依赖的 Services

| Service | 用途 |
|---|---|
| `Instance` | 通过 `Plugin.Boot` Tag 查找已注册的启动函数 |

## 核心接口

```ts
// --- 接口定义 ---
export class Plugin extends Service<Plugin>() {
  readonly [PluginProvide] = PluginProvide
  boot(): Effect<never, Error, void>
}
```

`Plugin` 通过 `layer` 函数注册到 `Service`，同时注册 `Plugin.Boot` Tag：

```ts
// 构建层
const pluginLayer = Plugin.layer() // = provide + register(Plugin.Boot, Instance)

// 服务访问
const plugin = yield* Plugin
yield* plugin.boot()
```

## 数据结构

```ts
Plugin.Boot = Tag<() => Effect<never, never, void>>("Plugin.Boot")
```

`Plugin.Boot` 是一个 Tag，其值为一个无参数、无返回值、永不失败的 Effect 函数。该函数由 `PluginBoot` 或其他插件启动器通过 `Instance.set()` 注册。

## 关键实现细节

- **Tag 解耦**: `Plugin` 不直接依赖 `PluginBoot`，而是通过 `Plugin.Boot` Tag 从 `Instance` 容器中动态查找启动函数，实现了接口与实现的分离
- **启动函数签名**: `Plugin.Boot` 的函数签名为 `() => Effect<never, never, void>`，即无输入、无错误、无输出
- **错误处理**: 若 `Instance` 中未找到 `Plugin.Boot` 注册项，`boot()` 抛出 `"Plugin boot not found"` 错误
- **layer 注册**: `Plugin.layer()` 通过 `register(Plugin.Boot, Instance)` 建立 Tag 绑定，后续 `PluginBoot` 或其他启动器通过 `instance.set()` 填充实际函数

## 关键设计决策

1. 使用 Tag + Instance 模式解耦插件服务与插件启动实现，允许替换不同的启动策略
2. `Plugin.Boot` Tag 的 value 是函数而非对象，使 `boot()` 可以直接 `yield* boot()` 调用
3. 插件服务只暴露单一 `boot()` 方法，不暴露安装、卸载、列表等操作——这些细节由 `PluginBoot` 内部处理
4. 若启动函数未注册则立即失败（fail-fast），而非静默跳过
