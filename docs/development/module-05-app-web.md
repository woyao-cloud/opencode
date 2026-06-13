# 模块 5 · Web 应用端

`packages/app` 是基于 SolidJS 的 Web 应用，提供会话管理、文件浏览、上下文监控等用户界面。

## 5.1 目录结构

```text
packages/app/src/
├── app.tsx              # 应用入口组件
├── index.tsx            # 渲染入口
├── components/          # UI 组件
│   ├── prompt-input/    # Prompt 输入框组件群
│   ├── session/         # 会话相关组件（时间线、上下文用量、消息展示）
│   ├── file-tree.tsx    # 文件树组件
│   ├── dialog-fork.tsx  # Fork 对话框
│   └── ...
├── context/             # SolidJS Context（状态管理）
│   ├── prompt.tsx        # Prompt 输入状态
│   ├── sync.tsx          # 数据同步状态
│   ├── file.tsx          # 文件状态
│   ├── layout.tsx        # 布局状态
│   ├── language.tsx      # 国际化状态
│   └── global-sync/      # 全局同步（Session 缓存等）
├── hooks/               # 自定义 Hooks
│   ├── use-providers.ts  # Provider 列表 Hook
│   └── ...
├── pages/               # 页面组件
│   ├── session/          # 会话页面（核心页面）
│   │   ├── index.tsx     # 会话页面入口
│   │   ├── message-timeline.tsx  # 消息时间线
│   │   ├── session-layout.tsx    # 会话布局
│   │   └── helpers.ts    # 会话辅助函数
│   └── layout/           # 全局布局（侧边栏等）
├── utils/               # 工具函数
│   ├── persist.ts        # 持久化机制
│   └── ...
├── i18n/                # 国际化翻译文件
├── constants/           # 常量定义
└── addons/              # 插件/扩展
```

## 5.2 技术栈

- **SolidJS**：细粒度响应式 UI 框架
- **@opencode-ai/ui**：共享 UI 组件库（Button、Tooltip、Dialog、ProgressCircle 等）
- **@opencode-ai/sdk**：SDK 客户端（用于与后端通信）
- **@opencode-ai/core**：共享基础类型

## 5.3 核心页面：会话页面

会话页面（`pages/session/`）是 Web 应用的核心，包含：

### 消息时间线（`message-timeline.tsx`）

展示会话中的消息流。每条消息显示：
- 用户消息：文本 + 文件引用
- AI 消息：文本 + 工具调用状态 + Token 消耗
- 压缩标记

### 上下文用量（`session-context-usage.tsx`）

以进度环形式展示当前上下文占模型最大窗口的百分比。点击可打开详细的上下文分析面板。

### 上下文分析（`session-context-breakdown.ts`）

将上下文按来源分类（system/user/assistant/tool）并估算各部分的 Token 占比。

### 上下文指标（`session-context-metrics.ts`）

计算会话的总成本、Token 消耗和上下文使用率。

## 5.4 状态管理（Context 体系）

Web 应用使用 SolidJS Context 进行状态管理：

| Context | 文件 | 管理状态 |
|---------|------|---------|
| `PromptContext` | `context/prompt.tsx` | 当前 Prompt 输入内容、文件引用、Agent 选择 |
| `SyncContext` | `context/sync.tsx` | 与后端的数据同步状态 |
| `FileContext` | `context/file.tsx` | 文件树、当前打开文件 |
| `LayoutContext` | `context/layout.tsx` | UI 布局状态（侧边栏、面板） |
| `LanguageContext` | `context/language.tsx` | 国际化语言选择 |

## 5.5 持久化机制（`utils/persist.ts`）

Web 应用使用 `localStorage` 进行状态持久化：

- **Global 级别**：全局 UI 偏好（主题、语言）
- **Workspace 级别**：项目级别的 UI 状态（侧边栏宽度、面板开关）
- **Session 级别**：会话级别的 UI 状态（当前 Tab、滚动位置）

持久化键名格式：`workspace:<dir-hash>:<key>` 或 `session:<session-id>:<key>`。

## 5.6 Prompt 输入组件群

`components/prompt-input/` 包含 Prompt 输入框的完整组件群：

| 组件 | 功能 |
|------|------|
| `index.tsx` | Prompt 输入框主组件 |
| `context-items.tsx` | 文件引用标签展示 |
| `submit.ts` | 提交逻辑 |
| `history.ts` | 输入历史 |
| `build-request-parts.ts` | 构建请求 Part |

## 5.7 路由结构

Web 应用的路由由文件系统路径决定：
- `/` → 首页/会话列表
- `/<session-id>` → 会话页面
- `/settings` → 设置页面

---

## 本章小结

`packages/app` 是基于 SolidJS 的 Web 应用，核心是会话页面（消息时间线 + 上下文用量 + 文件树）。状态管理使用 SolidJS Context 体系，持久化使用 localStorage 的分层键名机制。修改 Web 端 UI 时，主要工作在 `components/` 和 `pages/session/` 目录下。
