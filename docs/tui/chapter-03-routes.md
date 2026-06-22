# 第 3 章 · 页面路由层（routes/）

## 3.1 目录概览

`routes/` 包含 TUI 的页面级组件——用户看到的"整个屏幕"。11 个文件，分为首页和会话页两大块。

| 文件 | 功能 |
|------|------|
| `home.tsx` | 首页：会话列表 + 新建会话入口 |
| `session/index.tsx` | **会话主视图**：组装 Prompt + 消息时间线 + Footer + 侧边栏 |
| `session/footer.tsx` | 底部状态栏：Agent/Model 信息 + Token 统计 |
| `session/sidebar.tsx` | 侧边栏：文件树/Todo/LSP/MCP 等标签 |
| `session/permission.tsx` | 权限请求对话框 |
| `session/question.tsx` | 提问对话框（Question 工具触发） |
| `session/dialog-message.tsx` | 消息操作对话框（Fork、删除等） |
| `session/dialog-timeline.tsx` | 时间线导航对话框 |
| `session/dialog-subagent.tsx` | Subagent 状态对话框 |
| `session/dialog-fork-from-timeline.tsx` | 从时间线 Fork 的对话框 |
| `session/subagent-footer.tsx` | Subagent 会话的底部状态栏 |

## 3.2 事件流转

```text
context/sync.tsx 更新 Store
    │
    │  sync.data.message[sessionID] 变化
    │  sync.data.part[messageID] 变化
    │  sync.data.session_status[sessionID] 变化
    ▼
┌─ session/index.tsx ─────────────────────────────────────────────┐
│                                                                  │
│  const messages = createMemo(() =>                               │
│    sync.data.message[params.id] ?? []                            │
│  )                                                               │
│                                                                  │
│  messages() 变化 → SolidJS 自动重渲染                             │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ <Session> 组件结构:                                        │   │
│  │                                                            │   │
│  │  <Prompt                                                   │   │
│  │    sessionID={params.id}                                   │   │
│  │    onSubmit={...}                                           │   │
│  │  />                                                        │   │
│  │                                                            │   │
│  │  <MessageTimeline                                          │   │
│  │    messages={messages()}                                    │   │
│  │    parts={sync.data.part}                                   │   │
│  │  />                                                        │   │
│  │                                                            │   │
│  │  <Footer                                                    │   │
│  │    sessionID={params.id}                                    │   │
│  │    status={sync.data.session_status[params.id]}             │   │
│  │  />                                                        │   │
│  │                                                            │   │
│  │  <Sidebar                                                   │   │
│  │    todos={sync.data.todo[params.id]}                        │   │
│  │    lsp={sync.data.lsp}                                      │   │
│  │    mcp={sync.data.mcp}                                      │   │
│  │  />                                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## 3.3 关键文件详解

### session/index.tsx — 会话主视图

**功能**：会话页面的根组件。它不直接渲染消息，而是将 Store 中的数据通过 props 分发给子组件。

**自然语言解释**：`session/index.tsx` 是会话页的"组装工"。它从 `sync.data` 中取出当前会话的消息列表、Part 数据、Todo 列表、LSP/MCP 状态，然后分发给 Prompt（输入框）、MessageTimeline（消息流）、Footer（状态栏）、Sidebar（侧边栏）四个子组件。每个子组件通过 props 接收数据，通过 `createMemo` 响应数据变化。

### home.tsx — 首页

**功能**：显示最近的会话列表，提供新建会话入口。

**自然语言解释**：首页从 `sync.data.session` 获取会话列表，按最后更新时间排序显示。用户可以按 Enter 进入已有会话，或输入新消息自动创建新会话。首页还显示项目信息、Workspace 状态和快速操作入口。

### session/footer.tsx — 底部状态栏

**功能**：显示当前会话的关键信息——Agent 名称、Model 名称、Token 消耗、会话状态。

**自然语言解释**：Footer 是用户了解"AI 正在做什么"的窗口。它从 Store 中读取 `session_status`——busy 时显示加载动画，idle 时显示就绪状态。它还显示最后一条 Assistant 消息的 Token 统计（input/output/cache）和成本估算。

### session/permission.tsx — 权限对话框

**功能**：当 AI 调用需要用户授权的工具时，显示权限请求对话框。

**自然语言解释**：Worker 发布 `permission.asked` 事件 → `sync.tsx` 更新 `permission[sessionID]` 数组 → `permission.tsx` 检测到新请求 → 渲染对话框显示"AI 想要执行 xxx，允许吗？" → 用户选择 once/always/deny → 调用 `sdk.client.permission.reply()` → 回复通过 RPC 发回 Worker。

### session/question.tsx — 提问对话框

**功能**：当 AI 调用 Question 工具时，显示多选题对话框。

**自然语言解释**：Worker 发布 `question.asked` 事件 → sync 更新 → question.tsx 渲染多选题界面 → 用户选择 → 回复通过 RPC 发回 Worker → AI 收到答案后继续。

## 3.4 涉及的 SolidJS 模式

| 模式 | 使用位置 |
|------|---------|
| `createMemo` | 各组件 — 从 Store 派生数据 |
| `Switch` / `Match` | `index.tsx` — 根据路由渲染不同页面 |
| `Show` / `For` | `home.tsx` — 会话列表条件/列表渲染 |
| `createSignal` | `footer.tsx` — 本地 UI 状态 |
| `useSync()` / `useRoute()` / `useLocal()` | 各组件 — 访问 Context |

## 3.5 本章小结

`routes/` 是 TUI 的"骨架"——它定义了用户看到的页面结构和组件布局。核心是 `session/index.tsx`，它从 Store 中取数据分发给四个子组件。每个子组件通过 `createMemo` 订阅 Store 的变化，当 Worker 推送新事件时自动重渲染。权限对话框和提问对话框是 Worker→TUI 事件驱动的典型示例——Worker 发布事件，TUI 展示 UI，用户操作后回复给 Worker。
