# 第 6 章 · 插件 API（plugin/）

## 6.1 目录概览

`plugin/` 是 TUI 对外暴露的插件 API。它让外部插件可以在 TUI 中注册路由、创建 UI 组件、访问 SDK 和事件流。5 个文件。

| 文件 | 功能 |
|------|------|
| `api.tsx` | **核心**：TuiPluginApi 实现，暴露所有 TUI 能力给插件 |
| `runtime.ts` | 插件运行时：加载、初始化、生命周期管理 |
| `slots.tsx` | 插槽系统：插件在预定义位置插入 UI 组件 |
| `internal.ts` | 内置插件注册（如 home 页面的功能插件） |
| `command-shim.ts` | v1 插件命令兼容层 |

## 6.2 事件流转

```text
插件加载
    │
    ▼
┌─ runtime.ts ────────────────────────────────────────────────────┐
│  ① 扫描插件: 内置插件 + 配置中的 plugin 列表                      │
│  ② 加载插件: import 本地文件 或 加载 npm 包                      │
│  ③ 调用插件初始化函数: plugin.init(api)                          │
│     传入 TuiPluginApi 实例                                       │
└─────────────────────────────────────────────────────────────────┘
    │
    │  插件使用 api 注册路由/组件
    ▼
┌─ api.tsx ───────────────────────────────────────────────────────┐
│  TuiPluginApi 暴露的能力:                                         │
│                                                                  │
│  api.route.register(routes)    注册自定义路由                     │
│  api.route.navigate(target)    导航到指定路由                     │
│  api.ui.dialog.show(...)      显示对话框                         │
│  api.ui.dialog.clear()        关闭对话框                         │
│  api.ui.DialogPrompt           文本输入对话框组件                  │
│  api.ui.DialogSelect           选择列表对话框组件                  │
│  api.ui.DialogAlert            警告对话框组件                     │
│  api.ui.DialogConfirm          确认对话框组件                     │
│  api.sdk                       SDK 客户端实例                    │
│  api.sync                      全局数据 Store                    │
│  api.theme                     主题系统                          │
│  api.renderer                  终端渲染器                         │
│  api.attention                 注意力管理                         │
│  api.keymap                    快捷键管理                         │
│  api.kv                        键值存储                           │
│  api.toast                     Toast 通知                        │
└─────────────────────────────────────────────────────────────────┘
    │
    │  插件路由被访问时
    ▼
┌─ slots.tsx ─────────────────────────────────────────────────────┐
│  插槽系统在预定义位置渲染插件组件:                                   │
│                                                                  │
│  · 首页 Footer 插槽                                              │
│  · 会话页 Footer 插槽                                            │
│  · 侧边栏插槽                                                     │
│  · 系统通知插槽                                                   │
│                                                                  │
│  插件通过 api.slots.register(slotName, component) 注册           │
└─────────────────────────────────────────────────────────────────┘
```

## 6.3 关键文件详解

### api.tsx — TuiPluginApi 实现

**功能**：这是 TUI 插件系统的核心。它将 TUI 的内部能力（路由、对话框、SDK、主题等）封装为统一的 API 对象，传递给每个插件。

**自然语言解释**：`api.tsx` 就像一个"前台接待员"——它知道 TUI 内部的所有功能，但只向插件暴露安全的、有限的接口。插件不能直接访问 TUI 内部状态，只能通过 API 提供的方法操作。例如，插件不能直接修改 Store，但可以通过 `api.sync` 读取数据，通过 `api.route.navigate` 导航到新页面。

`api.tsx` 的实现方式是"适配器模式"——它接收 TUI 内部的各种 Hook 返回值（`useRoute()`、`useSync()`、`useSDK()` 等），将它们包装为插件友好的接口。

### runtime.ts — 插件运行时

**功能**：管理插件的完整生命周期——加载、初始化、卸载。

**自然语言解释**：插件运行时是插件的"操作系统"。它在 TUI 启动时扫描已安装的插件（内置插件 + 用户配置的插件），逐个加载并调用 `init(api)`。插件返回的清理函数在 TUI 退出时调用。运行时还处理插件的热重载——当插件文件变化时重新加载。

### slots.tsx — 插槽系统

**功能**：在 TUI 界面中预留"插槽"，插件可以将自己的 UI 组件插入这些位置。

**自然语言解释**：插槽是 TUI 布局中的"预留空位"。例如，首页 Footer 有一个插槽——插件可以在这里添加自定义按钮或状态显示。侧边栏也有插槽——插件可以添加自定义标签页。插件通过 `api.slots.register("home.footer", MyComponent)` 注册，`slots.tsx` 在渲染时收集所有注册的组件并渲染。

### internal.ts — 内置插件

**功能**：注册 opencode 自带的"内置插件"——实际上就是 `feature-plugins/` 中的功能。

**自然语言解释**：opencode 的侧边栏、首页提示、系统通知等功能也是通过插件 API 实现的——它们被注册为"内置插件"。这种"自己吃自己的狗粮"的设计确保了插件 API 的完整性——如果内置功能都能通过 API 实现，外部插件也能。

### command-shim.ts — v1 兼容

**功能**：为 v1 版本的插件命令提供兼容层。

**自然语言解释**：v1 插件使用 `createCommand` API 注册命令。`command-shim.ts` 将这个旧 API 适配到 v2 的插件 API，确保旧插件无需修改即可运行。

## 6.4 涉及的 SolidJS 模式

| 模式 | 使用位置 |
|------|---------|
| `createSignal` + `createMemo` | `api.tsx` — 路由映射管理 |
| `createEffect` | `runtime.ts` — 插件加载副作用 |
| `Show` / `For` | `slots.tsx` — 插槽组件渲染 |
| `onCleanup` | `runtime.ts` — 插件卸载清理 |

## 6.5 本章小结

`plugin/` 是 TUI 的"扩展接口"。`api.tsx` 将 TUI 内部能力封装为统一的 `TuiPluginApi`，`runtime.ts` 管理插件生命周期，`slots.tsx` 提供 UI 插槽，`internal.ts` 以插件形式注册内置功能。这套设计让 opencode 的 TUI 既保持了内部的清晰边界，又对外提供了灵活的扩展能力。内置功能（侧边栏、首页提示）通过同样的 API 实现，验证了 API 的完整性。
