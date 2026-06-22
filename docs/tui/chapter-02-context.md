# 第 2 章 · 状态管理层（context/）

## 2.1 目录概览

`context/` 是 TUI 的状态管理核心。它包含 19 个 .ts/.tsx 文件（另有约 30 个主题 JSON 文件），每个文件封装一个独立的功能域。

| 文件 | 功能 | 类型 |
|------|------|------|
| `sync.tsx` | **核心**：Worker 事件消费 + 全局数据 Store | Context |
| `event.ts` | EventSource 封装，接收 Worker 推送 | 工具 |
| `route.tsx` | 路由状态（当前页面、导航） | Context |
| `theme.tsx` | 主题状态（暗色/亮色、颜色方案） | Context |
| `local.tsx` | 本地状态（当前 Agent、Model、Variant） | Context |
| `sdk.tsx` | SDK 客户端实例提供 | Context |
| `project.tsx` | 项目信息（工作目录、Workspace） | Context |
| `args.tsx` | 命令行参数 | Context |
| `kv.tsx` | 键值存储（用户偏好持久化） | Context |
| `exit.tsx` | 退出逻辑 | Context |
| `editor.ts` / `editor-zed.ts` | 编辑器集成（光标位置、选中内容） | Context |
| `thinking.ts` | 思考模式状态 | 工具 |
| `directory.ts` | 目录过滤状态 | 工具 |
| `command-palette.tsx` | 命令面板状态 | Context |
| `path-format.tsx` | 路径格式化偏好 | Context |
| `tui-config.tsx` | TUI 配置（快捷键、布局） | Context |
| `prompt.tsx` | Prompt 全局状态 | Context |
| `aggregate-failures.ts` | 聚合错误处理 | 工具 |
| `helper.tsx` | `createSimpleContext` 工厂函数 | 基础设施 |

## 2.2 事件流转

```text
Worker 线程发布事件
    │
    │  RPC 推送
    ▼
┌─ event.ts ──────────────────────────────────────────────────────┐
│  createEventSource(client)                                      │
│  → client.on("global.event", handler)                           │
│  → 封装为 subscribe/unsubscribe 模式                             │
└─────────────────────────────────────────────────────────────────┘
    │
    │  handler 被调用
    ▼
┌─ sync.tsx ──────────────────────────────────────────────────────┐
│  event.subscribe((event, { workspace }) => {                    │
│    switch (event.type) {                                        │
│      case "message.part.updated":                               │
│        → setStore("part", messageID, [...] updated parts)       │
│      case "session.status":                                     │
│        → setStore("session_status", sessionID, status)          │
│      case "permission.asked":                                   │
│        → setStore("permission", sessionID, [...requests])       │
│      case "message.updated":                                    │
│        → 更新消息列表                                            │
│      case "session.updated":                                    │
│        → 更新会话元数据                                          │
│      case "server.instance.disposed":                           │
│        → 重新初始化 (bootstrap)                                  │
│    }                                                             │
│  })                                                              │
│                                                                  │
│  SolidJS Store 结构:                                             │
│  {                                                               │
│    session: Session[]           // 会话列表                       │
│    message: { [id]: Message[] } // 每个会话的消息                  │
│    part: { [msgId]: Part[] }    // 每条消息的 Part                 │
│    session_status: { [id]: Status } // 会话状态                   │
│    permission: { [id]: Request[] } // 权限请求                    │
│    provider: Provider[]         // 模型提供商                     │
│    agent: Agent[]               // 可用 Agent                     │
│    config: Config               // 项目配置                       │
│    todo: { [id]: Todo[] }       // 任务列表                       │
│    lsp: LspStatus[]             // LSP 状态                       │
│    mcp: { [key]: McpStatus }    // MCP 状态                       │
│    ...                                                            │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
    │
    │  Store 更新 → 响应式传播
    ▼
┌─ routes/ 和 component/ 中的 createMemo / createEffect ─────────┐
│  自动检测依赖变化 → 触发组件重渲染                                │
└─────────────────────────────────────────────────────────────────┘
```

## 2.3 关键文件详解

### sync.tsx — 全局数据 Store（最核心）

**功能**：这是 TUI 中最大的 Context 文件。它做三件事：
1. 定义全局 Store 的数据结构（session、message、part、permission 等）
2. 通过 `event.subscribe()` 订阅 Worker 推送的所有事件
3. 根据事件类型更新 Store 的对应字段

**自然语言解释**：`sync.tsx` 是 Worker 事件和 TUI 组件之间的"翻译官"。Worker 发来 `message.part.updated` 事件（包含 sessionID、messageID、part 数据），sync 将其更新到 Store 的 `part[messageID]` 数组中。任何通过 `createMemo` 订阅了这个数组的组件（如消息时间线）会自动重渲染。这种"数据变了就自动重绘"的模式是 SolidJS 响应式系统的核心价值。

### event.ts — EventSource 封装

**功能**：将 Worker 的 RPC 事件推送封装为标准的 subscribe/unsubscribe 模式。

**自然语言解释**：Worker 通过 `client.on("global.event", handler)` 推送事件。`event.ts` 将这个底层 API 包装为 `subscribe(handler)` 和 `unsubscribe()` 的简洁接口。多个消费者（sync、notification 等）可以独立订阅，互不干扰。

### helper.tsx — createSimpleContext 工厂

**功能**：这是所有 Context 的创建工厂。提供统一的 `{ use, provider }` 模式。

**自然语言解释**：`createSimpleContext({ name, init })` 返回一个 `use` Hook 和一个 `Provider` 组件。`init` 函数在 Provider 首次渲染时执行，创建状态并返回。这避免了每个 Context 文件重复编写 `createContext` + `useContext` + Provider 组件的样板代码。

### route.tsx — 路由管理

**功能**：管理当前页面路由。支持 `navigate({ type: "session", sessionID })` 等导航操作。

**自然语言解释**：TUI 的路由是简单的状态切换——不是 URL 路由，而是当前显示的页面组件。`navigate` 更新路由状态，`Switch/Match` 根据状态渲染对应组件。路由还管理标签页（tabs）——用户可以在会话页面中打开多个标签（消息、上下文、文件树等）。

### theme.tsx — 主题系统

**功能**：管理终端颜色主题。支持 30+ 内置主题（gruvbox、dracula、nord、tokyonight 等），从 JSON 文件加载颜色定义。

**自然语言解释**：主题系统从 `context/theme/*.json` 加载颜色方案，通过 SolidJS Context 提供给所有组件。组件通过 `useTheme()` 获取当前主题的颜色值（如 `theme.background`、`theme.text`），实现全局统一的外观。

### local.tsx — 本地状态

**功能**：管理用户在当前会话中的选择——当前 Agent、当前 Model、当前 Variant。

**自然语言解释**：`local.tsx` 是"用户当前选择了什么"的状态。当用户在 TUI 中切换 Agent 或 Model 时，`local.agent.set("plan")` 更新状态，所有依赖这些状态的组件（如 Footer 中的 Agent 显示）自动更新。

### sdk.tsx + project.tsx

**功能**：提供 SDK 客户端实例和项目信息（工作目录、Workspace 状态）。

**自然语言解释**：`sdk.tsx` 创建 `OpencodeClient` 实例并注入到 Context 中，所有需要调用 API 的组件通过 `useSDK()` 获取。`project.tsx` 管理项目实例的加载和 Workspace 连接状态。

## 2.4 涉及的 SolidJS 模式

| 模式 | 使用位置 |
|------|---------|
| `createSimpleContext` 工厂 | `helper.tsx` — 被所有 Context 使用 |
| `createStore` + `setStore` + `produce` | `sync.tsx` — 全局 Store 的创建和更新 |
| `reconcile` | `sync.tsx` — 高效替换数组数据 |
| `batch` | `sync.tsx` — 批量事件更新，避免多次重渲染 |
| `onMount` | `sync.tsx` — 组件挂载时订阅事件 |
| `createMemo` | 各处 — 派生计算值 |

## 2.5 本章小结

`context/` 是 TUI 的"大脑"。它通过 `sync.tsx` 消费 Worker 事件、更新 SolidJS Store，通过响应式系统自动触发组件重渲染。每个 Context 文件封装一个独立的功能域，通过 `createSimpleContext` 工厂模式保持一致的 API 风格。理解 `sync.tsx` 的事件处理逻辑是理解整个 TUI 渲染机制的关键。
