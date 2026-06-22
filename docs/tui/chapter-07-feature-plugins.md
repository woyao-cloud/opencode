# 第 7 章 · 功能插件（feature-plugins/）

## 7.1 目录概览

`feature-plugins/` 是通过插件 API 实现的 TUI 内置功能。13 个文件，按功能分为三组。

| 文件 | 功能 | 组 |
|------|------|----|
| `sidebar/context.tsx` | 侧边栏上下文标签（文件树） | 侧边栏 |
| `sidebar/files.tsx` | 侧边栏文件列表 | 侧边栏 |
| `sidebar/todo.tsx` | 侧边栏 Todo 任务列表 | 侧边栏 |
| `sidebar/lsp.tsx` | 侧边栏 LSP 状态 | 侧边栏 |
| `sidebar/mcp.tsx` | 侧边栏 MCP 状态 | 侧边栏 |
| `sidebar/footer.tsx` | 侧边栏底部信息 | 侧边栏 |
| `home/tips.tsx` | 首页提示数据（随机展示） | 首页 |
| `home/tips-view.tsx` | 首页提示渲染组件 | 首页 |
| `home/footer.tsx` | 首页 Footer 扩展 | 首页 |
| `system/notifications.ts` | 系统通知管理 | 系统 |
| `system/plugins.tsx` | 系统插件管理界面 | 系统 |
| `system/session-v2.tsx` | V2 Session 状态管理 | 系统 |
| `system/which-key.tsx` | 快捷键提示面板 | 系统 |

## 7.2 事件流转

```text
Worker 事件 → sync.tsx 更新 Store
    │
    ▼
侧边栏组件通过 useSync() 读取数据:
    │
    ├─ sidebar/todo.tsx    ← sync.data.todo[sessionID]
    ├─ sidebar/lsp.tsx     ← sync.data.lsp
    ├─ sidebar/mcp.tsx     ← sync.data.mcp
    ├─ sidebar/files.tsx   ← sync.data.session_diff[sessionID]
    └─ sidebar/context.tsx ← 项目文件树
    │
    ▼
SolidJS 响应式自动重渲染
```

## 7.3 关键文件详解

### 侧边栏组（sidebar/）

**sidebar/context.tsx — 文件树**

**功能**：在侧边栏中展示项目文件树，支持展开/折叠目录、文件搜索。

**自然语言解释**：文件树是侧边栏的默认标签。它从 Worker 获取项目文件列表，以树形结构展示。用户可以浏览目录、选择文件、查看文件状态（已修改/新增/删除）。文件树的渲染使用虚拟滚动——只渲染可见区域的节点，支持大项目的流畅浏览。

**sidebar/todo.tsx — 任务列表**

**功能**：展示 AI 的 Todo 列表（由 TodoWrite 工具创建）。

**自然语言解释**：当 AI 使用 TodoWrite 工具更新任务列表后，Worker 发布事件 → sync 更新 `todo[sessionID]` → `todo.tsx` 通过 `For` 遍历渲染每个 `todo-item` 组件。用户可以看到 AI 的"工作计划"——哪些任务 pending、哪些 in_progress、哪些 completed。这个视图在 Plan 模式和复杂多步骤任务中特别有用。

**sidebar/lsp.tsx + sidebar/mcp.tsx**

**功能**：展示 LSP 语言服务器和 MCP 服务器的连接状态。

**自然语言解释**：这两个组件显示"AI 有哪些外部工具可用"。LSP 面板显示已连接的语言服务器（TypeScript、Rust、Go 等）及其状态。MCP 面板显示已连接的 MCP 服务器及其提供的工具数量。如果某个服务器断开，这里会显示错误状态。

**sidebar/files.tsx**

**功能**：展示当前会话的文件变更列表（Diff）。

**自然语言解释**：显示 AI 在当前会话中修改了哪些文件——类似 Git 的 `git status`。每个文件显示变更类型（新增/修改/删除）和变更行数。

### 首页组（home/）

**home/tips.tsx + tips-view.tsx**

**功能**：在首页随机展示使用技巧。

**自然语言解释**：首页在等待用户输入时展示随机提示——如"按 Ctrl+P 打开命令面板"、"使用 @ 引用文件"。提示数据来自 `tips.tsx` 中的静态列表，`tips-view.tsx` 负责渲染。这是一种降低新用户学习曲线的"微交互"设计。

**home/footer.tsx**

**功能**：首页 Footer 的扩展内容。

### 系统组（system/）

**system/notifications.ts**

**功能**：管理系统级通知（升级提示、错误报告）。

**自然语言解释**：当检测到新版本可用或发生系统级错误时，通过通知系统推送给用户。通知可以是一次性的（Toast）或持久的（Footer 中的图标）。

**system/plugins.tsx**

**功能**：插件管理界面——查看已安装插件、启用/禁用。

**system/session-v2.tsx**

**功能**：V2 Session 状态管理。

**system/which-key.tsx**

**功能**：快捷键提示面板——按下 Leader 键后显示可用的快捷键组合。

**自然语言解释**：类似 Emacs/Vim 的 which-key 功能。用户按下 Leader 键（默认 Ctrl+X）后，屏幕底部显示所有可用的快捷键组合及其说明。这是一个"发现性"功能——帮助用户逐步学习 TUI 的快捷键。

## 7.4 涉及的 SolidJS 模式

| 模式 | 使用位置 |
|------|---------|
| `createMemo` | 各处 — 从 sync Store 派生数据 |
| `createSignal` | `tips.tsx` — 随机提示索引 |
| `For` | `sidebar/todo.tsx`、`sidebar/files.tsx` — 列表渲染 |
| `Show` / `Switch` | 各处 — 条件渲染 |
| `useSync()` / `useRoute()` / `useLocal()` | 各处 — 访问 Context |

## 7.5 本章小结

`feature-plugins/` 是 TUI 的"内置应用"——通过插件 API 实现，但随 opencode 一起发布。侧边栏是最大的功能插件组，提供文件树、任务列表、LSP/MCP 状态、文件变更等视图。首页提示降低学习曲线，系统通知和 which-key 提升可发现性。这些功能的共同特点是：通过 `useSync()` 订阅 Worker 事件，通过 SolidJS 响应式系统自动更新 UI。
