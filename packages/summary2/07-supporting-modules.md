# OpenCode 支持模块设计文档

## 1. 概述

本章覆盖辅助性包，不直接参与核心 AI 交互，但提供关键的平台集成、扩展和部署能力。

---

## 2. packages/desktop — Electron 桌面应用

### 2.1 包信息

| 属性 | 值 |
|------|-----|
| 包名 | `@opencode-ai/desktop` |
| 路径 | `packages/desktop/` |
| 技术栈 | Electron + Vite |

### 2.2 进程架构

```
┌─────────────────────────────────────────────────────┐
│                   Main Process                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Window      │  │ Hono Server  │  │ Tray/Menu  │  │
│  │ Management  │  │ (in-process) │  │ Management │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────┘  │
│         │                │                            │
│         │        ipcMain.handle                      │
│         │                │                            │
│         └────────────────┴────────────────────────────┘
│                          │
│                     preload.ts                        │
│                   (contextBridge)                     │
│                          │                            │
│                          │  window.api.*              │
│                          │                            │
│                          ▼                            │
│                  Renderer Process                     │
│              (Embedded Web App)                       │
│              SolidJS + TailwindCSS                    │
└─────────────────────────────────────────────────────┘
```

### 2.3 Electron IPC 完整时序

```
Renderer (Web App)      preload.ts (contextBridge)     Main Process (ipcMain)     Hono Server
     │                         │                            │                        │
     │  window.api             │                            │                        │
     │  .openDirectory()       │                            │                        │
     │────────────────────────▶│                            │                        │
     │                         │  ipcRenderer.invoke(       │                        │
     │                         │    'dialog:openDirectory') │                        │
     │                         │───────────────────────────▶│                        │
     │                         │                            │  dialog.showOpenDialog │
     │                         │                            │  (原生系统对话框)       │
     │                         │                            │                        │
     │                         │◀── directory path ◀───────│                        │
     │◀── path ◀──────────────│                            │                        │
     │                         │                            │                        │
     │  SDK client             │                            │                        │
     │  .session.create()      │                            │                        │
     │────────────────────────▶│                            │                        │
     │                         │  ipcRenderer.invoke(       │                        │
     │                         │    'server:fetch',         │                        │
     │                         │    '/v2/sessions', ...)   │                        │
     │                         │───────────────────────────▶│                        │
     │                         │                            │  Server.fetch()        │
     │                         │                            │───────────────────────▶│
     │                         │                            │                        │  Session.create()
     │                         │                            │                        │  → DB
     │                         │                            │◀── sessionID ◀────────│
     │                         │◀── result ◀────────────────│                        │
     │◀── sessionID ◀─────────│                            │                        │
```

---

## 3. packages/plugin — 插件 SDK

### 3.1 包信息

| 属性 | 值 |
|------|-----|
| 包名 | `@opencode-ai/plugin` |
| 路径 | `packages/plugin/` |
| 用途 | 定义插件 API 类型和接口 |

### 3.2 插件生命周期

```
User/CLI              Plugin Manager            NPM/File Resolver        Plugin Instance        opencode Service
  │                        │                         │                       │                      │
  │  plugin install <pkg>  │                         │                       │                      │
  │────────────────────────▶│                         │                       │                      │
  │                        │  npm install /           │                       │                      │
  │                        │  本地文件加载             │                       │                      │
  │                        │────────────────────────▶│                       │                      │
  │                        │                         │  下载/复制到 plugin 目录│                     │
  │                        │◀── installed ◀──────────│                       │                      │
  │                        │                         │                       │                      │
  │                        │  resolve()               │                       │                      │
  │                        │  (解析包入口和元数据)     │                       │                      │
  │                        │────────────────────────▶│                       │                      │
  │                        │◀── entry ◀──────────────│                       │                      │
  │                        │                         │                       │                      │
  │  app 启动 / 重载       │                         │                       │                      │
  │                        │  load()                  │                       │                      │
  │                        │────────────────────────────────────────────────▶│                      │
  │                        │                         │                       │  import(entry)       │
  │                        │                         │                       │  (动态导入)          │
  │                        │                         │                       │                      │
  │                        │                         │                       │  plugin.tui(api)     │
  │                        │                         │                       │  → register slots   │
  │                        │                         │                       │                      │
  │                        │◀── activated ◀──────────│───────────────────────│                      │
  │◀── done ◀─────────────│                         │                       │                      │
```

### 3.3 插件 API 类型

```typescript
// TUI 插件接口
interface TuiPlugin {
  (api: TuiPluginApi): void | Promise<void>
}

// TUI 插件 API (提供给插件使用的上下文)
interface TuiPluginApi {
  app: { version: string }
  theme: { current: Theme; set: (theme: Theme) => void }
  state: { path: { directory: string }; vcs?: { branch: string }; mcp: () => McpStatus[] }
  slots: {
    register: (slot: SlotRegistration) => void
  }
  command: {
    register: (command: CommandRegistration) => void
  }
}

// 插槽注册
interface SlotRegistration {
  order: number
  slots: Record<string, () => JSX.Element>
}
```

---

## 4. packages/sdk — 外部 SDK

### 4.1 包信息

| 属性 | 值 |
|------|-----|
| 包名 | `@opencode-ai/sdk` |
| 路径 | `packages/sdk/js/` |
| 生成方式 | OpenAPI → @hey-api/openapi-ts 自动生成 |
| 用途 | 提供给外部使用的 API 客户端 |

### 4.2 SDK 客户端使用流

```
External App              SDK Client                  opencode Server (Hono)    Service Layer
     │                        │                               │                     │
     │  createOpencodeClient  │                               │                     │
     │  ({ baseUrl })         │                               │                     │
     │───────────────────────▶│                               │                     │
     │                        │  创建 HTTP 客户端              │                     │
     │                        │  (fetch wrapper)              │                     │
     │◀── client ◀───────────│                               │                     │
     │                        │                               │                     │
     │  client.session        │                               │                     │
     │  .create({title})      │                               │                     │
     │───────────────────────▶│  POST /v2/sessions            │                     │
     │                        │──────────────────────────────▶│                     │
     │                        │                               │  Session.create()   │
     │                        │                               │────────────────────▶│
     │                        │                               │◀── session ◀───────│
     │                        │◀── 201 { id, title } ◀───────│                     │
     │◀── session ◀──────────│                               │                     │
     │                        │                               │                     │
     │  client.session        │                               │                     │
     │  .prompt({             │                               │                     │
     │    sessionID,          │                               │                     │
     │    message })          │                               │                     │
     │───────────────────────▶│  POST /v2/sessions/:id/prompt │                     │
     │                        │──────────────────────────────▶│                     │
     │                        │                               │  SessionProcessor   │
     │                        │                               │  .handle()          │
     │                        │◀── SSE stream ◀──────────────│── LLM → Tool → ...  │
     │◀── stream ◀───────────│                               │                     │
```

### 4.3 SDK 模块结构

```
OpencodeClient
├── config     — Config API (get/set)
├── session    — Session API (create/get/list/prompt/fork/delete/share)
├── provider   — Provider API (list/configure)
├── path       — Path API (get directory)
├── event      — Event API (subscribe)
└── utils      — 工具函数和类型
```

---

## 5. packages/enterprise — 企业版功能

| 特性 | 说明 |
|------|------|
| SSO 认证 | SAML / OIDC 单点登录 |
| 审计日志 | 操作审计和日志导出 |
| 团队管理 | 多用户协作和权限管理 |
| 分享 URL | 会话安全分享 |
| 部署模式 | 服务端多租户部署 |

---

## 6. packages/identity — 身份认证

| 特性 | 说明 |
|------|------|
| OAuth 提供商 | GitHub、Google、GitLab |
| OpenAuth | `@openauthjs/openauth` 集成 |
| 会话管理 | JWT token 管理 |
| 多因子认证 | MFA 支持 |

---

## 7. packages/slack — Slack 集成

| 特性 | 说明 |
|------|------|
| Slack Bot | 在 Slack 中直接与 AI 对话 |
| 斜杠命令 | `/opencode` 命令触发 |
| 消息格式 | Slack Block Kit 消息格式化 |
| 频道通知 | 自动发送通知到指定频道 |

---

## 8. packages/http-recorder — HTTP 记录器

| 特性 | 说明 |
|------|------|
| 请求录制 | HTTP 请求/响应录制 |
| 回放 | 录制内容回放调试 |
| 过滤 | 按 URL/方法/状态码过滤 |

---

## 9. 其他辅助包

| 包 | 路径 | 用途 |
|----|------|------|
| `@opencode-ai/script` | `packages/script/` | 构建和部署脚本 |
| `@opencode-ai/extensions` | `packages/extensions/` | 扩展系统 |
| `@opencode-ai/containers` | `packages/containers/` | Docker 容器支持 |
| `@opencode-ai/docs` | `packages/docs/` | 文档内容 |
| `@opencode-ai/storybook` | `packages/storybook/` | Storybook 配置 |