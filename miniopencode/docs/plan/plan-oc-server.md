Server 追平规划
现状
miniopencode server：1 个文件（116 行），Bun.serve() 手写路由，5 个端点
完整版 server：*~60+ 文件*，基于 Effect HttpApi 框架，21 个路由组 + 20 个处理器 + 9 个中间件 + WebSocket + mDNS + OpenAPI
迭代路线图（18 次迭代）
Phase 1：基础设施（4 次）
| # | 迭代 | 文件 | 行数 | 核心内容 |
|---|---|---|---|---|
| 1 | Effect HTTP 服务器 | server/server.ts | 120 | 基于 @effect/platform-node NodeHttpServer，端口回退（0→4096），优雅关闭，Scope 管理 |
| 2 | 中间件系统 | server/middleware/ | 150 | error.ts（统一错误响应）、compression.ts、cors-vary.ts、schema-error.ts |
| 3 | 路由框架 | server/routes/instance/httpapi/api.ts + server.ts | 100 | HttpApi 路由组定义模式，Layer 组合，handler 注册 |
| 4 | 认证 + CORS | server/auth.ts + server/cors.ts | 80 | authorization middleware，CORS 配置，ServerAuth.Config |
Phase 2：核心 API 路由（5 次）
| # | 迭代 | 文件 | 行数 | 核心内容 |
|---|---|---|---|---|
| 5 | Session API | groups/session.ts + handlers/session.ts | 120 | CRUD + prompt + status + messages，含 session-errors.ts |
| 6 | Config + Provider API | groups/config.ts + groups/provider.ts + handlers | 100 | 配置读取/更新，provider 列表/路由 |
| 7 | File + Project API | groups/file.ts + groups/project.ts + handlers | 100 | 文件读写/搜索，项目信息/引导 |
| 8 | Permission + Question API | groups/permission.ts + groups/question.ts + handlers | 80 | 权限评估/请求，问题交互 |
| 9 | Instance + Global API | groups/instance.ts + groups/global.ts + handlers | 80 | 实例信息，全局状态 |
Phase 3：高级 API（5 次）
| # | 迭代 | 文件 | 行数 | 核心内容 |
|---|---|---|---|---|
| 10 | Event API | groups/event.ts + handlers/event.ts | 100 | SSE 事件流，Bus 订阅推送 |
| 11 | MCP + PTY API | groups/mcp.ts + groups/pty.ts + handlers | 120 | MCP 工具/服务器管理，PTY 终端连接 |
| 12 | Control + Workspace API | groups/control.ts + groups/workspace.ts + handlers | 100 | 控制命令，工作区管理 |
| 13 | Sync + TUI API | groups/sync.ts + groups/tui.ts + handlers | 80 | 同步事件，TUI 控制 |
| 14 | V2 API | groups/v2.ts + groups/v2/ + handlers/v2/ | 120 | V2 兼容 API（location, message, model, provider, session） |
Phase 4：基础设施完善（4 次）
| # | 迭代 | 文件 | 行数 | 核心内容 |
|---|---|---|---|---|
| 15 | WebSocket | websocket-tracker.ts | 80 | WebSocket 连接跟踪，closeAll |
| 16 | mDNS + 生命周期 | mdns.ts + lifecycle.ts + global-lifecycle.ts | 100 | mDNS 发布/取消，disposeMiddleware，init-projectors |
| 17 | 共享模块 | shared/（fence, pty-ticket, public-ui, tui-control, ui, workspace-routing） | 150 | 跨路由共享逻辑 |
| 18 | OpenAPI + 集成验证 | public.ts + errors.ts + api.ts 完善 | 100 | OpenAPI 文档生成，完整集成测试 |
依赖关系
Phase 1（基础设施）→ Phase 2（核心 API）→ Phase 3（高级 API）
                                              ↓
                                        Phase 4（基础设施完善）
- Phase 1 是硬依赖，必须先完成
- Phase 2 内部可按任意顺序实现
- Phase 3 依赖 Phase 1 + Phase 2
- Phase 4 可并行于 Phase 2/3 之后
关键架构决策
1. 使用 Effect HttpApi（effect/unstable/httpapi）而非手写路由 — 完整版的选择，类型安全 + OpenAPI 自动生成
2. Layer 组合模式 — 每个 handler 作为独立 Layer，在 server.ts 中 Layer.mergeAll 组合
3. 中间件链 — authorization → instance-context → workspace-routing → cors → compression → error
4. WebSocket 通过 Socket layer — effect/unstable/socket/Socket
---
这个规划是否合理？确认后我开始执行。