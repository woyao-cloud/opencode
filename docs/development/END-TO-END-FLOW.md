# opencode 端到端流程：从用户输入到代码生成

本文档用**时序图 + 模块调用链**的方式，完整追踪一条用户消息从 CLI 入口到 LLM 响应再到文件变更的全过程。每个阶段标注了涉及的源文件和核心函数。

## 总体架构（五层）

```text
┌──────────────────────────────────────────────────────────────┐
│ CLI 入口层    cli/cmd/run.ts  cli/cmd/run/runtime.ts         │
│ "opencode run '帮我修复这个 bug'"                              │
├──────────────────────────────────────────────────────────────┤
│ 会话 API 层   session/prompt.ts  (核心：~2150行)              │
│ 消息构建 → System Prompt → Step 循环 → 工具调度               │
├──────────────────────────────────────────────────────────────┤
│ 模型通信层    session/llm.ts  provider/transform.ts           │
│             packages/llm/src/protocols/                       │
│ 流式请求 → SSE 解析 → LLMEvent 分发                           │
├──────────────────────────────────────────────────────────────┤
│ 工具执行层    tool/*.ts  tool/registry.ts                     │
│             packages/llm/src/tool-runtime.ts                  │
│ Bash / Read / Write / Edit / Glob / Grep / Task ...          │
├──────────────────────────────────────────────────────────────┤
│ 基础设施层    packages/core/  (事件/消息/日志)                 │
│             config/  storage/  bus/  effect/                  │
│             session/processor.ts  session/compaction.ts       │
└──────────────────────────────────────────────────────────────┘
```

---

## 阶段一：启动与初始化

用户执行 `opencode run "帮我修复 src/auth 下的类型错误"`

```text
时间线 →

CLI (run.ts)                  Runtime                   Session/Config
    │                            │                           │
    │─resolveRunInput()─────────→│                           │
    │  解析命令行参数              │                           │
    │  (model, agent, files...)   │                           │
    │                            │                           │
    │──runInteractiveLocalMode()→│                           │
    │                            │─createOpencodeClient()    │
    │                            │  创建 SDK 客户端           │
    │                            │                           │
    │                            │─session(sdk)─────────────→│─session.create()
    │                            │  创建或恢复 Session         │  生成 SessionID
    │                            │                           │  关联 Agent+Model
    │                            │                           │  加载项目配置
    │                            │←──────────────────────────│
    │                            │                           │
    │                            │─resolveAgent()───────────→│─Agent.Service.list()
    │                            │  确定使用的 Agent           │  默认 agent 或 --agent
```

**涉及文件**：

| 步骤 | 文件 | 核心函数 |
|------|------|---------|
| 参数解析 | `cli/cmd/run.ts` | `resolveRunInput()` |
| 运行时启动 | `cli/cmd/run/runtime.ts` | `runInteractiveLocalMode()` |
| 会话创建 | `cli/cmd/run.ts` | `session()` → `sdk.session.create()` |
| Agent 确定 | `agent/agent.ts` | `Agent.Service.defaultInfo()` |

---

## 阶段二：消息准备与 System Prompt 组装

SDK 调用 `POST /session/{id}/message` → 服务端路由 → `SessionPrompt.prompt()`

```text
时间线 →

Server (session.ts)        SessionPrompt (prompt.ts)          Instruction/SystemPrompt
    │                            │                                    │
    │─prompt(input)─────────────→│                                    │
    │                            │                                    │
    │                            │─createUserMessage(input)           │
    │                            │                                    │
    │                            │  ① 解析 Agent（查找定义）           │
    │                            │     agent/agent.ts                 │
    │                            │                                    │
    │                            │  ② 解析 Model（多级查找）           │
    │                            │     provider/provider.ts           │
    │                            │                                    │
    │                            │  ③ 组装 Part 数组                  │
    │                            │     resolvePart() 逐条处理:         │
    │                            │                                    │
    │                            │  ┌─ type:"text"  → TextPart        │
    │                            │  ├─ type:"file"  → 读取文件内容     │
    │                            │  │   tool/read.ts 的 execute()     │
    │                            │  │   图片 → base64 编码             │
    │                            │  │   目录 → 列出文件                │
    │                            │  ├─ type:"agent" → AgentPart       │
    │                            │  └─ MCP 资源 → 远程获取            │
    │                            │                                    │
    │                            │  ④ 保存 User Message               │
    │                            │     session/session.ts             │
    │                            │     updateMessage() + updatePart() │
    │                            │                                    │
    │                            │  ⑤ 发布事件                        │
    │                            │     AgentSwitched / ModelSwitched  │
    │                            │     Prompted / Synthetic           │
    │                            │                                    │
    │                            │─loop(sessionID)                    │
    │                            │  进入主循环 (见阶段三)              │
```

**涉及文件**：

| 步骤 | 文件 | 核心函数 |
|------|------|---------|
| 入口 | `session/prompt.ts` | `prompt()` → `createUserMessage()` |
| Part 解析 | `session/prompt.ts` | `resolvePart()` |
| 文件读取 | `tool/read.ts` | `execute()` |
| Agent 查找 | `agent/agent.ts` | `agents.get()` |
| 模型查找 | `provider/provider.ts` | `getModel()` / `currentModel()` |
| 消息持久化 | `session/session.ts` | `updateMessage()`, `updatePart()` |
| 事件发布 | `bus/index.ts` | `bus.publish()` |

---

## 阶段三：Agent 运行循环（核心）

这是 opencode 最核心的机制。一次用户消息可能触发多轮 LLM 调用（Step）。

```text
时间线 →

SessionPrompt (prompt.ts)         Processor           LLM/Provider            Tool Runtime
    │                                │                    │                      │
    │─runLoop(sessionID)             │                    │                      │
    │                                │                    │                      │
    │  ╔══════════ STEP 循环开始 ═══════════════════════════════════════════════╗
    │  ║                            │                    │                      │
    │  ║ ① 加载消息历史              │                    │                      │
    │  ║   message-v2.ts            │                    │                      │
    │  ║   filterCompactedEffect()  │                    │                      │
    │  ║                            │                    │                      │
    │  ║ ② 检查退出条件              │                    │                      │
    │  ║   · 最后一条 Assistant      │                    │                      │
    │  ║     已 finish 且非 tool_call│                    │                      │
    │  ║   · 超过 maxSteps           │                    │                      │
    │  ║                            │                    │                      │
    │  ║ ③ 检测 SubTask/Compaction   │                    │                      │
    │  ║   若有 → handleSubtask()    │                    │                      │
    │  ║   若有 → compaction.process│                    │                      │
    │  ║                            │                    │                      │
    │  ║ ④ 检测上下文溢出            │                    │                      │
    │  ║   compaction.isOverflow()  │                    │                      │
    │  ║   若溢出 → 创建 Compaction  │                    │                      │
    │  ║                            │                    │                      │
    │  ║ ⑤ 插入提醒 (Plan模式等)     │                    │                      │
    │  ║   insertReminders()        │                    │                      │
    │  ║                            │                    │                      │
    │  ║ ⑥ 组装 System Prompt       │                    │                      │
    │  ║   ┌─ sys.environment()     │                    │                      │
    │  ║   │  日期/OS/Git/目录       │                    │                      │
    │  ║   ├─ instruction.system()  │                    │                      │
    │  ║   │  AGENTS.md + 远程URL    │                    │                      │
    │  ║   └─ sys.skills()          │                    │                      │
    │  ║                            │                    │                      │
    │  ║ ⑦ 转换消息格式              │                    │                      │
    │  ║   MessageV2.toModelMessages │                    │                      │
    │  ║   Effect()                 │                    │                      │
    │  ║                            │                    │                      │
    │  ║ ⑧ 注册工具                  │                    │                      │
    │  ║   resolveTools()           │                    │                      │
    │  ║   ┌─ registry.tools()      │                    │                      │
    │  ║   │  内置工具 → AI SDK Tool │                    │                      │
    │  ║   └─ mcp.tools()           │                    │                      │
    │  ║     MCP工具 → AI SDK Tool  │                    │                      │
    │  ║                            │                    │                      │
    │  ║ ⑨ 创建 Processor Handle    │                    │                      │
    │  ║   processor.create()       │                    │                      │
    │  ║                            │                    │                      │
    │  ║ ⑩ 调用 LLM ───────────────→│─handle.process()──→│                      │
    │  ║                            │                    │                      │
    │  ║                            │  见阶段四            │                      │
    │  ║                            │  (LLM 通信细节)      │                      │
    │  ║                            │←─返回结果───────────│                      │
    │  ║                            │                    │                      │
    │  ║ ⑪ 处理结果                  │                    │                      │
    │  ║                            │                    │                      │
    │  ║   finish="stop"?           │                    │                      │
    │  ║   ├─ 是 → break (退出循环)  │                    │                      │
    │  ║   │                         │                    │                      │
    │  ║   finish="tool_calls"?     │                    │                      │
    │  ║   └─ 是 → 工具结果已注入    │                    │                      │
    │  ║          continue (下一轮)  │                    │                      │
    │  ║                             │                    │                      │
    │  ║   result="compact"?         │                    │                      │
    │  ║   └─ 是 → 创建 Compaction   │                    │                      │
    │  ║          continue           │                    │                      │
    │  ║                             │                    │                      │
    │  ╚═══════════ 回到 ① ═════════════════════════════════════════════════════╝
    │
    │─compaction.prune()  清理过期压缩数据
    │
    │─lastAssistant()     返回最终的 Assistant Message
    │
    │←─ 返回 MessageV2.WithParts (含所有 Part)
```

**涉及文件**：

| 步骤 | 文件 | 核心函数/概念 |
|------|------|-------------|
| 主循环 | `session/prompt.ts` | `runLoop()` |
| 消息加载 | `session/message-v2.ts` | `filterCompactedEffect()`, `latest()` |
| 溢出检测 | `session/compaction.ts` | `isOverflow()` |
| 压缩处理 | `session/compaction.ts` | `process()`, `create()` |
| 子任务 | `session/prompt.ts` | `handleSubtask()` |
| Plan 模式 | `session/prompt.ts` | `insertReminders()` |
| System Prompt | `session/system.ts` | `environment()`, `skills()` |
| 指令加载 | `session/instruction.ts` | `system()` |
| 消息转换 | `session/message-v2.ts` | `toModelMessagesEffect()` |
| 工具注册 | `session/prompt.ts` | `resolveTools()` |
| 工具注册表 | `tool/registry.ts` | `tools()` |
| MCP 工具 | `mcp/index.ts` | `tools()` |
| 事件处理 | `session/processor.ts` | `create()`, `process()` |

---

## 阶段四：LLM 通信（流式请求与解析）

```text
时间线 →

Processor (processor.ts)      LLM (session/llm.ts)     Provider Transform        AI SDK / API
    │                              │                         │                        │
    │─handle.process(input)        │                         │                        │
    │                              │                         │                        │
    │  输入:                        │                         │                        │
    │  · system: string[]          │                         │                        │
    │  · messages: ModelMessage[]  │                         │                        │
    │  · tools: Record<string,Tool>│                         │                        │
    │  · model: Provider.Model     │                         │                        │
    │                              │                         │                        │
    │                              │─① 消息转换               │                        │
    │                              │  ProviderTransform      │                        │
    │                              │  .message(msgs, model)  │                        │
    │                              │                         │                        │
    │                              │  ② 温度等参数            │                        │
    │                              │  ProviderTransform      │                        │
    │                              │  .temperature(model)    │                        │
    │                              │                         │                        │
    │                              │  ③ 构建请求 ────────────→│─AI SDK streamText()──→│
    │                              │     system + messages    │                        │
    │                              │     + tools + options    │                        │
    │                              │                          │                        │
    │                              │                          │←── SSE 流 ────────────│
    │                              │                          │                        │
    │                              │                          │  ④ 协议适配器解析      │
    │                              │                          │  protocols/             │
    │                              │                          │  anthropic-messages.ts  │
    │                              │                          │  (或 openai-compat /    │
    │                              │                          │   bedrock-converse)     │
    │                              │                          │                        │
    │                              │                          │  原始事件 → LLMEvent:   │
    │                              │                          │  · text-delta          │
    │                              │                          │  · reasoning-delta     │
    │                              │                          │  · tool-input-start    │
    │                              │                          │  · tool-input-delta    │
    │                              │                          │  · tool-call           │
    │                              │                          │  · finish              │
    │                              │                          │  · provider-error      │
    │                              │                          │                        │
    │←── LLMEvent 流 ──────────────│←─────────────────────────│                        │
    │                              │                          │                        │
    │  ⑤ 事件 → Part 转换:          │                          │                        │
    │                              │                          │                        │
    │  text-delta ──→ TextPart     │                          │                        │
    │  (多个 delta 合并为一个 Part)  │                          │                        │
    │                              │                          │                        │
    │  reasoning-delta              │                          │                        │
    │  ──→ ReasoningPart           │                          │                        │
    │                              │                          │                        │
    │  tool-input-start             │                          │                        │
    │  + tool-input-delta           │                          │                        │
    │  ──→ ToolPart (pending)      │                          │                        │
    │                              │                          │                        │
    │  finish ──→ StepFinishPart   │                          │                        │
    │  (含 tokens, finishReason)   │                          │                        │
    │                              │                          │                        │
    │  provider-error               │                          │                        │
    │  ──→ 错误 Part + 重试/终止    │                          │                        │
    │                              │                          │                        │
    │  ⑥ 返回结果给 runLoop          │                          │                        │
    │  result: "stop" | "compact"   │                          │                        │
```

**涉及文件**：

| 步骤 | 文件 | 核心函数 |
|------|------|---------|
| 入口 | `session/processor.ts` | `process()` |
| LLM 调用 | `session/llm.ts` | `stream()` |
| 消息转换 | `provider/transform.ts` | `message()`, `temperature()` |
| Anthropic 适配 | `packages/llm/src/protocols/anthropic-messages.ts` | 流式解析 |
| OpenAI 适配 | `packages/llm/src/protocols/openai-compatible-chat.ts` | 流式解析 |
| Bedrock 适配 | `packages/llm/src/protocols/bedrock-converse.ts` | 流式解析 |
| 事件累积 | `session/processor.ts` | 内部状态机 (text-delta 合并等) |
| 错误处理 | `session/processor.ts` | `provider-error` → 重试/终止 |

---

## 阶段五：工具执行

当 LLM 返回 `tool_calls` 时，进入工具执行阶段。

```text
时间线 →

Processor                     Tool Runtime (llm)           具体 Tool (tool/*.ts)       Permission
    │                              │                            │                        │
    │  LLM 返回 tool_call          │                            │                        │
    │  (含 name + arguments)       │                            │                        │
    │                              │                            │                        │
    │─① 状态: pending → running    │                            │                        │
    │  更新 ToolPart 状态           │                            │                        │
    │                              │                            │                        │
    │─② 权限检查 ──────────────────────────────────────────────────────────────────────→│
    │                              │                            │                 permission/
    │                              │                            │                 evaluate()
    │                              │                            │                 查找权限键
    │                              │                            │                 (bash/edit/read..)
    │                              │                            │                 检查规则
    │←── 通过/拒绝 ────────────────────────────────────────────────────────────────────│
    │                              │                            │                        │
    │  若拒绝:                      │                            │                        │
    │  ToolPart → error            │                            │                        │
    │  返回 error result 给 LLM     │                            │                        │
    │                              │                            │                        │
    │  若通过:                      │                            │                        │
    │─③ 调度执行 ─────────────────→│                            │                        │
    │                              │─decodeAndExecute()        │                        │
    │                              │                            │                        │
    │                              │  ④ 解码参数                │                        │
    │                              │  tool._decode(args)       │                        │
    │                              │  (JSON → 类型安全输入)     │                        │
    │                              │                            │                        │
    │                              │  ⑤ 执行工具 ─────────────→│                        │
    │                              │                            │─execute(params, ctx)   │
    │                              │                            │                        │
    │                              │                            │  具体工具示例:           │
    │                              │                            │                        │
    │                              │                            │  Bash:                 │
    │                              │                            │   spawn 子进程          │
    │                              │                            │   流式收集 stdout       │
    │                              │                            │   超时保护              │
    │                              │                            │                        │
    │                              │                            │  Read:                 │
    │                              │                            │   读取文件内容           │
    │                              │                            │   触发指令文件发现        │
    │                              │                            │   instruction.resolve() │
    │                              │                            │                        │
    │                              │                            │  Write/Edit:           │
    │                              │                            │   写入/修改文件          │
    │                              │                            │   记录快照 (snapshot)    │
    │                              │                            │                        │
    │                              │                            │  Task:                 │
    │                              │                            │   创建 Subagent Session │
    │                              │                            │   运行子 Agent 循环      │
    │                              │                            │   返回结果给主 Agent     │
    │                              │                            │                        │
    │                              │  ⑥ 编码结果                │                        │
    │                              │  tool._encode(result)     │                        │
    │                              │  (类型安全输出 → JSON)     │                        │
    │                              │                            │                        │
    │←── 执行结果 ─────────────────│                            │                        │
    │                              │                            │                        │
    │  ⑦ 截断输出                   │                            │                        │
    │  Truncate.output()           │                            │                        │
    │  tool/truncate.ts            │                            │                        │
    │                              │                            │                        │
    │  ⑧ 状态: running→completed   │                            │                        │
    │  或 running→error            │                            │                        │
    │                              │                            │                        │
    │  ⑨ 结果注入消息历史            │                            │                        │
    │  作为 tool_result 消息        │                            │                        │
    │                              │                            │                        │
    │  ⑩ 触发下一轮 Step             │                            │                        │
    │  (回到阶段三 ①)               │                            │                        │
```

**涉及文件**：

| 步骤 | 文件 | 核心函数 |
|------|------|---------|
| 权限检查 | `permission/index.ts` | `ask()`, `evaluate()` |
| 工具调度 | `packages/llm/src/tool-runtime.ts` | `decodeAndExecute()` |
| 参数解码 | `packages/llm/src/tool.ts` | `_decode()` |
| 结果编码 | `packages/llm/src/tool.ts` | `_encode()` |
| Bash 执行 | `tool/bash.ts` 或 `tool/shell.ts` | `execute()` |
| 文件读取 | `tool/read.ts` | `execute()` |
| 文件写入 | `tool/write.ts` | `execute()` |
| 文件编辑 | `tool/edit.ts` | `execute()` |
| 子任务 | `tool/task.ts` | `execute()` |
| 输出截断 | `tool/truncate.ts` | `output()` |
| 状态更新 | `session/session.ts` | `updatePart()` |

---

## 阶段六：文件变更与响应输出

```text
时间线 →

runLoop 退出                UI 渲染                   事件系统
    │                         │                         │
    │─返回最终 Assistant       │                         │
    │  Message (含所有 Part)   │                         │
    │                         │                         │
    │                         │  CLI (run.ts):           │
    │                         │  ┌─ text Part → 终端输出  │
    │                         │  ├─ tool Part → 内联展示  │
    │                         │  │   (tool.ts TOOL_RULES) │
    │                         │  │   图标+标题+耗时        │
    │                         │  ├─ reasoning Part        │
    │                         │  │   → 斜体灰色展示        │
    │                         │  └─ step-finish Part      │
    │                         │     → Footer 状态更新     │
    │                         │                         │
    │                         │  Web (app):              │
    │                         │  ┌─ 消息时间线更新         │
    │                         │  ├─ Diff 展示             │
    │                         │  ├─ 上下文用量更新         │
    │                         │  └─ 成本统计更新           │
    │                         │                         │
    │                         │─事件发布────────────────→│
    │                         │                         │─bus.publish()
    │                         │                         │  message.updated
    │                         │                         │  message.part.updated
    │                         │                         │  session.status → idle
    │                         │                         │
    │                         │                         │─sync 持久化
    │                         │                         │  sync/index.ts
    │                         │                         │  SQLite 写入
    │                         │                         │
    │                         │                         │─日志记录
    │                         │                         │  util/log.ts
    │                         │                         │  OTel Span 结束
```

**涉及文件**：

| 步骤 | 文件 | 核心函数 |
|------|------|---------|
| CLI 渲染 | `cli/cmd/run.ts` | `loop()` 事件消费 |
| 工具 UI | `cli/cmd/run/tool.ts` | `TOOL_RULES`, `toolInlineInfo()` |
| Footer | `cli/cmd/run/footer.view.tsx` | `RunFooterView` |
| Web 渲染 | `packages/app/src/pages/session/` | `MessageTimeline` 等 |
| 事件持久化 | `sync/index.ts` | 投影器 (Projector) |
| 日志 | `packages/core/src/util/log.ts` | `logger.info()` |
| 可观测性 | `packages/core/src/effect/observability.ts` | `withRunSpan()` |

---

## 完整调用链速查

从用户输入到代码生成的**完整函数调用链**：

```text
CLI 入口
  cli/cmd/run.ts::resolveRunInput()
  → cli/cmd/run/runtime.ts::runInteractiveLocalMode()
    → cli/cmd/run.ts::session()
      → sdk.session.create() / sdk.session.get()

HTTP 路由
  server/routes/instance/httpapi/handlers/session.ts
    → session/prompt.ts::Service.prompt()
      → session/prompt.ts::createUserMessage()
        → agent/agent.ts::agents.get()
        → provider/provider.ts::getModel()
        → session/prompt.ts::resolvePart()
          → tool/read.ts::execute()  (文件引用时)
          → mcp/index.ts::readResource()  (MCP 资源时)
        → session/session.ts::updateMessage() + updatePart()
        → bus/index.ts::publish()  (事件发布)

      → session/prompt.ts::runLoop()  ← 核心循环
        ├─ session/message-v2.ts::filterCompactedEffect()
        ├─ session/compaction.ts::isOverflow()
        ├─ session/system.ts::environment() + skills()
        ├─ session/instruction.ts::system()
        ├─ session/message-v2.ts::toModelMessagesEffect()
        ├─ session/prompt.ts::resolveTools()
        │   ├─ tool/registry.ts::tools()
        │   └─ mcp/index.ts::tools()
        ├─ session/processor.ts::create() + process()
        │   └─ session/llm.ts::stream()
        │       ├─ provider/transform.ts::message()
        │       └─ packages/llm/src/protocols/anthropic-messages.ts
        │           (或 openai-compatible-chat / bedrock-converse)
        │           → LLMEvent 流 → Part 转换
        ├─ [若有 tool_calls]
        │   ├─ permission/index.ts::ask()
        │   ├─ packages/llm/src/tool-runtime.ts::decodeAndExecute()
        │   │   └─ tool/*.ts::execute()
        │   └─ tool/truncate.ts::output()
        └─ [循环直到 finish="stop"]

      → session/compaction.ts::prune()
      → 返回 MessageV2.WithParts

UI 渲染
  cli/cmd/run.ts::loop() 事件消费
    → cli/cmd/run/tool.ts::toolInlineInfo()  (工具展示)
    → cli/cmd/run/footer.view.tsx  (状态栏)

事件持久化
  sync/index.ts  投影器 → SQLite
  bus/index.ts   事件总线 → 多消费者
```

---

## 关键数据流

```text
用户输入 (字符串)
    │
    ▼
PromptInput { sessionID, parts: Part[], agent, model }
    │
    ▼
MessageV2.User { id, role:"user", parts: Part[] }
    │
    ▼
ModelMessage[] (AI SDK 格式)
    │  + System Prompt (string[])
    │  + Tools (Record<string, AITool>)
    ▼
LLM API Stream (SSE)
    │
    ▼
LLMEvent[] (text-delta, tool-call, finish...)
    │
    ▼
MessageV2.Assistant { parts: Part[] }
    │  ├─ TextPart (AI 文本回复)
    │  ├─ ReasoningPart (AI 推理过程)
    │  ├─ ToolPart (工具调用及结果)
    │  └─ StepFinishPart (Token 消耗等)
    ▼
UI 渲染 + 事件持久化 + 日志记录
```

---

## 辅助阅读

| 深度解析 | 路径 |
|---------|------|
| Agent 运行循环详解 | `docs/book/chapter-03-agent-loop.md` |
| 工具系统详解 | `docs/book/chapter-04-tool-system.md` |
| 上下文管理详解 | `docs/book/chapter-05-context-management.md` |
| Memory 体系详解 | `docs/book/chapter-06-memory-system.md` |
| 多 Agent 协作详解 | `docs/book/chapter-09-multi-agent.md` |
| 开发者文档 | `docs/development/` |
| 注释源码 | `docs/code-annotated/src/` |
| 学习路线 | `docs/development/LEARNING-GUIDE.md` |
