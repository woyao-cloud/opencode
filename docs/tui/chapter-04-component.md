# 第 4 章 · 可复用组件层（component/）

## 4.1 目录概览

`component/` 包含 TUI 中可复用的 UI 组件——输入框、对话框、加载动画等。23 个 .tsx 文件（不含 prompt 子目录中的辅助文件）。

| 文件 | 功能 |
|------|------|
| `prompt/index.tsx` | **核心**：Prompt 输入框（~1500 行），submit → SDK → RPC 全流程 |
| `prompt/autocomplete.tsx` | @mention 自动补全（文件、Agent、命令） |
| `prompt/history.tsx` | 输入历史（↑↓ 浏览） |
| `prompt/stash.tsx` | 暂存输入内容（跨会话恢复） |
| `prompt/frecency.tsx` | 文件引用频率排序 |
| `prompt/traits.ts` | 输入模式检测（normal/shell/command） |
| `prompt/part.ts` | Part 类型辅助（文件引用标记） |
| `prompt/cwd.ts` | 当前工作目录显示 |
| `dialog-agent.tsx` | Agent 选择对话框 |
| `dialog-model.tsx` | Model 选择对话框 |
| `dialog-provider.tsx` | Provider 配置对话框 |
| `dialog-mcp.tsx` | MCP 服务器选择对话框 |
| `dialog-skill.tsx` | Skill 选择对话框 |
| `dialog-theme-list.tsx` | 主题选择对话框 |
| `dialog-variant.tsx` | Model Variant 选择 |
| `dialog-session-list.tsx` | 会话列表对话框 |
| `dialog-session-rename.tsx` | 会话重命名对话框 |
| `dialog-workspace-create.tsx` | Workspace 创建/选择对话框 |
| `dialog-status.tsx` | 状态查看对话框 |
| `dialog-tag.tsx` | 标签选择对话框 |
| `dialog-stash.tsx` | 暂存内容选择对话框 |
| `dialog-retry-action.tsx` | 重试操作对话框 |
| `dialog-console-org.tsx` | Console 组织选择对话框 |
| `dialog-session-delete-failed.tsx` | 删除失败提示对话框 |
| `dialog-workspace-file-changes.tsx` | Workspace 文件变更确认 |
| `dialog-workspace-unavailable.tsx` | Workspace 不可用提示 |
| `logo.tsx` | opencode Logo 动画 |
| `spinner.tsx` | 加载旋转动画 |
| `todo-item.tsx` | Todo 列表项组件 |
| `error-component.tsx` | 错误边界组件 |
| `startup-loading.tsx` | 启动加载画面 |
| `use-connected.tsx` | 连接状态 Hook |
| `bg-pulse.tsx` | 背景脉冲动画 |
| `border.tsx` | 边框渲染组件 |
| `plugin-route-missing.tsx` | 插件路由缺失提示 |
| `workspace-label.tsx` | Workspace 标签显示 |

## 4.2 事件流转

```text
用户键入文字 → Prompt 组件内部状态管理
    │
    │  按下 Enter
    ▼
submitInner()
  ├─ 验证输入
  ├─ 创建 Session (sdk.client.session.create)
  └─ 发送消息 (sdk.client.session.prompt)
      → RPC → Worker → Agent 引擎
                      │
                      │  Worker 产生事件 → 推送回主线程
                      ▼
              context/sync.tsx 更新 Store
                      │
                      ▼
              MessageTimeline 重渲染 (AI 逐字输出!)
              Footer 更新状态
              Sidebar 更新 Todo
```

## 4.3 关键文件详解

### prompt/index.tsx — Prompt 输入框（最核心的组件）

**功能**：TUI 中用户输入的主要界面。约 1500 行，涵盖输入处理、文件引用、斜杠命令、Shell 模式、IME 支持、编辑器上下文、粘贴处理等。

**自然语言解释**：Prompt 组件是用户与 opencode 交互的"第一触点"。它的核心流程是 `submit()` → `submitInner()`：
1. 防重复提交保护
2. IME 输入同步（处理韩文等组合字符）
3. 状态验证（禁用？为空？Agent 选定？）
4. 特殊命令识别（exit/quit/:q）
5. Session 创建或复用
6. 按模式分发：Shell 模式 → `sdk.client.session.shell()`，斜杠命令 → `sdk.client.session.command()`，普通文本 → `sdk.client.session.prompt()`
7. 清空输入框 + 导航到会话页面

Prompt 组件还管理 @mention 自动补全（输入 `@` 触发文件/Agent/命令建议）、输入历史（↑↓ 键浏览）、编辑器上下文（从外部编辑器同步光标位置）和暂存机制（切换会话时保留未发送的输入）。

### dialog-*.tsx — 对话框体系

**功能**：各种选择/配置对话框，基于 `ui/dialog.tsx` 的 DialogProvider 体系。

**自然语言解释**：TUI 中的对话框不是弹出窗口，而是覆盖在当前页面之上的全屏组件。用户按快捷键触发对话框（如 `Ctrl+P` 打开命令面板），对话框通过 `dialog.replace()` 渲染内容，用户选择后通过回调返回结果。常见的对话框包括：Agent 选择（切换 AI 角色）、Model 选择（切换 AI 模型）、主题选择（切换终端配色）、Session 列表（浏览历史会话）等。

### logo.tsx — Logo 动画

**功能**：opencode Logo 的终端 ASCII 动画效果。

**自然语言解释**：Logo 组件使用终端 ANSI 颜色码和逐帧动画技术，在终端中渲染 opencode 的 Logo。它支持"追踪"效果——Logo 线条带有发光的拖尾。这个纯视觉效果展示了 opencode TUI 对终端渲染能力的充分利用。

### todo-item.tsx — Todo 列表项

**功能**：侧边栏中 Todo 列表的单个项目渲染。

**自然语言解释**：当 AI 使用 TodoWrite 工具更新任务列表后，Worker 发布事件 → sync 更新 `todo[sessionID]` → 侧边栏通过 `For` 遍历渲染每个 `todo-item`。每个项目显示内容、状态图标（pending/in_progress/completed/cancelled）和优先级颜色。

## 4.4 涉及的 SolidJS 模式

| 模式 | 使用位置 |
|------|---------|
| `createStore` + `setStore` + `produce` | `prompt/index.tsx` — Prompt 内部状态管理 |
| `createSignal` | `prompt/index.tsx` — input 引用、动画状态 |
| `createMemo` | 各处 — 派生计算值 |
| `createEffect` | `prompt/index.tsx` — 副作用（同步 extmarks） |
| `onMount` / `onCleanup` | 各处 — 初始化和清理 |
| `Show` / `Switch` / `Match` | 各处 — 条件渲染 |
| `For` | `dialog-*.tsx` — 列表渲染 |
| `useSync()` / `useLocal()` / `useSDK()` | 各处 — 访问 Context |

## 4.5 本章小结

`component/` 是 TUI 的"肌肉"——用户直接交互的每一个界面元素都在这里。Prompt 输入框是最大最复杂的组件（~1500 行），它管理从键盘输入到 SDK 调用的完整流程。Dialog 体系提供了 15+ 种选择/配置界面，通过 `ui/dialog.tsx` 的 DialogProvider 统一管理。所有组件通过 Context 访问全局状态，通过 SolidJS 响应式系统自动更新。
