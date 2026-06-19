# OpenCode 前端模块设计文档

## 1. 前端架构总览

```
                      ┌─────────────────────────────────────┐
                      │          User Interface              │
                      ├─────────────┬───────────┬────────────┤
                      │  Console    │   Web     │  Desktop   │
                      │  (TUI)      │  (SPA)    │ (Electron) │
                      └──────┬──────┴─────┬─────┴──────┬─────┘
                             │            │            │
                     TUI     │   HTTP     │   HTTP     │  IPC
                     Slots   │   SDK      │   SDK      │
                             ▼            ▼            ▼
                      ┌─────────────────────────────────────┐
                      │       @opencode-ai/app              │
                      │  (SolidJS Router + Providers)       │
                      ├─────────────────────────────────────┤
                      │       @opencode-ai/ui               │
                      │  (185+ SolidJS Components)          │
                      └─────────────────────────────────────┘
                                      │
                                      ▼
                             opencode Server
                             (Hono HTTP API)
```

---

## 2. @opencode-ai/ui — UI 组件库

### 2.1 包信息

- 路径：`packages/ui/`
- 组件数：185+ SolidJS 组件
- 样式方案：TailwindCSS 4
- 故事书：`packages/storybook/`

### 2.2 主要组件分类

| 分类 | 组件 | 说明 |
|------|------|------|
| 文件浏览 | FileExplorer, FileTree, FileIcon | 文件系统导航 |
| 代码编辑 | Editor, DiffViewer, CodeBlock | 代码展示与编辑 |
| 会话 | ChatPanel, MessageList, MessageInput | AI 对话界面 |
| 设置 | SettingsPanel, ConfigForm | 配置管理 |
| 通用 | Button, Input, Select, Modal, Tooltip | 基础 UI 原语 |
| 排版 | Markdown, MarkedRenderer | Markdown 渲染 |
| 通知 | Notification, Toast | 通知提示 |
| 布局 | Sidebar, Panel, SplitPane | 应用布局 |

---

## 3. @opencode-ai/app — Web 应用

### 3.1 应用启动与渲染时序

```
entry.tsx            AppBaseProviders          AppInterface          ConnectionGate          Router
  │                      │                        │                      │                    │
  │ mount(App)           │                        │                      │                    │
  │─────────────────────▶│                        │                      │                    │
  │                      │  MetaProvider           │                      │                    │
  │                      │  ThemeProvider          │                      │                    │
  │                      │  LanguageProvider       │                      │                    │
  │                      │  ErrorBoundary          │                      │                    │
  │                      │  QueryProvider          │                      │                    │
  │                      │  DialogProvider         │                      │                    │
  │                      │  MarkedProvider         │                      │                    │
  │                      │  FileComponentProvider  │                      │                    │
  │                      │───────────────────────▶│                      │                    │
  │                      │                        │  ServerProvider       │                    │
  │                      │                        │  healthCheck()        │                    │
  │                      │                        │──────────────────────▶│                    │
  │                      │                        │                      │  HTTP GET /health   │
  │                      │                        │                      │──────────────────▶  │
  │                      │                        │                      │◀── 200 OK ─────────  │
  │                      │                        │◀── healthy ──────────│                    │
  │                      │                        │                      │                    │
  │                      │                        │  GlobalSDKProvider    │                    │
  │                      │                        │  GlobalSyncProvider   │                    │
  │                      │                        │  Router (/)           │                    │
  │                      │                        │───────────────────────────────────────────▶│
  │                      │                        │                      │                    │
  │                      │                        │                      │  路由匹配            │
  │                      │                        │                      │  / → HomeRoute      │
  │                      │                        │                      │  /:dir/session/:id  │
  │                      │                        │                      │  → Session          │
  │                      │                        │                      │                    │
```

### 3.2 Provider 层级树

```
AppBaseProviders
├── MetaProvider                (SEO/head 元数据)
├── Font                        (字体加载)
├── ThemeProvider               (深色/浅色主题)
│   └── onThemeApplied → window.api.setTitlebar (桌面端)
├── LanguageProvider            (i18n 国际化)
│   └── UiI18nBridge            (UI 组件 i18n)
├── ErrorBoundary               (错误边界 → Sentry 上报)
├── QueryProvider               (@tanstack/solid-query)
├── DialogProvider              (对话框管理)
├── MarkedProvider              (Markdown 渲染)
└── FileComponentProvider       (文件组件 → @opencode-ai/ui/file)

AppInterface (within AppBaseProviders)
├── ServerProvider
│   └── ConnectionGate          (健康检查 → 重试循环)
│       └── ServerKey
│           ├── QueryProvider   (服务端查询)
│           ├── GlobalSDKProvider (open SDK 客户端)
│           │   └── GlobalSyncProvider (数据同步)
│           └── Router
│               └── RouterRoot
│                   └── AppShellProviders
│                       ├── SettingsProvider      (设置)
│                       ├── PermissionProvider    (权限)
│                       ├── LayoutProvider        (布局)
│                       ├── NotificationProvider  (通知)
│                       ├── ModelsProvider        (模型)
│                       ├── CommandProvider       (命令面板)
│                       └── ...
```

### 3.3 路由表

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | `HomeRoute` (懒加载) | 首页/项目列表 |
| `/:dir` | `DirectoryLayout` | 目录布局（侧边栏 + 内容） |
| `/:dir/session` | → 重定向到 `/:dir/session` | 新会话 |
| `/:dir/session/:id` | `Session` (懒加载) + `SessionProviders` | 会话页面 |

---

## 4. Console — TUI 应用

### 4.1 TUI 键盘事件→Agent→输出渲染时序

```
User Keypress         TUI (SolidJS)         TuiPluginApi          SessionProcessor        LLM
  │                      │                      │                      │                    │
  │ 键盘输入             │                      │                      │                    │
  │─────────────────────▶│                      │                      │                    │
  │                      │  keydown handler     │                      │                    │
  │                      │  (createSignal)      │                      │                    │
  │                      │                      │                      │                    │
  │                      │  dispatch action     │                      │                    │
  │                      │─────────────────────▶│                      │                    │
  │                      │                      │  session.prompt()    │                    │
  │                      │                      │─────────────────────▶│                    │
  │                      │                      │                      │  LLM.stream()      │
  │                      │                      │                      │──────────────────▶│
  │                      │                      │                      │                    │
  │                      │  state update        │                      │                    │
  │                      │  (solid reactivity)  │                      │                    │
  │                      │◀── stream ◀──────────│◀── stream ◀─────────│◀── textDelta ◀────│
  │                      │                      │                      │                    │
  │                      │  OpenTUI re-render   │                      │                    │
  │                      │  (增量更新)           │                      │                    │
  │◀── display ◀────────│                      │                      │                    │
```

### 4.2 TUI 布局

```
┌─────────────────────────────────────────────────────────────┐
│  Status Bar (directory, MCP status, version)                 │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                   │
│ Sidebar  │              Main Content                         │
│          │                                                   │
│ - Files  │  ┌─────────────────────────────────────────────┐  │
│ - Search │  │  Chat / Session Messages                     │  │
│ - MCP    │  │                                             │  │
│          │  │  User: 修复这个 bug                          │  │
│          │  │  ─────────────────────────────────────       │  │
│          │  │  Agent: 已找到问题...                        │  │
│          │  │  [正在应用修改...]                            │  │
│          │  │  [运行测试...] ✓ 通过                        │  │
│          │  │                                             │  │
│          │  └─────────────────────────────────────────────┘  │
│          │                                                   │
│          │  Input: > 输入消息...                              │
├──────────┴──────────────────────────────────────────────────┤
│  Footer (提示, 快捷按键)                                      │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 TUI 特性插槽系统

TUI 通过插槽机制实现可扩展性，插件可以注册到预定义插槽：

| 插槽 ID | 位置 | 内部插件 | 说明 |
|---------|------|----------|------|
| `home_footer` | 首页底部 | `home-footer.tsx` | 显示目录、MCP 状态、版本 |
| `sidebar_*` | 侧边栏 | 文件树、搜索、MCP | 侧边栏组件 |

---

## 5. Desktop — Electron 桌面应用

### 5.1 进程模型

```
┌───────────────┐         IPC          ┌──────────────────┐
│  Main Process │◄───────────────────►│  Renderer Process │
│               │   contextBridge      │                  │
│  - window mgmt│   (preload.ts)       │  - Web App UI    │
│  - Server     │                      │  - SolidJS       │
│  - Tray       │                      │  - TailwindCSS   │
│  - Auto-update│                      │                  │
│  - Menu       │                      │                  │
└───────┬───────┘                      └──────────────────┘
        │
        │  internal fetch
        ▼
┌───────────────┐
│  Hono Server  │
│  (in-process) │
└───────────────┘
```

### 5.2 Electron IPC 完整时序

```
Renderer             preload.ts              Main Process           Hono Server
  │                      │                       │                      │
  │  window.api          │                       │                      │
  │  .createSession()    │                       │                      │
  │─────────────────────▶│                       │                      │
  │                      │  ipcRenderer.invoke    │                      │
  │                      │  ('session:create')   │                      │
  │                      │──────────────────────▶│                      │
  │                      │                       │  Server.fetch()      │
  │                      │                       │  (内部 HTTP 调用)    │
  │                      │                       │─────────────────────▶│
  │                      │                       │                      │  Session.create()
  │                      │                       │                      │  → DB INSERT
  │                      │                       │◀── sessionID ◀──────│
  │                      │◀── result ◀──────────│                      │
  │◀── sessionID ◀──────│                       │                      │
```

---

## 6. Storybook

| 项目 | 说明 |
|------|------|
| 路径 | `packages/storybook/` |
| 用途 | UI 组件开发和视觉回归测试 |
| 启动 | `bun dev:storybook` |
| 覆盖 | @opencode-ai/ui 组件 |

---

## 7. 关键技术要点

### 7.1 响应式数据流

```
后端事件 (SSE/WebSocket)
       │
       ▼
  GlobalSyncProvider
  (@tanstack/solid-query)
       │
       ▼
  createQuery / createMutation
       │
       ▼
  SolidJS 响应式系统
  (createSignal, createMemo, createEffect)
       │
       ▼
  OpenTUI / DOM 增量更新
```

### 7.2 主题系统

- 支持深色/浅色主题切换
- `ThemeProvider` 提供全局主题上下文
- 桌面端通过 `onThemeApplied` 回调同步到 Electron 标题栏
- 基于 TailwindCSS 4 的 CSS 变量主题方案