# OpenCode 架构文档

## 1. 总体分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      Presentation Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  CLI / TUI    │  │  Web (App)   │  │  Desktop (Electron)  │   │
│  │  (SolidJS)    │  │  (SolidJS)   │  │  Main→Preload→Render│   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │                │
│  ┌──────┴─────────────────┴──────────────────────┴───────────┐   │
│  │                    @opencode-ai/ui                         │   │
│  │          185+ SolidJS 组件 + TailwindCSS + Storybook       │   │
│  └───────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                      Application Layer                           │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  @opencode-ai/app                                        │    │
│  │  Router: SolidJS Router → Routes: /, /:dir, /session/:id │    │
│  │  Context: Server, GlobalSDK, Settings, Permission, ...   │    │
│  │  State: @tanstack/solid-query, createStore                │    │
│  └──────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                      Service Layer (opencode)                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Session  │  Agent  │  Tool  │  Plugin  │  Config        │    │
│  ├──────────────────────────────────────────────────────────┤    │
│  │  Provider │  Auth   │  Bus   │  Storage │  Permission    │    │
│  ├──────────────────────────────────────────────────────────┤    │
│  │  Git      │  MCP    │  LSP   │  Shell   │  Snapshot     │    │
│  ├──────────────────────────────────────────────────────────┤    │
│  │  Sync     │  Project│  Server│  Skill   │  Background   │    │
│  └──────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                      Core / LLM Layer                            │
│  ┌──────────────────────────┐  ┌─────────────────────────────┐   │
│  │  @opencode-ai/core       │  │  @opencode-ai/llm            │   │
│  │  - 数据模型 (Schema)      │  │  - Route/Protocol/Endpoint   │   │
│  │  - 事件系统               │  │  - Auth/Framing/Transport    │   │
│  │  - 工具函数               │  │  - Tool/ToolRuntime          │   │
│  │  - AI SDK 提供商集成      │  │  - 缓存策略                  │   │
│  └──────────────────────────┘  └─────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                      Data / Infrastructure Layer                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐  │
│  │ SQLite   │ │ AI SDK   │ │ File     │ │ HTTP Server        │  │
│  │ (Drizzle)│ │ (20+     │ │ System   │ │ (Hono/Express)     │  │
│  │          │ │ 提供商)  │ │          │ │                    │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 包依赖拓扑图

```
                         ┌─────────────────────┐
                         │  @opencode-ai/llm    │
                         │  (LLM 抽象层)        │
                         └──────────┬──────────┘
                                    │ dev depends
                                    v
                         ┌─────────────────────┐
                         │ @opencode-ai/http-   │
                         │ recorder (测试用)     │
                         └─────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                        @opencode-ai/core                            │
│  (共享后端核心: 数据模型、事件系统、AI SDK 提供商集成、文件系统)     │
└────────────────────────────────────────────────────────────────────┘
         ▲                      ▲                      ▲
         │                      │                      │
┌────────┴────────┐   ┌────────┴────────┐   ┌─────────┴──────────┐
│ @opencode-ai/ui │   │ @opencode-ai/   │   │  @opencode-ai/     │
│ (SolidJS 组件)   │   │ sdk (客户端/     │   │  enterprise        │
│  ┌───────────┐  │   │ 服务器)          │   │  (SSR 部署)        │
│  │ core      │  │   └─────────────────┘   └────────────────────┘
│  └───────────┘  │
└────────┬────────┘
         │
         ┌──────────────────────────────────┐
         │         opencode (主包)           │
         │  (CLI/TUI + 服务层 + 编排引擎)    │
         │  depends: plugin + script + sdk  │
         │           + ui + core             │
         └──────┬──────────┬──────────┬─────┘
                │          │          │
                v          v          v
    ┌──────────┐ ┌───────┐ ┌─────────┐
    │ @opencode │ │ @open │ │ @opencode│
    │ -ai/app   │ │ code- │ │ -ai/web  │
    │ (Web UI)  │ │ ai/   │ │ (营销站) │
    │ +code+sdk │ │ slack │ │ +opencode│
    │ +ui+core  │ │ +sdk  │ └─────────┘
    └─────┬─────┘ └───────┘
          │
    ┌─────┴──────┐
    │ @opencode-ai│
    │ desktop    │
    │ +app+ui    │
    └────────────┘

┌──────────────────────────────────────────────────────────────────┐
│   Console Cloud (SaaS)                                            │
│   ┌─────────────┐   ┌─────────────┐   ┌───────────────────────┐ │
│   │ console-app  │   │ console-    │   │ console-function      │ │
│   │ (SolidJS     │←──│ core        │←──│ (Cloudflare Worker)   │ │
│   │  Start/Nitro)│   │ (DB/计费)   │   │                       │ │
│   │  +console-core   │ +mail+res   │   │ +core+res             │ │
│   │  +console-mail   └──────┬──────┘   └───────────────────────┘ │
│   │  +console-resource      │                                    │
│   │  +ui                    v                                    │
│   └──────────────────  ┌──────────┐                              │
│                        │ console-  │                             │
│                        │ mail      │                             │
│                        │ (Email    │                             │
│                        │  Templates)                             │
│                        └──────────┘                              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. 部署架构

### 3.1 CLI 部署
```
用户终端
  │
  v
opencode run ───→ SQLite 数据库 ←──→ 本地文件系统
  │                                       │
  ├──→ AI Provider API (HTTP)              └──→ .opencode/ 配置/计划/快照
  ├──→ MCP 服务器 (stdio/HTTP)
  └──→ LSP 服务器 (stdio)
```

### 3.2 Web 部署
```
浏览器 (SolidJS SPA) ──→ opencode serve (HTTP API) ──→ SQLite
                              │
                     AI Provider API
```

### 3.3 Desktop 部署
```
Electron 主进程
  ├──→ 渲染进程 (SolidJS SPA via file://)
  ├──→ Sidecar Server (http://localhost:PORT)
  ├──→ IPC Bridge (contextBridge + preload)
  └──→ 系统菜单/托盘/更新器
```

### 3.4 Enterprise 部署
```
Cloudflare Worker
  │
  ├──→ Hono API Server
  ├──→ SolidJS Start SSR (Nitro)
  └──→ Cloudflare KV / D1 / R2

客户端浏览器 ←──→ Cloudflare CDN
```

### 3.5 Console 部署
```
Cloudflare
  ├──→ console-function (Worker) ──→ AI Provider API
  ├──→ console-app (SolidJS Start SSR)
  │       └──→ Stripe, Postgres/PlanetScale
  └──→ console-core (Drizzle Schema + Billing)
```

### 3.6 Slack 集成
```
Slack API → @slack/bolt → SDK Client → opencode serve (HTTP)
```

---

## 4. 关键技术选型

| 层次 | 技术 | 用途 |
|------|------|------|
| 运行时 | Bun 1.3.14 | JavaScript/TypeScript 运行时 |
| 语言 | TypeScript (strict) | 类型安全 |
| 编译 | tsgo (Bun native preview) | TypeScript 编译 |
| 函数式 | Effect v4 beta | 并发、错误处理、依赖注入 |
| UI 框架 | SolidJS 1.9.10 | 响应式 UI |
| CLI 框架 | yargs | 命令行参数解析 |
| 组件库 | @kobalte/core | 无障碍 UI 原语 |
| CSS | Tailwind CSS | 样式 |
| ORM | Drizzle ORM | SQLite/Postgres 数据库 |
| LLM SDK | Vercel AI SDK (@ai-sdk/*) | LLM 提供商统一接口 |
| 构建 | Turbo 2.8.13 | Monorepo 构建编排 |
| HTTP 服务 | Hono | 轻量 HTTP 框架 |
| 流式渲染 | marked + shiki | Markdown 渲染 + 代码高亮 |
| Electron | electron 41.x | 桌面应用壳 |
| 图标 | lucide-solid | SVG 图标 |
| 定时/调度 | croner | CRON 表达式调度 |
| 文件监控 | @parcel/watcher, chokidar | 文件变更监听 |
| 语法解析 | web-tree-sitter | 代码语法分析 |
| 测试 | bun:test, Playwright | 单元/E2E 测试 |
| 文档 | Astro + Starlight | 文档站点 |
| 图标故事书 | Storybook 10.x | UI 组件文档 |
| 云部署 | SST (Serverless Stack) | 云基础设施 |
| 计费 | Stripe | SaaS 订阅管理 |

---

## 5. Effect 服务架构模式

整个代码库使用 Effect v4 的服务模式：

```typescript
// 1. 定义接口
export interface Interface {
  readonly stream: (input: StreamInput) => Stream.Stream<Event, unknown>
}

// 2. 定义 Service Tag
export class Service extends Context.Service<Service, Interface>()("@opencode/LLM") {}

// 3. 实现 Layer（依赖注入）
export const layer: Layer.Layer<Service, never, RequiredDeps> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const dep = yield* Dep.Service
    const stream = (input: StreamInput) => { /* 实现 */ }
    return Service.of({ stream })
  }),
)

// 4. 组合默认 Layer
export const defaultLayer = Layer.suspend(() =>
  layer.pipe(Layer.provide(Dep1.defaultLayer), Layer.provide(Dep2.defaultLayer)),
)

// 5. 消费者
const result = yield* MyService.stream(input)
```

---

## 6. 事件系统架构

```
┌──────────┐     ┌──────────┐     ┌───────────┐     ┌──────────┐
│  Session  │────▶│  Sync    │────▶│  SQLite   │     │   Bus    │
│  Service  │     │  Event   │     │           │     │ (内存)   │
└──────────┘     └──────────┘     └───────────┘     └────┬─────┘
                                                          │
                                               ┌──────────┴──────────┐
                                               │  EventV2 Bridge     │
                                               │  (core SessionEvent)│
                                               └─────────────────────┘
```

双重写入模式：事件同时写入 SyncEvent（持久化 + 同步）和 Bus（内存通知）。

---

## 7. 会话生命周期

```
创建 ──→ 活跃 ──→ 消息交换 ──→ 压缩 ──→ 归档/删除
 │                  │                      │
 └── 子会话 (Fork)  └── 重试 (Retry)       └── 快照恢复 (Revert)
```

- **创建**：`Session.create()` → SQLite 插入 → 触发 `session.created` 事件
- **Fork**：从指定消息处克隆会话及其所有消息
- **压缩**：上下文超限时自动触发，生成摘要后继续
- **重试**：LLM 调用失败时根据策略自动重试（指数退避）
- **回滚**：通过快照还原到历史状态