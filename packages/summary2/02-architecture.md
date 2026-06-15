# OpenCode 架构文档

## 1. 总体分层架构

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            Presentation Layer                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐                   │
│  │   CLI / TUI     │  │   Web Frontend  │  │   Desktop        │                   │
│  │  (SolidJS+Open  │  │  (SolidJS+Vite) │  │  (Electron)      │                   │
│  │   TUI)          │  │                 │  │  Main→Preload→   │                   │
│  │                 │  │                 │  │  Renderer        │                   │
│  └────────┬────────┘  └────────┬────────┘  └────────┬─────────┘                   │
│           │                    │                      │                            │
│           │  TUI Slots API     │  HTTP / SDK          │  IPC                       │
│           ▼                    ▼                      ▼                            │
├──────────────────────────────────────────────────────────────────────────────────┤
│                          Application Layer                                       │
│  ┌──────────────────────────────────────────────────────────────────────────┐     │
│  │  @opencode-ai/app                                                        │     │
│  │  Router: SolidJS Router → /, /:dir, /:dir/session, /:dir/session/:id    │     │
│  │  Providers: Server, Auth, Settings, Permission, Layout, Notification,    │     │
│  │             Models, Command, Sync, SDK                                   │     │
│  │  State: @tanstack/solid-query + createStore + createSignal               │     │
│  └──────────────────────────────────────────────────────────────────────────┘     │
│  ┌──────────────────────────────────────────────────────────────────────────┐     │
│  │  @opencode-ai/ui (185+ SolidJS 组件 + TailwindCSS 4)                     │     │
│  │  File Explorer, Editor, Diff Viewer, Session Panel, Settings, Markdown   │     │
│  └──────────────────────────────────────────────────────────────────────────┘     │
├──────────────────────────────────────────────────────────────────────────────────┤
│                           Service Layer (opencode)                               │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │ Session  │  Agent   │   Tool   │  Plugin  │  Config  │   Git    │   MCP    │  │
│  ├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤  │
│  │   LSP    │  Shell   │ Project  │  Server  │  Skill   │ Provider │Permission│  │
│  ├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤  │
│  │ Storage  │    CLI   │  Effect  │   ACP    │ Install  │  Sync    │  Debug   │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘  │
├──────────────────────────────────────────────────────────────────────────────────┤
│                         Core / LLM Layer                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │  @opencode-ai/core                                                      │     │
│  │  ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐    │     │
│  │  │  Schema  │  Event   │   Auth   │ Catalog  │   AI SDK │  Global  │    │     │
│  │  │  System  │  PubSub  │   Svc    │   Svc    │ Provider │   Path   │    │     │
│  │  ├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤    │     │
│  │  │   Flag   │  Effect  │ Location │   Util   │  Models  │    -     │    │     │
│  │  └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘    │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │  @opencode-ai/llm                                                       │     │
│  │  Route / Protocol / Auth / Framing / Transport / Tool / Cache           │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
├──────────────────────────────────────────────────────────────────────────────────┤
│                        Data / Infrastructure Layer                               │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────────┐  │
│  │ SQLite     │ │ AI SDK     │ │ File       │ │ HTTP       │ │ OpenTelemetry  │  │
│  │ (Drizzle)  │ │ (20+ 提供商)│ │ System     │ │ (Hono)     │ │ (Tracing)      │  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 包依赖拓扑图

```
                         ┌─────────────────────────┐
                         │     @opencode-ai/app     │
                         │   (Web Application)      │
                         └────────────┬────────────┘
                                      │ depends on
                         ┌────────────▼────────────┐
                         │     @opencode-ai/ui     │
                         │  (185+ SolidJS 组件)     │
                         └────────────┬────────────┘
                                      │ depends on
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
         ▼                            ▼                            ▼
  ┌──────────────┐          ┌──────────────────┐       ┌──────────────────┐
  │  packages/   │          │    opencode      │       │  @opencode-ai/   │
  │  console/    │          │  (Service Layer)  │       │    plugin        │
  │  (TUI App)   │          │                  │       │  (Plugin SDK)    │
  └──────┬───────┘          └────────┬─────────┘       └──────────────────┘
         │                           │
         │              ┌────────────┼────────────────────────────┐
         │              │            │                            │
         ▼              ▼            ▼                            ▼
  ┌──────────────┐ ┌───────────┐ ┌──────────────┐     ┌──────────────────┐
  │  packages/   │ │@opencode- │ │@opencode-ai/ │     │  @opencode-ai/   │
  │  web/        │ │ai/core    │ │    llm       │     │    sdk           │
  │  (Web Build) │ │(Foundation)│ │(Provider Abst)│    │  (OpenAPI Client)│
  └──────────────┘ └───────────┘ └──────────────┘     └──────────────────┘
                         │
           ┌─────────────┼────────────────────────────┐
           │             │                            │
           ▼             ▼                            ▼
  ┌──────────────┐ ┌───────────┐            ┌──────────────────┐
  │  packages/   │ │packages/  │            │  Supporting      │
  │  desktop/    │ │  script/  │            │  Packages:       │
  │  (Electron)  │ │           │            │  enterprise/     │
  └──────────────┘ └───────────┘            │  slack/          │
                                            │  identity/       │
                                            │  extensions/     │
  Shared Infrastructure                      │  containers/     │
  ┌──────────────┐ ┌───────────┐            │  http-recorder/  │
  │  packages/   │ │packages/  │            │  docs/           │
  │  storybook/  │ │   docs/   │            │  storybook/      │
  └──────────────┘ └───────────┘            └──────────────────┘
```

### 依赖方向说明

| 方向 | 依赖源 → 依赖目标 | 说明 |
|------|-------------------|------|
| 应用 → UI | `app` → `ui` | Web 应用使用 UI 组件库 |
| 应用 → 服务 | `app` + `console` → `opencode` | 前端通过 SDK/HTTP 调用服务层 |
| 服务 → 核心 | `opencode` → `core` + `llm` | 服务层依赖核心数据模型和 LLM 抽象 |
| 服务 → 插件 | `opencode` → `plugin` | 服务层加载和管理插件 |
| 服务 → SDK | `opencode` → `sdk` | 服务层使用 SDK 客户端 |

---

## 3. 跨层方法调用时序图

### 3.1 CLI `run` 命令完整调用链

从用户输入到最终结果返回的完整执行流程：

```
User            CLI/run.ts          Server(Hono)        SessionProcessor        LLM.Service         ProviderAPI         ToolSystem         SQLite
 │                  │                    │                     │                     │                   │                  │                  │
 │ opcode run       │                    │                     │                     │                   │                  │                  │
 │─────────────────▶│                    │                     │                     │                   │                  │                  │
 │                  │ 创建本地 Server     │                     │                     │                   │                  │                  │
 │                  │───────────────────▶│                     │                     │                   │                  │                  │
 │                  │                    │  Server.init()       │                     │                   │                  │                  │
 │                  │                    │────────────────────▶│                     │                   │                  │                  │
 │                  │                    │                     │  Project.bootstrap() │                   │                  │                  │
 │                  │                    │                     │────────────────────▶│                   │                  │                  │
 │                  │                    │                     │                     │  Provider.init()   │                  │                  │
 │                  │                    │                     │                     │──────────────────▶│                  │                  │
 │                  │                    │◀── ready ◀─────────│◀── ready ◀──────────│◀── ready ◀───────│                  │                  │
 │                  │◀── ready ◀────────│                     │                     │                   │                  │                  │
 │                  │                    │                     │                     │                   │                  │                  │
 │  输入 message    │                    │                     │                     │                   │                  │                  │
 │─────────────────▶│                    │                     │                     │                   │                  │                  │
 │                  │  SDK session       │                     │                     │                   │                  │                  │
 │                  │  .create()         │                     │                     │                   │                  │                  │
 │                  │───────────────────▶│                     │                     │                   │                  │                  │
 │                  │                    │  POST /v2/sessions   │                     │                   │                  │                  │
 │                  │                    │────────────────────▶│                     │                   │                  │                  │
 │                  │                    │                     │  Session.create()    │                   │                  │                  │
 │                  │                    │                     │────────────────────▶│                   │                  │ INSERT INTO     │
 │                  │                    │                     │                     │                   │                  │────────────────▶│
 │                  │                    │                     │◀── session ◀────────│                   │                  │                  │
 │                  │◀── sessionID ◀────│◀── 201 ◀───────────│                     │                   │                  │                  │
 │                  │                    │                     │                     │                   │                  │                  │
 │                  │  SDK session       │                     │                     │                   │                  │                  │
 │                  │  .prompt()         │                     │                     │                   │                  │                  │
 │                  │───────────────────▶│                     │                     │                   │                  │                  │
 │                  │                    │  POST /v2/sessions/  │                     │                   │                  │                  │
 │                  │                    │  :id/prompt         │                     │                   │                  │                  │
 │                  │                    │────────────────────▶│                     │                   │                  │                  │
 │                  │                    │                     │  SessionProcessor    │                   │                  │                  │
 │                  │                    │                     │  .handle()          │                   │                  │                  │
 │                  │                    │                     │────────────────────▶│                   │                  │                  │
 │                  │                    │                     │                     │  LLM.stream()     │                  │                  │
 │                  │                    │                     │                     │──────────────────▶│                  │                  │
 │                  │                    │                     │                     │                   │  HTTP/SSE        │                  │
 │                  │                    │                     │                     │                   │──────────────────▶│                  │
 │                  │                    │                     │◀── textDelta ◀─────│◀── SSE events ◀───│                  │                  │
 │◀── stream ◀─────│◀── SSE ◀───────────│◀── SSE ◀───────────│                     │                   │                  │                  │
 │                  │                    │                     │                     │                   │                  │                  │
 │                  │                    │                     │  tool_call           │                   │                  │                  │
 │                  │                    │                     │────────────────────▶│                   │                  │                  │
 │                  │                    │                     │                     │  ToolSystem       │                  │                  │
 │                  │                    │                     │                     │  .execute()       │                  │                  │
 │                  │                    │                     │                     │──────────────────▶│                  │                  │
 │                  │                    │                     │◀── toolResult ◀────│◀── result ◀───────│                  │                  │
 │                  │                    │                     │                     │                   │                  │                  │
 │                  │                    │                     │  LLM.stream()       │                   │                  │                  │
 │                  │                    │                     │  (继续)              │                   │                  │                  │
 │                  │                    │                     │────────────────────▶│                   │                  │                  │
 │                  │                    │◀── finish ◀────────│◀── complete ◀───────│◀── finish ◀───────│                  │                  │
 │◀── done ◀───────│◀── done ◀──────────│                     │                     │                   │                  │                  │
```

### 3.2 Web UI 请求 → 响应完整链路

```
Browser              @opencode-ai/app             Server(Hono)           opencode Service          DB (SQLite)
   │                       │                          │                        │                      │
   │  GET /:dir/session    │                          │                        │                      │
   │  /:id                 │                          │                        │                      │
   │──────────────────────▶│                          │                        │                      │
   │                       │  SolidJS Router 匹配      │                        │                      │
   │                       │  /:dir/session/:id        │                        │                      │
   │                       │─────────────────────────▶│                        │                      │
   │                       │  路由到 Session 组件      │                        │                      │
   │                       │                          │  SDK client GET        │                      │
   │                       │                          │  /v2/sessions/:id      │                      │
   │                       │                          │────────────────────────▶                      │
   │                       │                          │                        │  Session.get()        │
   │                       │                          │                        │──────────────────────▶│
   │                       │                          │                        │◀── row ◀──────────────│
   │                       │                          │◀── SessionData ◀───────│                      │
   │                       │◀── render ◀──────────────│                        │                      │
   │                       │                          │                        │                      │
   │                       │  组件挂载后自动查询消息    │                        │                      │
   │                       │  SDK client GET          │                        │                      │
   │                       │  /v2/sessions/:id        │                        │                      │
   │                       │  /messages               │                        │                      │
   │                       │──────────────────────────▶                        │                      │
   │                       │                          │                        │  Message.list()       │
   │                       │                          │                        │──────────────────────▶│
   │                       │                          │                        │◀── messages ◀─────────│
   │                       │◀── messages ◀─────────────│                        │                      │
   │                       │                          │                        │                      │
   │                       │  @tanstack/solid-query    │                        │                      │
   │                       │  缓存 + 响应式更新        │                        │                      │
   │◀── 页面渲染 ◀─────────│                          │                        │                      │
```

---

## 4. 技术栈决策说明

### 4.1 Effect v4 — 函数式并发框架

Effect v4 是整个后端的核心框架，贯穿所有服务层代码：

| 模式 | 用途 | 示例位置 |
|------|------|----------|
| `Context.Tag` / `Context.Service` | 服务注册与依赖注入 | `packages/core/src/auth.ts:101` |
| `Layer.effect` | 服务层的 Effect 定义 | `packages/core/src/event.ts:86` |
| `Effect.gen` | 命令式风格 Effect 组合 | `packages/core/src/event.ts:88-153` |
| `Effect.fn` | 命名/追踪 Effect 方法 | 各 service 文件 |
| `ScopedCache` | 按目录隔离的实例状态 | `packages/opencode/src/effect/instance-state.ts` |
| `Effect.forkIn` / `Effect.forkScoped` | 并发纤程管理 | `packages/opencode/src/project/bootstrap.ts` |
| `Stream` / `PubSub` | 流式数据处理和事件总线 | `packages/core/src/event.ts` |
| `Schema.Class` / `Schema.TaggedErrorClass` | 类型安全的数据建模 | `packages/core/src/schema.ts` |

**选择理由**：Effect v4 提供了比 Promise 更强的组合能力（类型安全的错误处理、依赖注入、资源管理、并发控制），适合复杂 Agent 编排场景。

### 4.2 SolidJS — 响应式 UI 框架

| 层 | 包 | 说明 |
|----|-----|------|
| TUI | `console/` + OpenTUI | 终端内 SolidJS 渲染 |
| Web | `app/` | 浏览器端 SolidJS 应用 |
| 组件库 | `ui/` | 可复用 SolidJS 组件 |

**选择理由**：SolidJS 的细粒度响应式（无虚拟 DOM diff）使 TUI 渲染性能更优，且与 OpenTUI 组件库深度集成。

### 4.3 Drizzle ORM — 类型安全数据库

- Schema 定义：`packages/opencode/src/**/*.sql.ts`
- 迁移工具：`drizzle-kit`
- 数据库：SQLite（本地存储）

### 4.4 Bun — 高性能运行时

- 运行时执行 TypeScript 无需预编译
- 内置测试框架（`bun test`）
- 工作区管理（`workspaces`）
- 包管理（`bun install`）

---

## 5. 事件驱动架构

OpenCode 使用 `@opencode-ai/core/event` 实现内部事件总线：

```
┌──────────────┐     publish()     ┌──────────────────┐
│  Service A   │──────────────────▶│   Event.Service   │
│              │                   │                   │
│              │                   │  ┌─────────────┐  │
│              │                   │  │  PubSub<all> │  │
│              │                   │  └─────────────┘  │
│              │                   │  ┌─────────────┐  │
│              │                   │  │PubSub<typeA>│  │
│              │                   │  └─────────────┘  │
│              │                   │  ┌─────────────┐  │
│              │                   │  │PubSub<typeB>│  │
│              │                   │  └─────────────┘  │
└──────────────┘                   └──────────────────┘
                                            │
                               subscribe()  │  all()
                               (typed)      │  (all events)
                                            ▼
                                   ┌──────────────────┐
                                   │   Service B      │
                                   │   (subscriber)   │
                                   └──────────────────┘
```

- **typed subscribe**：按事件类型过滤，只接收关心的通知
- **all()**：Stream 所有事件用于审计/同步
- **sync()**：同步钩子，事件发布时同步执行
- **registry**：全局事件类型注册表

---

## 6. 部署模式

| 模式 | 描述 | 启动方式 |
|------|------|----------|
| 本地 CLI | 单一进程，TUI + HTTP Server 内嵌入 | `bun dev` |
| HTTP Server | 独立 API 服务，无 UI | `opencode serve` |
| Web UI | HTTP Server + Web 前端 | `opencode web` 或 `bun dev:web` |
| Desktop | Electron 主进程嵌入 Server + Web | `bun dev:desktop` |
| Enterprise | 服务端部署 + SSO + 多租户 | 企业版部署 |