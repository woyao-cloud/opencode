# OpenCode UI 与应用层模块设计文档

## 1. Web UI 应用（@opencode-ai/app）

### 1.1 应用启动与渲染时序

```
entry.tsx           AppBaseProviders        AppInterface         ConnectionGate        Router
   │                    │                      │                     │                  │
   │ mount(App)         │                      │                     │                  │
   │───────────────────▶│                      │                     │                  │
   │                    │  MetaProvider         │                     │                  │
   │                    │  ThemeProvider         │                    │                  │
   │                    │  LanguageProvider      │                    │                  │
   │                    │  ErrorBoundary         │                    │                  │
   │                    │  QueryProvider         │                    │                  │
   │                    │  DialogProvider        │                    │                  │
   │                    │  MarkedProvider        │                    │                  │
   │                    │  FileComponentProvider  │                   │                  │
   │                    │──────────────────────▶│                    │                  │
   │                    │                       │  ServerProvider     │                  │
   │                    │                       │  healthCheck()      │                  │
   │                    │                       │────────────────────▶│                  │
   │                    │                       │                    │  HTTP GET /health  │
   │                    │                       │                    │──────────────────▶│
   │                    │                       │                    │◀── 200 OK ───────│
   │                    │                       │◀── healthy ────────│                  │
   │                    │                       │                    │                  │
   │                    │                       │  GlobalSDKProvider  │                  │
   │                    │                       │  GlobalSyncProvider │                  │
   │                    │                       │  Router (/)         │                  │
   │                    │                       │───────────────────────────────────────▶│
   │                    │                       │                    │                  │
   │                    │                       │                    │  路由匹配         │
   │                    │                       │                    │  / → HomeRoute   │
   │                    │                       │                    │  /:dir/session   │
   │                    │                       │                    │  /:dir/session/:id│
   │                    │                       │                    │                  │
```

### 1.2 路由结构

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | `HomeRoute`（懒加载） | 首页/项目列表 |
| `/:dir` | `DirectoryLayout` | 目录布局（侧边栏+内容） |
| `/:dir/session` | `SessionIndexRoute → Navigate to /:dir/session` | 新会话重定向 |
| `/:dir/session/:id` | `Session`（懒加载）+ `SessionProviders` | 会话页面 |

### 1.3 Provider 层级（app.tsx）

```
AppBaseProviders
├── MetaProvider
├── Font
├── ThemeProvider (onThemeApplied → window.api.setTitlebar)
├── LanguageProvider
│   └── UiI18nBridge
├── ErrorBoundary (→ Sentry)
├── QueryProvider (@tanstack/solid-query)
├── DialogProvider
├── MarkedProvider
└── FileComponentProvider (→ @opencode-ai/ui/file)

AppInterface (within AppBaseProviders)
├── ServerProvider
│   └── ConnectionGate (health check → retry loop)
│       └── ServerKey
│           ├── QueryProvider
│           ├── GlobalSDKProvider
│           │   └── GlobalSyncProvider
│           └── Router
│               └── RouterRoot
│                   └── AppShellProviders
│                       ├── SettingsProvider
│                       ├── PermissionProvider
│                       ├── LayoutProvider
│                       ├── NotificationProvider
│                       ├── ModelsProvider
│                       ├── CommandProvider
│                       ├── HighlightsProvider
│                       └── Layout (shell layout)

SessionProviders (within session page)
├── TerminalProvider
├── FileProvider
├── PromptProvider
└── CommentsProvider
```

### 1.4 核心 Context

| Context | 文件 | 用途 |
|---------|------|------|
| `ServerProvider` | `context/server.ts` | 连接管理、服务器切换、健康检查 |
| `GlobalSDKProvider` | `context/global-sdk.ts` | SDK 客户端实例 |
| `GlobalSyncProvider` | `context/global-sync.ts` | 全局同步 |
| `SettingsProvider` | `context/settings.ts` | 设置管理 |
| `PermissionProvider` | `context/permission.ts` | 权限对话框 |
| `ModelsProvider` | `context/models.ts` | 模型列表 |
| `CommandProvider` | `context/command.ts` | 命令面板 |
| `LayoutProvider` | `context/layout.ts` | 布局状态 |
| `TerminalProvider` | `context/terminal.ts` | 终端集成 |
| `FileProvider` | `context/file.ts` | 文件操作 |
| `PromptProvider` | `context/prompt.ts` | 提示管理 |
| `LanguageProvider` | `context/language.ts` | 国际化 |

---

## 2. UI 组件库（@opencode-ai/ui）

### 2.1 组件分类（185+ 组件）

| 类别 | 组件 |
|------|------|
| 基础 | `button`, `card`, `checkbox`, `switch`, `tag`, `text-field`, `radio-group`, `select`, `tabs` |
| 导航 | `accordion`, `tabs`, `list`, `file-icons`, `file`, `dock` |
| 会话 | `session-diff`, `session-review`, `session-turn`, `message-nav`, `message-part`, `shell-submessage` |
| 对话框 | `dialog`, `popover`, `hover-card`, `context-menu`, `dropdown-menu`, `collapsible` |
| 文本 | `markdown`, `text-reveal`, `typewriter`, `inline-input`, `line-comment` |
| 视觉 | `icon`, `logo`, `avatar`, `spinner`, `progress`, `image-preview`, `resize-handle` |
| 布局 | `scroll-view`, `dock`, `resize-handle` |
| 工具 | `keybind`, `toast`, `tooltip`, `font` |
| 差异 | `diff-changes` |
| 特定 | `provider-icon`, `file`, `spinner` |

### 2.2 主题系统

```
ThemeProvider (@opencode-ai/ui/theme/context)
├── 模式: light / dark
├── 通过 CSS 变量实现（Tailwind CSS）
├── onThemeApplied 回调（Desktop 通知标题栏）
└── 持久化到 localStorage
```

### 2.3 国际化

```
I18nProvider (@opencode-ai/ui/context)
├── locale (intl 格式化)
├── t (翻译函数)
├── 18+ 语言（web 站点）
└── 与 app/context/language.ts 桥接
```

---

## 3. Desktop 应用（@opencode-ai/desktop）

### 3.1 架构时序

```
Electron Main Process         Preload (contextBridge)       Renderer Process (SolidJS)
       │                              │                            │
       │  BrowserWindow.loadURL()      │                            │
       │───────────────────────────────────────────────────────────▶│
       │                              │                            │
       │  IPC: menu-click             │                            │
       │─────────────────────────────▶│                            │
       │                              │  window.api.onMenuClick()  │
       │                              │───────────────────────────▶│
       │                              │                            │
       │                              │  window.api.setTitlebar()  │
       │                              │◀───────────────────────────│
       │◀── IPC: set-titlebar ───────│                            │
       │                              │                            │
       │  Sidecar Server (子进程)     │                            │
       │  http://localhost:PORT       │                            │
       │  + SDK Client ──────────────────────────────────────────▶│
       │                              │                            │
       │  Updater (electron-updater)  │                            │
       │  Store (electron-store)      │                            │
```

### 3.2 主进程模块

| 模块 | 文件 (`src/main/`) | 职责 |
|------|--------------------|------|
| `index.ts` | 入口 | 应用生命周期、窗口创建 |
| `apps.ts` | 应用注册 | 文件关联、URL 协议 |
| `ipc.ts` | IPC 处理 | 渲染进程 ↔ 主进程通信 |
| `menu.ts` | 菜单 | 原生菜单栏 |
| `windows.ts` | 窗口管理 | 窗口创建、配置、焦点 |
| `updater.ts` | 自动更新 | electron-updater |
| `server.ts` | Sidecar | 内嵌 HTTP 服务器 |
| `sidecar.ts` | Sidecar 进程 | 子进程管理 |
| `shell-env.ts` | Shell 环境 | 环境变量收集 |
| `markdown.ts` | Markdown | 文件协议处理器 |
| `migrate.ts` | 迁移 | 数据迁移 |
| `store.ts` | 持久化 | electron-store |

### 3.3 渲染进程

| 模块 | 文件 (`src/renderer/`) | 职责 |
|------|------------------------|------|
| `index.tsx` | 入口 | SolidJS 挂载 |
| `App.tsx` | 根组件 | 包裹 AppInterface |
| `cli.ts` | CLI | 桌面 CLI 集成 |
| `updater.tsx` | 更新 UI | 更新进度对话框 |
| `i18n.ts` | 国际化 | 系统语言检测 |
| `webview-zoom.ts` | WebView 缩放 | 缩放控制 |

---

## 4. SDK 通信协议（@opencode-ai/sdk）

### 4.1 客户端 - 服务器交互时序

```
SDK Client                         opencode Server                    SQLite
   │                                     │                             │
   │  POST /v2/session/create             │                             │
   │────────────────────────────────────▶│                             │
   │                                     │  Session.create()           │
   │                                     │────────────────────────────▶│
   │                                     │◀── session Info ───────────│
   │◀── 201 { session } ────────────────│                             │
   │                                     │                             │
   │  POST /v2/session/:id/message       │                             │
   │  { content, files }                │                              │
   │────────────────────────────────────▶│                             │
   │                                     │  SessionProcessor.process() │
   │                                     │  ┌── LLM stream ──┐        │
   │◀── SSE: event: text-delta ──────────│──┤ tool-call      │        │
   │◀── SSE: event: tool-call ───────────│──┤ follow-up      │        │
   │◀── SSE: event: tool-result ────────│──┤ finish         │        │
   │◀── SSE: event: finish ─────────────│──┘                │        │
   │                                     │                             │
```

### 4.2 API 版本

- **v1**: `src/client.ts` / `src/server.ts` — 原始 SDK
- **v2**: `src/v2/` — 从 OpenAPI 规范 (`.json`) 自动生成，基于 hey-api/openapi-ts
  - `src/v2/client.ts` — 类型安全客户端
  - `src/v2/server.ts` — 服务器端实现
  - `src/v2/data.ts` — 数据模型

### 4.3 创建方式

```typescript
const { server, client } = createOpencode({
  url: "http://localhost:PORT",
  // 自动创建 server + client
})
```

---

## 5. Console 云控制台

### 5.1 应用架构

```
console-app (SolidJS Start + Nitro)
├── src/routes/         — 页面路由（SolidJS Router）
├── src/component/      — 业务组件
├── src/context/        — React Contexts
├── src/lib/            — 工具库
├── src/i18n/           — 国际化
└── src/asset/          — 静态资源

console-core (Drizzle + Stripe + Postgres)
├── schema/             — 数据库 Schema（Drizzle）
├── account.ts          — 账户管理
├── actor.ts            — Actor 模式
├── billing.ts          — Stripe 订阅/计费
├── subscription.ts     — 订阅管理
├── workspace.ts        — 工作区管理
├── user.ts             — 用户管理
├── model.ts            — 模型管理
├── provider.ts         — 提供商管理
├── identifier.ts       — ID 生成
├── key.ts              — API Key 管理
└── util/               — 工具函数
```

### 5.2 部署架构

```
浏览器
  │
  v
Cloudflare CDN
  │
  ├── console-app (SolidJS Start SSR + Nitro)
  │     ├── 首次请求: SSR 渲染 HTML
  │     ├── 后续导航: SPA 客户端路由
  │     └── API 路由: Hono 处理器
  │
  ├── console-function (Cloudflare Worker)
  │     ├── AI SDK 代理（Anthropic/OpenAI）
  │     └── 认证（@openauthjs/openauth）
  │
  └── console-core
        ├── Drizzle ORM → Postgres/PlanetScale
        ├── Stripe 计费
        └── 邮件（console-mail）
```

### 5.3 资源抽象层

`console-resource` 通过条件导出实现跨平台：

```
// resource.cloudflare.ts — Cloudflare Workers
// resource.node.ts — Node.js 环境
```

---

## 6. Enterprise 企业部署

### 6.1 架构

```
Enterprise (SolidJS Start + Nitro + Hono)
├── src/entry-client.tsx — 浏览器端入口
├── src/entry-server.tsx — SSR 入口
├── src/routes/          — API 和页面路由
├── src/core/            — 核心逻辑
│   ├── share.ts         — 分享功能
│   └── storage.ts       — 存储抽象
├── src/app.tsx          — 应用 Shell
└── 构建目标: Cloudflare Workers / Node.js

依赖:
├── @opencode-ai/core    — 核心数据模型
└── @opencode-ai/ui      — UI 组件
```

### 6.2 渲染策略

```
        首次访问                    后续导航
    ┌──────────────┐          ┌──────────────┐
    │  SSR 渲染     │          │  SPA 客户端   │
    │  Nitro 生成   │          │  SolidJS     │
    │  HTML 返回     │          │  客户端路由   │
    └──────────────┘          └──────────────┘
```

---

## 7. Web 营销站（@opencode-ai/web）

### 7.1 架构

```
Astro 5.x + Starlight
├── src/pages/          — Astro 页面
├── src/content/docs/   — 文档内容（Markdown）
├── src/components/     — Astro/React/Solid 组件
├── src/i18n/           — 国际化（18+ 语言）
└── src/middleware.ts   — 请求中间件

依赖:
└── opencode (主包) — 版本信息
```

部署：Astro build → Cloudflare Workers / Node.js

---

## 8. Slack 集成

```
Slack Workspace
  │
  ├── 用户发消息 @opencode-bot
  │     │
  │     v
  │   @slack/bolt 处理事件
  │     │
  │     v
  │   @opencode-ai/sdk → opencode serve
  │     │
  │     v
  │   LLM 处理 → 回复到 Slack
  │
  └── 交互式组件（按钮、模态框）
```

---

## 9. 关键文件索引

| 功能 | 文件 | 关键行 |
|------|------|--------|
| App 入口 | `app/src/entry.tsx` | SolidJS mount |
| App 路由 & Provider | `app/src/app.tsx` | 130-330 |
| App 页面 | `app/src/pages/` | Home, Session, Layout |
| UI 组件 | `ui/src/` | 185+ 组件 |
| Desktop 主进程 | `desktop/src/main/index.ts` | Electron app |
| Desktop 预加载 | `desktop/src/preload/index.ts` | IPC bridge |
| SDK 入口 | `sdk/js/src/index.ts` | createOpencode |
| SDK v2 客户端 | `sdk/js/src/v2/client.ts` | 类型安全客户端 |
| Console App 入口 | `console/app/src/ | SolidJS Start |
| Console Core 计费 | `console/core/billing.ts` | Stripe 集成 |
| Enterprise App | `enterprise/src/app.tsx` | SSR Shell |
| Web 站点 | `web/src/` | Astro + Starlight |
| Slack App | `slack/src/index.ts` | @slack/bolt |