# OpenCode 核心模块设计文档

## 1. 会话处理流程

### 1.1 整体会话处理时序

```
User            CLI/UI         Session         SessionProcessor       LLM            Provider API       Tool System
 │                │                │                  │               │                  │                  │
 │  opcode run    │                │                  │               │                  │                  │
 │───────────────▶│                │                  │               │                  │                  │
 │                │  create        │                  │               │                  │                  │
 │                │───────────────▶│                  │               │                  │                  │
 │                │                │──────────────────│──────────────▶│                  │                  │
 │                │                │──────────────────│──────────────▶│                  │                  │
 │  用户输入问题   │                │                  │               │                  │                  │
 │───────────────▶│────────────────│─────────────────▶│               │                  │                  │
 │                │                │                  │  stream()     │                  │                  │
 │                │                │                  │──────────────▶│                  │                  │
 │                │                │                  │               │  HTTP Request    │                  │
 │                │                │                  │               │─────────────────▶│                  │
 │                │                │                  │               │                  │                  │
 │                │                │                  │◀── SSE Stream ───────────────────│                  │
 │                │                │                  │  (events)     │                  │                  │
 │                │                │                  │               │                  │                  │
 │                │                │                  │  text-start   │                  │                  │
 │                │                │◀── partDelta ───│               │                  │                  │
 │                │◀── stream ─────│                 │               │                  │                  │
 │◀── 流式显示 ────│                │                  │               │                  │                  │
 │                │                │                  │  tool-call    │                  │                  │
 │                │                │                  │──────────────│─────────────────▶│  execute()      │
 │                │                │                  │               │                  │─────────────────▶│
 │                │                │                  │               │                  │◀── result ──────│
 │                │                │                  │◀── tool-result│                  │                  │
 │                │                │◀── complete ────│               │                  │                  │
 │                │◀── tool_result │                 │               │                  │                  │
 │   显示结果      │                │                  │               │                  │                  │
 │◀───────────────│                │                  │               │                  │                  │
 │                │                │                  │  finish-step  │                  │                  │
 │                │                │◀── step_finish ─│               │                  │                  │
 │                │                │── summarize ───▶│               │                  │                  │
 │                │                │   (fork,ignore)  │               │                  │                  │
 │                │                │                  │               │                  │                  │
 │                │                │  finish          │               │                  │                  │
 │                │                │◀────────────────│               │                  │                  │
```

### 1.2 模块职责

| 模块 | 文件 | 职责 |
|------|------|------|
| `Session.Service` | `session/session.ts` | 会话 CRUD、消息管理、分页查询、Fork |
| `SessionProcessor.Service` | `session/processor.ts` | LLM 流处理编排、工具调用管理、错误处理、重试 |
| `LLM.Service` | `session/llm.ts` | AI SDK `streamText` 调用、系统提示组装、工具解析 |
| `SessionRunState.Service` | `session/run-state.ts` | 运行状态管理（并发控制、取消） |
| `SessionStatus.Service` | `session/status.ts` | 会话状态机（idle/busy/retry） |
| `SessionRetry` | `session/retry.ts` | 重试策略（指数退避、提供商感知） |
| `SessionSummary` | `session/summary.ts` | 会话摘要生成 |

### 1.3 关键接口

**SessionProcessor.Handle** (`processor.ts:39-55`):
```typescript
interface Handle {
  readonly message: MessageV2.Assistant
  readonly updateToolCall: (toolCallID, update) => Effect<MessageV2.ToolPart | undefined>
  readonly completeToolCall: (toolCallID, output) => Effect<void>
  readonly process: (streamInput: LLM.StreamInput) => Effect<Result>
}
type Result = "compact" | "stop" | "continue"
```

**LLM.StreamInput** (`llm.ts:35-48`):
```typescript
interface StreamInput {
  user: MessageV2.User
  sessionID: string
  model: Provider.Model
  agent: Agent.Info
  system: string[]
  messages: ModelMessage[]
  tools: Record<string, Tool>
  toolChoice?: "auto" | "required" | "none"
}
```

### 1.4 事件驱动架构

事件系统通过双重写入实现一致性和实时性：

```
事件类型：SessionEvent (core/session-event.ts)
├── Session.Step.Started/Ended/Failed
├── Session.Text.Started/Delta/Ended
├── Session.Reasoning.Started/Delta/Ended
├── Session.Tool.Input.Started/Delta/Ended
├── Session.Tool.Called/Progress/Success/Failed
├── Session.Compaction.Started/Delta/Ended
├── Session.Prompted
├── Session.Retried
└── Session.AgentSwitched/ModelSwitched
```

---

## 2. Agent 编排流程

### 2.1 Agent 多步推理时序

```
Session                Agent             LLM            Tool Registry         Tool Handler
  │                     │                │                  │                    │
  │ getAgent(name)      │                │                  │                    │
  │────────────────────▶│                │                  │                    │
  │◀── Agent.Info ─────│                │                  │                    │
  │                     │                │                  │                    │
  │ Step 1: LLM call    │                │                  │                    │
  │─────────────────────────────────────▶│                  │                    │
  │                     │                │ tool-call        │                    │
  │                     │                │─────────────────▶│                    │
  │                     │                │                  │ execute(tool,args) │
  │                     │                │                  │───────────────────▶│
  │                     │                │                  │◀── result ────────│
  │                     │                │◀── tool-result ─│                    │
  │                     │                │                  │                    │
  │◀── step-finish ─────────────────────│                  │                    │
  │                     │                │                  │                    │
  │ Step 2: follow-up   │                │                  │                    │
  │（追加 assistant msg + tool result）  │                  │                    │
  │─────────────────────────────────────▶│                  │                    │
  │                     │                │ ...              │                    │
  │◀── finish ──────────────────────────│                  │                    │
  │                     │                │                  │                    │
```

### 2.2 Agent 定义

`agent/agent.ts:28-49`：
```typescript
interface Info {
  name: string
  mode: "subagent" | "primary" | "all"
  permission: Permission.Ruleset
  model?: { modelID: string; providerID: string }
  temperature?: number
  topP?: number
  prompt?: string           // 自定义系统提示
  options: Record<string, unknown>
  steps?: number            // 最大推理步数
}
```

### 2.3 工具解析流程

`session/llm.ts:439-445`：
```
resolveTools(input)
  ├── 权限过滤（Permission.disabled）
  └── 用户过滤（user.tools[k] !== false）
```

工具调用修复 `llm.ts:331-350`：
- 大小写容错：自动将大写工具名转为小写
- 无效工具：重定向到 `invalid` 工具

---

## 3. LLM 请求链路（@opencode-ai/llm）

### 3.1 完整请求时序

```
LLM Client          Route              Protocol           Transport          HTTP Executor        AI API
    │                 │                   │                   │                   │                │
    │ generate(req)   │                   │                   │                   │                │
    │────────────────▶│                   │                   │                   │                │
    │                 │  prepare(body)     │                   │                   │                │
    │                 │───────────────────▶│                   │                   │                │
    │                 │                   │  encodeBody()      │                   │                │
    │                 │                   │───────────────────▶│                   │                │
    │                 │                   │                   │  prepare(req)      │                │
    │                 │                   │                   │───────────────────▶│                │
    │                 │                   │                   │                   │  HTTP POST     │
    │                 │                   │                   │                   │───────────────▶│
    │                 │                   │                   │               ◀───│── SSE Stream ─│
    │                 │                   │                   │◀── frames ──────│                   │
    │                 │                   │◀── LLMEvent stream│                   │                │
    │                 │◀── LLMResponse ───│                   │                   │                │
    │◀── response ────│                   │                   │                   │                │
```

### 3.2 4 轴分解架构

```typescript
// Route = Protocol + Endpoint + Auth + Framing + Transport

// Protocol: 语义级 API 抽象
interface Protocol<Body, Frame, Event, State> {
  id: ProtocolID
  body: ProtocolBody<Body>          // LLMRequest → Provider Body
  stream: ProtocolStream<Frame, Event, State>  // Frame → LLMEvent
}

// Endpoint: URL 路径
interface Endpoint<Body> {
  path: string | ((input) => string)
}

// Auth: 认证
interface Auth {
  apply: (input) => Effect<Headers, AuthError>
}
// 变体: bearer, apiKeyHeader, header, passthrough, config, value...

// Framing: 字节流 → 帧
interface Framing<Frame> {
  id: string
  frame: (bytes: Stream<Uint8Array>) => Stream<Frame>
}
// 内置: Framing.sse (Server-Sent Events)

// Transport: 传输层
interface Transport<Body, Prepared, Frame> {
  id: string
  prepare: (body, request) => Effect<Prepared>
  frames: (prepared, request, runtime) => Stream<Frame>
}
// 内置: HttpJsonTransport
```

### 3.3 协议实现

| 协议 | 文件 | 行数 | ID |
|------|------|------|-----|
| OpenAI Chat | `protocols/openai-chat.ts` | 420 | `openai-chat` |
| OpenAI Responses | `protocols/openai-responses.ts` | 593 | `openai-responses` |
| Anthropic Messages | `protocols/anthropic-messages.ts` | 691 | `anthropic-messages` |
| Gemini | `protocols/gemini.ts` | 422 | `gemini` |
| Bedrock Converse | `protocols/bedrock-converse.ts` | 634 | `bedrock-converse` |
| OpenAI Compatible | `protocols/openai-compatible-chat.ts` | — | `openai-compatible-chat` |

### 3.4 LLMEvent 流事件类型

`schema/events.ts:236-284` — 16 种事件的 tagged union：

```
LLMEvent
├── step-start / step-finish / finish
├── text-start / text-delta / text-end
├── reasoning-start / reasoning-delta / reasoning-end
├── tool-input-start / tool-input-delta / tool-input-end
├── tool-call / tool-result / tool-error
└── provider-error
```

### 3.5 Tool Runtime 执行流程

`tool-runtime.ts:64-148` 工具运行时：

```
ToolRuntime.stream(options)
  ├── 添加工具定义到请求
  ├── 流式 LLM 响应
  │     ├── 遇到 tool-call: dispatch()
  │     │     ├── 按名查找工具
  │     │     ├── _decode() 解码参数
  │     │     ├── execute() 执行工具
  │     │     └── _encode() 编码结果
  │     │     └── emitEvents() 发出 tool-result/tool-error
  │     └── 遇到 finish: 检查 stopCondition
  │           ├── true → 停止
  │           └── false → followUpRequest() → 继续循环
  └── 收集所有事件到 LLMResponse
```

---

## 4. 插件 Hook 触发时序

```
SessionProcessor         Plugin Pipe            user_plugin_A        user_plugin_B
     │                      │                       │                    │
     │ process()            │                       │                    │
     │                      │                       │                    │
     │ trigger(chat.params) │                       │                    │
     │─────────────────────▶│──────────────────────▶│                    │
     │                      │◀──── params ─────────│                    │
     │                      │───────────────────────────────────────────▶│
     │                      │◀─────────── params ───────────────────────│
     │◀── merged params ────│                       │                    │
     │                      │                       │                    │
     │ trigger(chat.headers)│                       │                    │
     │─────────────────────▶│──────────────────────▶│                    │
     │                      │◀──── headers ────────│                    │
     │◀── merged headers ───│                       │                    │
     │                      │                       │                    │
     │ tool.execute.before  │                       │                    │
     │─────────────────────▶│──────────────────────▶│                    │
     │◀── modified args ────│                       │                    │
     │                      │                       │                    │
     │ tool.execute.after   │                       │                    │
     │─────────────────────▶│──────────────────────▶│                    │
     │◀── modified output ──│                       │                    │
```

---

## 5. 数据库架构

### 5.1 表结构

**SessionTable** (`session/session.sql.ts`):
```
session
├── id (TEXT PK)
├── slug (TEXT)
├── project_id (TEXT FK → project.id)
├── workspace_id (TEXT, nullable)
├── parent_id (TEXT, nullable, 自引用 FK)
├── directory (TEXT)
├── path (TEXT, nullable)
├── title (TEXT)
├── agent (TEXT, nullable)
├── model (JSON, nullable)
├── version (TEXT)
├── cost (REAL)
├── tokens_input/output/reasoning/cache_read/cache_write (INTEGER)
├── share_url (TEXT, nullable)
├── revert (JSON, nullable)
├── permission (JSON, nullable)
├── time_created/updated/compacting/archived (INTEGER)
└── summary_additions/deletions/files/diffs (INTEGER/JSON)
```

**PartTable** (`session/session.sql.ts`):
```
part
├── id (TEXT PK)
├── session_id (TEXT FK)
├── message_id (TEXT FK)
└── data (JSON - 消息部分数据)

ProjectTable: project
├── id (TEXT PK)
├── name (TEXT, nullable)
└── worktree (TEXT)
```

### 5.2 存储层

`storage/` 目录：
- `storage.ts` — 通用存储接口（读/写/删除）
- `db.ts` — SQLite 数据库客户端
- `sync.ts` — 同步引擎
- `json-migration.ts` — JSON 数据迁移

---

## 6. 关键模块文件索引

| 功能 | 文件路径 | 关键行 |
|------|----------|--------|
| CLI 入口 | `opencode/src/index.ts` | 70-193 (yargs 注册) |
| 会话定义 | `opencode/src/session/session.ts` | 207-226 (Info Schema) |
| 会话接口 | `opencode/src/session/session.ts` | 452-501 (Interface) |
| Session 服务层 | `opencode/src/session/session.ts` | 509-863 (layer) |
| 会话处理器 | `opencode/src/session/processor.ts` | 63-65 (Interface) |
| 处理器流程 | `opencode/src/session/processor.ts` | 721-789 (process) |
| 事件处理 | `opencode/src/session/processor.ts` | 214-630 (handleEvent) |
| LLM 服务 | `opencode/src/session/llm.ts` | 56-58 (Interface) |
| LLM streamText | `opencode/src/session/llm.ts` | 325-404 (核心调用) |
| 运行状态 | `opencode/src/session/run-state.ts` | 10-24 (Interface) |
| Agent 定义 | `opencode/src/agent/agent.ts` | 28-49 (Info Schema) |
| Agent 服务 | `opencode/src/agent/agent.ts` | 57-73 (Interface) |
| LLM Route 接口 | `llm/src/route/protocol.ts` | 36-43 (Protocol) |
| LLM Client | `llm/src/route/client.ts` | 217-231 (Interface) |
| LLM Event 模型 | `llm/src/schema/events.ts` | 236-284 (LLMEvent) |
| LLM Request | `llm/src/schema/messages.ts` | 198-211 (LLMRequest) |
| 工具定义 | `llm/src/tool.ts` | 33-44 (Tool) |
| 工具运行时 | `llm/src/tool-runtime.ts` | 34-47 (RunOptions) |
| Plugin Hooks | `plugin/src/index.ts` | 222-333 (Hooks) |
| TUI Plugin | `plugin/src/tui.ts` | 580-624 (TuiPluginApi) |