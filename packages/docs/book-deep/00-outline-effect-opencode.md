# 《Effect-TS 实战：从零构建 OpenCode AI 编程工具》—— 大纲

> 本书定位：面向有 TypeScript/Java 基础的开发者，以 OpenCode 开源项目为蓝本，深入讲解如何使用 Effect-TS 构建工业级 AI 编程工具。
> 参考基础大纲：`packages/generated/plan/plan.md`

---

## 第一部分：Effect-TS 核心概念与 OpenCode 架构总览

### 第 1 章 为什么选择 Effect-TS 构建 AI 编程工具
#### 1.1 AI 编程工具的技术挑战
- LLM 调用的不确定性：重试、超时、流式处理
- 多 Agent 协作的并发模型
- 会话管理与上下文的持久化
- Token 成本控制与限制管理
- 安全围栏（权限、沙箱、拒绝服务防护）
#### 1.2 原生 Promise 在这些场景中的不足
- 无法优雅取消正在进行的 LLM 调用
- 错误类型丢失：区分"API Key 过期"和"模型限流"需要手工解析
- 缺乏结构化并发：多个 Agent 协作时难以管理子任务生命周期
- 隐式副作用：函数签名无法体现"此函数依赖 AI 提供商"
#### 1.3 Effect-TS 如何解决这些问题
- `Effect<A, E, R>` 三维模型：成功值、错误类型、依赖需求
- 惰性求值：Effect 是"描述"不是"执行"
- OpenCode 架构总览：从 `packages/core/` 到 `packages/opencode/`
- 代码走读：`packages/opencode/src/session/processor.ts:86-104` — 12 个 Effect 依赖注入

### 第 2 章 开发环境与项目结构
#### 2.1 项目架构全景
- Monorepo 结构（Turbo + Bun）
- 核心包：`@opencode-ai/core`（基础设施）、`opencode`（业务逻辑）
- AI SDK 集成层：`@opencode-ai/llm` + `@ai-sdk/*`
- 前端层：`@opencode-ai/app` + `@opencode-ai/ui`
#### 2.2 Effect-TS 版本与关键依赖
- Effect v4 (4.0.0-beta.65) 特性概览
- `Effect.gen` Generator 语法 vs `pipe` 链式
- `/effect` 目录：`instance-state.ts`、`runtime.ts`、`run-service.ts`
#### 2.3 快速启动：第一个 Effect 应用
- 从 `makeRuntime` 到 `runPromise`
- Layer 组装：`SessionProcessor.defaultLayer` 的 12 层依赖

---

## 第二部分：LLM 调用核心 —— Session 系统

### 第 3 章 Session 生命周期管理
#### 3.1 会话数据模型
- `packages/opencode/src/session/session.ts` — Session CRUD 的 Effect 实现
- 品牌类型：`SessionID`、`MessageID`、`PartID`
- Drizzle ORM 集成：`session.sql.ts` 中的 Effect Schema + SQLite
#### 3.2 会话创建流
- `Session.create()` → DB INSERT → EventV2 发布
- Effect 事务处理：`SynchronizedRef` 保证原子性
- 对比传统 Java：`@Transactional` vs Effect 的自动 Scope 管理
#### 3.3 会话恢复与 Fork
- `--continue` 标志：加载最近会话
- `--fork` 实现：派生新会话（`session.ts` 中的 Fork 逻辑）
- 代码走读：`packages/opencode/src/cli/cmd/run.ts:394-473` — session 恢复的完整流程
#### 3.4 会话状态机
- `packages/opencode/src/session/status.ts` — `idle` / `busy` / `retry` 状态转换
- Effect 的 `SynchronizedRef` 管理状态
- 时序图：用户输入 → busy → LLM 流 → retry(可选) → idle

### 第 4 章 LLM 流处理：SessionProcessor 的核心
#### 4.1 SessionProcessor.handle() 完整链路
- 代码走读：`packages/opencode/src/session/processor.ts:721-789`
- Effect.gen 编排 16 种 LLM 事件（text-delta、tool-call、finish-step…）
- Stream.tap + Stream.takeUntil + Stream.runDrain 的流处理模式
#### 4.2 LLM.Service 的依赖注入
- `packages/opencode/src/session/llm.ts:62-74` — 6 个依赖的 Layer 组装
- `Effect.all({ concurrency: "unbounded" })` 并行获取 provider/config/auth
- AISDK 的缓存策略：`packages/core/src/aisdk.ts` — Map 缓存 LanguageModel
#### 4.3 流式响应处理
- handleEvent 的事件分发：text-start → text-delta(多次) → text-end
- Session.updatePartDelta() 的增量更新
- 代码走读：`processor.ts:578-589` — text-delta 处理

### 第 5 章 工具调用系统（Tool System）
#### 5.1 工具注册与执行
- `packages/opencode/src/tool/` — read、edit、grep、glob、bash、lsp 等 10+ 工具
- ToolRegistry 的 Effect 封装
- 代码走读：`processor.ts:321-379` — tool-call 事件处理 + doom loop 检测
#### 5.2 工具权限控制
- `packages/opencode/src/permission/index.ts` — Permission Rule 的 Effect 实现
- 权限规则：`allow` / `deny` / `ask` 三种操作
- `Wildcard.match()` 模式匹配
#### 5.3 工具结果与附件处理
- 代码走读：`processor.ts:382-439` — tool-result 事件处理
- 图片附件规范化（`Image.Service`）
- 工具执行失败恢复

---

## 第三部分：Agent 系统与编排

### 第 6 章 Agent 定义与执行循环
#### 6.1 Agent 数据模型
- `packages/opencode/src/agent/agent.ts:28-49` — Agent.Info Schema
- `mode` 字段：`subagent` / `primary` / `all`
- 系统提示模板：`generate.txt`、`compaction.txt`、`explore.txt`、`scout.txt`、`summary.txt`、`title.txt`
#### 6.2 主循环（Agent Loop）
- Loop 的实现：`packages/opencode/src/cli/cmd/run.ts:637-759`
- `for await (const event of events.stream)` 的事件驱动循环
- 事件类型处理：message.updated、message.part.updated、session.error、session.status、permission.asked
- 时序图：用户输入 → LLM 流 → 工具调用（可多轮）→ 完成
#### 6.3 子 Agent 机制
- `packages/opencode/src/agent/subagent-permissions.ts`
- 子 Agent 的权限隔离
- Effect.fork 管理子 Agent 生命周期
#### 6.4 死循环检测（Doom Loop）
- 代码走读：`processor.ts:357-378` — 连续 3 次相同 tool-call 触发
- `Permission.ask({ permission: "doom_loop" })` — 用户确认或中断
- 安全围栏机制详解

### 第 7 章 多 Agent 协作
#### 7.1 Agent 委派模式
- `task` 工具：一个 Agent 委派子任务给另一个 Agent
- Effect 的 Fiber 隔离：每个 Agent 在独立 Fiber 中运行
- 结果收集与合并
#### 7.2 Agent 通信协议（ACP）
- `packages/opencode/src/acp/` — Agent Communication Protocol
- 基于 `@agentclientprotocol/sdk` 的标准协议
- Effect Stream 实现 ACP 消息流
#### 7.3 规划模式（Plan Mode）
- Agent 生成执行计划 → 逐步执行 → 验证结果
- `packages/opencode/src/agent/agent.ts:51-56` — GeneratedAgent Schema
- Effect 的 Schedule 实现规划步骤的调度

---

## 第四部分：记忆管理与会话压缩

### 第 8 章 上下文管理
#### 8.1 消息模型的 Schema
- `packages/opencode/src/session/message-v2.ts` — Part 联合类型
- TextPart、ToolPart、ReasoningPart、StepPart
- 消息增量更新模式：updatePartDelta()
#### 8.2 记忆状态机
- `packages/core/src/session-message-updater.ts` — `memory()` 函数
- 活跃消息索引：activeAssistantIndex、activeCompactionIndex
- 消息追加与更新：appendMessage、updateAssistant
#### 8.3 上下文溢出检测
- `packages/opencode/src/session/overflow.ts`
- `isOverflow()` — 检测 token 是否超过上下文窗口
- 多提供商溢出模式匹配：Anthropic/OpenAI/Google/Groq 等 20+ 模式

### 第 9 章 会话压缩（Compaction）
#### 9.1 为什么需要压缩
- LLM 上下文窗口有限（8K-200K token）
- 长对话中保留关键信息，丢弃冗余内容
- 代码走读：`packages/opencode/src/session/compaction.ts`
#### 9.2 压缩策略
- `PRUNE_MINIMUM = 20000` — 至少保留 20K token
- `PRUNE_PROTECT = 40000` — 保护 40K token 不被裁剪
- 受保护工具：`skill` — 不裁剪技能工具的调用记录
#### 9.3 压缩的 Effect 实现
- `Compaction.generateSummary()` — 调用 LLM 生成摘要
- `Compaction.apply()` — 替换原始消息为摘要
- Effect 的 Scope 管理压缩过程中的资源
- 时序图：溢出检测 → 触发压缩 → LLM 摘要 → 消息替换 → 继续对话

---

## 第五部分：成本控制与限流

### 第 10 章 Token 与成本管理
#### 10.1 Token 统计模型
- `packages/opencode/src/session/session.ts` — `getUsage()` 函数
- Token 分类：input、output、reasoning、cache_read、cache_write
- Cost 计算：根据 provider 定价模型计算费用
#### 10.2 提供商定价模型
- `packages/core/src/plugin/models-dev.ts` — `cost()` 函数
- 分 tier 定价：标准 / 大上下文（200K+）
- 缓存分层：cache_read vs cache_write 不同价格
- `packages/opencode/src/provider/provider.ts:1013-1043` — 成本数据结构
#### 10.3 成本跟踪与限制
- 每次 finish-step 事件：累加 token 和 cost
- Effect 的 Ref 原子更新：`SynchronizedRef` 保证并发安全
- 用量告警：超过阈值时通过 EventV2 发布告警事件

### 第 11 章 限流与重试策略
#### 11.1 提供商限流处理
- 代码走读：`packages/opencode/src/session/retry.ts`
- HTTP 429（Rate Limit）检测
- `retry-after-ms` header 解析
- 基于 `Effect.Schedule` 的重试策略
#### 11.2 Effect Schedule 的高级用法
- `packages/opencode/src/session/retry.ts:34-40` — `delay()` 函数
- 指数退避：2s → 4s → 8s（`RETRY_BACKOFF_FACTOR = 2`）
- 最大延迟：`RETRY_MAX_DELAY`（32-bit 整数上限）
- 提供商自适应：不同提供商不同重试策略
#### 11.3 超时管理
- chunk-level timeout：SSE 流中 chunk 超时保护
- request-level timeout：整个 LLM 请求超时
- `packages/core/src/aisdk.ts:11-57` — `wrapSSE()` 实现
- 三层超时架构图

---

## 第六部分：安全围栏与失败恢复

### 第 12 章 权限系统（Permission Guard）
#### 12.1 权限模型
- `packages/opencode/src/permission/index.ts:19-48` — Rule/Action Schema
- 三值逻辑：`allow` / `deny` / `ask`
- 通配符匹配：`Wildcard.match()` — 支持 `*` 和 `?`
#### 12.2 权限评估与执行
- `packages/opencode/src/permission/evaluate.ts` — 规则评估
- `packages/opencode/src/permission/arity.ts` — 规则的优先级排序
- 执行时的权限拦截：`Permission.ask()` → EventV2 → 用户确认/拒绝
#### 12.3 权限的 Effect 实现
- `Permission.ask()` → 发布 `permission.asked` 事件
- 用户回复通过 `Bus.Event.Replied` 异步返回
- `Deferred` 实现请求-回复模式
- 代码走读：`cli/cmd/run.ts:736-756` — 权限的 CLI 处理
#### 12.4 安全围栏最佳实践
- 危险操作白名单：受保护工具（skill、bash 等）
- 工具黑名单：通过 `Permission.Ruleset` 配置
- 上下文溢出安全：超过 token 限制自动停止

### 第 13 章 失败恢复与容错
#### 13.1 Effect 的错误处理层次
- 预期错误（`E`）：`ProviderNotFoundError`、`ModelNotFoundError`
- 未预期缺陷（Defect）：代码 Bug、空指针
- 中断（Interrupt）：用户取消、超时
#### 13.2 会话级别的恢复
- SessionProcessor 的 `Effect.retry` + `SessionRetry.policy`
- 错误分类：context_overflow / api_error / rate_limit
- 各错误的恢复策略
#### 13.3 快照与回滚
- `packages/opencode/src/snapshot/` — 文件系统快照
- `Snapshot.track()` — 在 LLM 调用前记录文件状态
- `Snapshot.patch()` — 生成差异补丁
- `Snapshot.revert()` — 一键回滚文件变更
- Effect Scope 自动管理快照生命周期
#### 13.4 优雅降级
- 提供商不可用 → 自动切换到备选提供商
- 模型限流 → 降级到小模型
- EventV2 发布恢复状态变化事件

---

## 第七部分：高级 Effect 模式在 OpenCode 中的运用

### 第 14 章 并发控制与 Fiber 管理
#### 14.1 OpenCode 中的并发场景
- 并行工具执行（`{ concurrency: "unbounded" }`）
- 后台摘要生成（`Effect.forkIn(scope)`）
- 多会话同时处理
#### 14.2 InstanceState：按目录隔离的服务实例
- `packages/opencode/src/effect/instance-state.ts`
- `ScopedCache` 实现每个目录独立的 Git/MCP/LSP 服务
- 项目关闭时自动清理资源
#### 14.3 EffectBridge：原生回调与 Effect 的桥接
- `packages/opencode/src/effect/bridge.ts`
- `@parcel/watcher`、`node-pty` 等原生库的回调接入
- Promise ↔ Effect 的双向转换

### 第 15 章 事件驱动架构
#### 15.1 EventV2 在 OpenCode 中的使用
- `packages/core/src/event.ts` — 基于 PubSub 的事件总线
- SessionEvent：Created、Text.Started、Tool.Called、Step.Ended…
- sync handler vs subscribe 的选择策略
#### 15.2 Bus.Service — OpenCode 内部事件总线
- `packages/opencode/src/bus/`
- EventV2Bridge：连接 core 事件系统和 opencode 业务逻辑
- 审计日志通过 EventV2.sync 同步写入

### 第 16 章 测试与调试
#### 16.1 Effect 的可测试性
- 替换 Layer：测试中注入 Mock 依赖
- `Global.layerWith()` 覆盖文件系统路径
- 代码走读：测试文件中如何构建 Effect 测试
#### 16.2 OpenCode 的测试实践
- `packages/opencode/test/session/` — 会话测试
- `packages/opencode/test/tool/` — 工具测试
- `packages/opencode/test/agent/` — Agent 测试
- 使用 `TestClock` 测试重试策略
#### 16.3 调试技巧
- `Effect.fn` 命名追踪
- `--log-level DEBUG` 开启详细日志
- `--print-logs` 实时查看 Effect 调用链
- `opencode debug agent` 测试特定 Agent 的工具执行

---

## 附录

### 附录 A：OpenCode 配置详解
```jsonc
{
  "providers": { "anthropic": { "enabled": true } },
  "model": { "provider": "anthropic", "name": "claude-sonnet-4" },
  "experimental": { "openTelemetry": false }
}
```

### 附录 B：Effect-TS API 与 Java 对照速查表
| Java | Effect-TS |
|------|-----------|
| `CompletableFuture<T>` | `Effect<A, E, R>` |
| `@Autowired` | `yield* Service` |
| `try-with-resources` | `Effect.acquireRelease` |
| `synchronized` | `SynchronizedRef` |
| `ThreadPoolExecutor` | `Effect.forkIn + Scope` |

### 附录 C：Docker Compose 部署
```yaml
services:
  opencode-server:
    image: opencode/opencode:latest
    command: ["opencode", "serve"]
  opencode-web:
    image: opencode/opencode-web:latest
```

### 附录 D：错误代码参考
| 错误 | 来源 | 处理方式 |
|------|------|----------|
| `context_overflow` | LLM 提供商 | 触发 Compaction |
| `rate_limit` | LLM 提供商 | 指数退避重试 |
| `doom_loop` | SessionProcessor | 用户确认或中断 |
| `permission_denied` | Permission 系统 | 拒绝操作 |