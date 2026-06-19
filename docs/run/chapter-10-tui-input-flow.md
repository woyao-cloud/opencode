# 第 10 章 · TUI 用户输入到 Agent 响应的完整调用链

## 10.1 场景概述

这是 opencode 中最完整的端到端流程——用户在终端界面（TUI）的 Prompt 输入框中键入指令、按下回车，直到 AI 的流式响应逐字出现在屏幕上。整个流程跨越主线程（TUI 渲染）和 Worker 线程（HTTP 服务端 + Agent 运行循环），涉及 RPC 通信、SDK 调用、Session 管理、Effect-TS 运行时、LLM 流式通信和 TUI 事件消费。

理解这个流程等于理解 opencode 的"全景图"——它是前 9 章所有 Effect 触发场景的串联。本章按时间顺序追踪从键盘按下到响应渲染的每一个环节。

## 10.2 触发流程

### 阶段一：用户在 TUI 中输入并按下回车

```text
用户键入 "帮我修复 src/auth 下的类型错误"
    │
    │  按下 Enter
    ▼
┌─ Prompt 组件 (cli/cmd/tui/component/prompt/index.tsx) ──────┐
│                                                               │
│  keymap 绑定 "prompt.submit" → submit()                       │
│                                                               │
│  submit() ──→ submitInner()                                   │
│    ① 防重复提交: submitting 标志位                             │
│    ② 同步 IME 输入: input.plainText → store.prompt.input      │
│    ③ 验证: disabled? workspaceCreating? input为空? agent?     │
│    ④ 特殊命令: exit/quit/:q → 退出                             │
│    ⑤ 检查 Workspace 状态 (workspaceStatus)                    │
│    ⑥ 确定 Session: 有 sessionID → 复用                         │
│                    无 sessionID → sdk.client.session.create()  │
│    ⑦ 确定模式:                                                │
│       · mode="shell"  → sdk.client.session.shell()            │
│       · 以 "/" 开头且匹配命令 → sdk.client.session.command()   │
│       · 普通文本        → sdk.client.session.prompt()          │
│    ⑧ 组装 parts: [editorContext, textPart, ...fileParts]      │
│    ⑨ 发送请求 (通过 SDK → Worker RPC)                         │
│    ⑩ 清空输入框 + 路由导航到 Session 页面                      │
└───────────────────────────────────────────────────────────────┘
```

### 阶段二：SDK → RPC → Worker 线程

```text
主线程 (Prompt 组件)               Worker 线程 (worker.ts)
    │                                      │
    │─sdk.client.session.prompt({...})     │
    │                                      │
    │  这是 @opencode-ai/sdk 的调用         │
    │  → POST /session/{id}/message        │
    │                                      │
    │  但 fetch 被代理了!                    │
    │  createWorkerFetch(client) 将         │
    │  fetch 请求转为 RPC 调用              │
    │                                      │
    │─client.call("fetch", {...})─────────→│─Rpc.server 处理
    │                                      │  执行实际 HTTP 请求
    │                                      │  → http://localhost:4096
    │                                      │    POST /session/{id}/message
    │                                      │
    │                                      │─server/routes/.../session.ts
    │                                      │  路由匹配 → Handler
    │                                      │
    │                                      │─session/prompt.ts
    │                                      │  SessionPrompt.prompt()
    │                                      │  (进入 Effect 世界!)
    │                                      │
    │                                      │  → createUserMessage()
    │                                      │  → runLoop()  (核心循环)
    │                                      │  → LLM 流式调用
    │                                      │  → 工具执行...
    │                                      │
    │                                      │  返回: MessageV2.WithParts
    │                                      │
    │←── HTTP Response ────────────────────│
    │    (Assistant Message)               │
    │                                      │
    │  SDK 解析响应 → 返回给 Prompt 组件     │
```

### 阶段三：TUI 实时消费流式事件

```text
Sync Context (cli/cmd/tui/context/sync.tsx)
    │
    │  通过 EventSource 订阅 Worker 的全局事件
    │  createEventSource(client) → client.on("global.event")
    │
    ▼
┌─ 事件循环 ──────────────────────────────────────────────────┐
│                                                               │
│  Worker 发布事件 → RPC 推送 → 主线程 EventSource 接收        │
│                                                               │
│  message.part.updated 事件:                                   │
│  ┌─ text Part (time.end 存在) → 渲染到消息时间线              │
│  ├─ reasoning Part → 斜体灰色展示 "Thinking: ..."            │
│  ├─ tool Part (status=completed) → 工具内联展示               │
│  │   toolInlineInfo(part) → 图标+标题+耗时                    │
│  ├─ tool Part (status=error) → ✗ 错误展示                    │
│  ├─ step-start → Footer 状态更新                             │
│  ├─ step-finish → Footer 状态更新 + Token 统计               │
│  └─ tool Part (tool=task, status=running) → 子任务展示       │
│                                                               │
│  session.status 事件:                                         │
│  ┌─ type="idle" → Agent 循环结束，退出事件循环               │
│  └─ type="busy" → Agent 正在处理                             │
│                                                               │
│  session.error 事件:                                          │
│  └─ 收集错误信息 → UI.error(err)                              │
│                                                               │
│  permission.asked 事件:                                       │
│  └─ 展示权限请求 → 用户选择 → client.permission.reply()      │
└───────────────────────────────────────────────────────────────┘
```

### 阶段四：Worker 线程内部（Agent 运行循环）

```text
Worker 线程 — 这是前面阶段二的内部展开:

session/prompt.ts::prompt()
    │
    ▼
┌─ createUserMessage (Effect.gen) ─────────────────────────────┐
│  ① 查找 Agent → Agent.Service.get(agentName)                 │
│  ② 确定 Model → Provider.Service.getModel()                  │
│  ③ 组装 Part → resolvePart() 逐条解析                         │
│     · type:"text"  → TextPart                                │
│     · type:"file"  → 读取文件内容 (Read tool)                 │
│     · type:"agent" → AgentPart + 提示词注入                   │
│  ④ 保存消息 → Session.updateMessage/updatePart               │
│  ⑤ 发布事件 → Bus.publish(AgentSwitched/ModelSwitched)       │
└───────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ runLoop (Effect.gen) ───────────────────────────────────────┐
│                                                               │
│  ╔═══════ STEP 1 ═══════════════════════════════════════╗     │
│  ║ ① 加载消息 (filterCompactedEffect)                    ║     │
│  ║ ② 检查退出条件 (lastAssistant.finish?)                 ║     │
│  ║ ③ 检测上下文溢出 (compaction.isOverflow)               ║     │
│  ║ ④ 组装 System Prompt                                  ║     │
│  ║    Effect.all([environment, instructions, skills])     ║     │
│  ║ ⑤ 转换消息格式 (toModelMessagesEffect)                ║     │
│  ║ ⑥ 注册工具 (resolveTools)                             ║     │
│  ║ ⑦ 创建 Processor Handle                               ║     │
│  ║ ⑧ 调用 LLM ────→ processor.process()                 ║     │
│  ║    ┌─ provider/transform.ts::message()                 ║     │
│  ║    ├─ session/llm.ts::stream()                         ║     │
│  ║    └─ protocols/anthropic-messages.ts (SSE 解析)       ║     │
│  ║ ⑨ LLM 返回 text-delta → 实时发布 Part 更新事件         ║     │
│  ║    这些事件通过 Bus → sync → Worker → RPC → 主线程     ║     │
│  ║    → TUI 实时渲染 AI 逐字输出!                          ║     │
│  ║ ⑩ finish_reason = "stop" → break (退出循环)           ║     │
│  ╚════════════════════════════════════════════════════════╝     │
│                                                               │
│  如果有 tool_calls → 进入阶段五 (工具执行) → 回到 ①           │
│                                                               │
│  循环退出:                                                     │
│  → compaction.prune (后台清理)                                 │
│  → lastAssistant (返回最终消息)                                │
│  → 发布 session.status: idle                                  │
└───────────────────────────────────────────────────────────────┘
```

### 阶段五：工具执行（当 LLM 返回 tool_calls 时）

```text
LLM 返回 finish_reason="tool_calls"
    │
    ▼
┌─ 工具调度 ───────────────────────────────────────────────────┐
│                                                               │
│  ① 权限检查 → permission/index.ts::ask()                     │
│     · 如果需要用户确认 → 发布 permission.asked 事件           │
│     · 主线程展示权限对话框 → 用户选择 → permission.reply()   │
│                                                               │
│  ② 参数解码 → packages/llm/src/tool-runtime.ts               │
│     decodeAndExecute(tool, call)                              │
│     · tool._decode(args) → 类型安全输入                       │
│                                                               │
│  ③ 工具执行 → tool/*.ts::execute()                            │
│     例如 Edit 工具:                                            │
│     ┌─ 读取目标文件                                           │
│     ├─ 定位 old_string                                        │
│     ├─ 替换为 new_string                                      │
│     ├─ 写入文件                                               │
│     └─ 记录快照 (snapshot)                                    │
│                                                               │
│  ④ 结果编码 → tool._encode(result) → JSON                    │
│                                                               │
│  ⑤ 输出截断 → tool/truncate.ts::output()                     │
│                                                               │
│  ⑥ 状态更新 → ToolPart: running → completed                  │
│     → 发布 message.part.updated 事件                          │
│     → TUI 实时展示工具执行结果                                 │
│                                                               │
│  ⑦ 结果注入 → tool_result 消息追加到对话历史                  │
│     → 回到 runLoop ① (下一轮 Step)                            │
└───────────────────────────────────────────────────────────────┘
```

## 10.3 关键触发点详解

### 触发点 1：submitInner — TUI 输入的核心分发逻辑

**文件**：`cli/cmd/tui/component/prompt/index.tsx:1010-1226`

```typescript
async function submitInner() {
  // ① 防重复提交
  if (submitting) return false

  // ② 同步 IME 输入
  if (input && !input.isDestroyed && input.plainText !== store.prompt.input) {
    setStore("prompt", "input", input.plainText)
  }

  // ③ 验证
  if (props.disabled) return false
  if (!store.prompt.input) return false
  const agent = local.agent.current()
  if (!agent) return false

  // ④ 特殊命令
  const trimmed = store.prompt.input.trim()
  if (trimmed === "exit" || trimmed === "quit" || trimmed === ":q") {
    void exit()
    return true
  }

  // ⑤ 确定 Session (复用或创建)
  let sessionID = props.sessionID
  if (sessionID == null) {
    const res = await sdk.client.session.create({
      agent: agent.name,
      model: { providerID, id: modelID, variant },
    })
    sessionID = res.data.id
  }

  // ⑥ 按模式分发
  if (store.mode === "shell") {
    // Shell 模式: 直接执行命令
    void sdk.client.session.shell({ sessionID, command: inputText, ... })
  } else if (inputText.startsWith("/") && 匹配命令) {
    // 斜杠命令: /compact, /agent, /commit 等
    void sdk.client.session.command({ sessionID, command, arguments: args, ... })
  } else {
    // 普通文本: 发送给 AI
    sdk.client.session.prompt({
      sessionID,
      agent: agent.name,
      model: selectedModel,
      variant,
      parts: [
        ...editorParts,              // 编辑器选中内容
        { type: "text", text: inputText },  // 用户输入
        ...nonTextParts.map(assign), // 文件引用等
      ],
    })
  }

  // ⑦ 清空输入 + 导航
  setStore("prompt", { input: "", parts: [] })
  route.navigate({ type: "session", sessionID })
}
```

**自然语言解释**：`submitInner` 是 TUI 输入的分发中枢。用户按下回车后，它依次执行：防重复提交保护、IME 输入同步（处理韩文等组合字符）、状态验证（是否禁用、是否为空、Agent 是否选定）、特殊命令识别（exit/quit/:q）、Session 创建或复用。然后根据输入模式分三路：Shell 模式直接执行命令、斜杠命令模式路由到 `/compact` 等命令处理器、普通文本模式通过 `sdk.client.session.prompt()` 发送给 AI。最后清空输入框并导航到 Session 页面。

### 触发点 2：SDK → RPC → Worker 的跨线程调用

**文件**：`cli/cmd/tui/thread.ts:31-47`（createWorkerFetch）

```typescript
function createWorkerFetch(client: RpcClient): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    const body = request.body ? await request.text() : undefined
    const result = await client.call("fetch", {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
    })
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    })
  }
}
```

**自然语言解释**：TUI 主线程中的 `sdk.client.session.prompt()` 调用最终会发起 HTTP 请求（`POST /session/{id}/message`）。但主线程不直接执行 HTTP 请求——`createWorkerFetch` 将 `fetch` 函数替换为 RPC 代理：每个 HTTP 请求被序列化为 JSON，通过 `client.call("fetch", {...})` 发送给 Worker 线程，Worker 执行实际的 HTTP 请求后将结果序列化返回。这套机制让 HTTP 通信完全在 Worker 线程中进行，主线程只负责 UI 渲染。

### 触发点 3：TUI 事件消费 — 流式响应实时渲染

**文件**：`cli/cmd/run.ts:611-731`（loop 函数）

```typescript
async function loop(client, events) {
  for await (const event of events.stream) {
    // ① Assistant 消息开始 → 显示 Agent + Model 信息
    if (event.type === "message.updated" &&
        event.properties.info.role === "assistant") {
      UI.println(`> ${event.properties.info.agent} · ${modelID}`)
    }

    // ② Part 更新 → 实时渲染
    if (event.type === "message.part.updated") {
      const part = event.properties.part

      // 文本 Part → 终端输出
      if (part.type === "text" && part.time?.end) {
        UI.println(text)  // AI 逐字输出!
      }

      // 推理 Part → 斜体灰色
      if (part.type === "reasoning" && part.time?.end) {
        UI.println(`Thinking: ${text}`)  // 思考过程
      }

      // 工具 Part → 内联展示
      if (part.type === "tool" && part.state.status === "completed") {
        tool(part)  // → toolInlineInfo → 图标+标题+耗时
      }

      // Step 开始/结束 → Footer 更新
      if (part.type === "step-start") { /* ... */ }
      if (part.type === "step-finish") { /* ... */ }
    }

    // ③ Session 错误 → 错误展示
    if (event.type === "session.error") {
      UI.error(err)
    }

    // ④ Session 空闲 → 退出循环
    if (event.type === "session.status" &&
        event.properties.status.type === "idle") {
      break
    }

    // ⑤ 权限请求 → 自动回复或提示
    if (event.type === "permission.asked") {
      await client.permission.reply({ requestID, reply: "once" })
    }
  }
}
```

**自然语言解释**：CLI 模式下的事件循环（`cli/cmd/run.ts`）展示了 TUI 如何实时消费流式事件。`for await (const event of events.stream)` 是一个异步迭代器——每当 Worker 产生新事件，主线程立即收到并渲染。文本 Part 被直接输出到终端（AI 的逐字输出效果），推理 Part 以斜体灰色展示（"AI 在想什么"），工具 Part 通过 `toolInlineInfo` 渲染为带图标和耗时的一行信息，Step 事件更新 Footer 状态栏。当收到 `session.status: idle` 时循环退出——表示 Agent 已完成当前任务。

在 TUI（React/Ink）模式下，事件消费逻辑在 `cli/cmd/tui/context/sync.tsx` 中——它通过 `event.subscribe()` 订阅 Worker 推送的全局事件，更新 SolidJS store，触发 UI 组件树的响应式重渲染。

### 触发点 4：Worker 内部的完整 Effect 链

**文件**：`session/prompt.ts`（第 3 章详细展开）

Worker 收到 HTTP 请求后的处理流程已在第 3 章（Agent 运行循环）和第 4 章（工具执行）中详细展开，此处简要概括：

```text
HTTP POST /session/{id}/message
  → server/routes/.../session.ts (路由)
    → session/prompt.ts::prompt()
      → createUserMessage() (Effect.gen)
      → runLoop() (Effect.gen, while true)
        → resolveTools() (Effect.gen)
        → processor.process() (Effect.gen)
          → session/llm.ts::stream() (Effect.gen)
            → provider/transform.ts::message()
            → AI SDK streamText() → SSE 流
            → protocols/anthropic-messages.ts (解析)
            → LLMEvent → Part 转换
        → [tool_calls] → tool-runtime.ts::decodeAndExecute()
          → tool/*.ts::execute() (Effect.gen)
        → [finish=stop] → break
      → 返回 MessageV2.WithParts
```

### 触发点 5：Session 创建 — SDK 调用到数据库写入

**文件**：`cli/cmd/tui/component/prompt/index.tsx:1072-1093`

```typescript
const res = await sdk.client.session.create({
  workspace: workspaceID,
  agent: agent.name,
  model: {
    providerID: selectedModel.providerID,
    id: selectedModel.modelID,
    variant,
  },
})

if (res.error) {
  toast.show({ message: "Creating a session failed.", variant: "error" })
  return true
}

sessionID = res.data.id
```

**自然语言解释**：当用户在新会话中输入第一条消息时（`sessionID == null`），TUI 首先调用 `sdk.client.session.create()` 创建 Session。这个调用经过 RPC → Worker → HTTP API → `session/session.ts::create()` → SQLite 写入。Session 创建成功后返回 `sessionID`，后续的 `prompt()` 调用使用这个 ID。如果创建失败（如 Workspace 不可用），显示错误 Toast 并中止。

## 10.4 涉及的关键文件索引

| 阶段 | 文件 | 核心函数 | 线程 |
|------|------|---------|------|
| 输入捕获 | `cli/cmd/tui/component/prompt/index.tsx` | `submit()`, `submitInner()` | 主线程 |
| SDK 调用 | `packages/sdk/js/src/v2/gen/sdk.gen.ts` | `session.prompt()` | 主线程 |
| RPC 代理 | `cli/cmd/tui/thread.ts` | `createWorkerFetch()` | 主线程 |
| RPC 处理 | `cli/cmd/tui/worker.ts` | `Rpc.server()` | Worker |
| HTTP 路由 | `server/routes/instance/httpapi/handlers/session.ts` | Handler | Worker |
| 会话 Prompt | `session/prompt.ts` | `prompt()`, `runLoop()` | Worker |
| LLM 通信 | `session/llm.ts`, `provider/transform.ts` | `stream()`, `message()` | Worker |
| 协议解析 | `packages/llm/src/protocols/anthropic-messages.ts` | 流式解析 | Worker |
| 事件处理 | `session/processor.ts` | `process()` | Worker |
| 工具执行 | `tool/*.ts`, `packages/llm/src/tool-runtime.ts` | `execute()`, `decodeAndExecute()` | Worker |
| 事件持久化 | `sync/index.ts` | Projector | Worker |
| 事件推送 | `bus/index.ts` → `GlobalBus` → RPC | `publish()` | Worker |
| TUI 事件消费 | `cli/cmd/tui/context/sync.tsx` | `event.subscribe()` | 主线程 |
| CLI 事件消费 | `cli/cmd/run.ts` | `loop()` | 主线程 |
| UI 渲染 | `cli/cmd/tui/routes/session/index.tsx` | React/Ink 组件树 | 主线程 |

## 10.5 涉及的 Effect 方法

本章串联了前 9 章的所有 Effect 触发场景，涉及的 Effect 方法包括：

- **TUI → Worker 跨线程**：无直接 Effect 触发（RPC 是 Promise 级别）
- **Worker 初始化**：`AppRuntime.runPromise`（第 9 章）
- **HTTP 路由 → Handler**：`Layer.effect`, `Effect.provideService`（第 2 章）
- **SessionPrompt.prompt**：`Effect.gen`, `Effect.forEach`（第 6 章）
- **runLoop**：`Effect.gen`, `Effect.all`, `Effect.forkIn`, `Latch`, `Effect.onInterrupt`（第 3 章）
- **LLM 通信**：`Effect.gen`, `Stream.runForEach`（第 3 章）
- **工具执行**：`EffectBridge.promise`, `Effect.promise`, `Effect.catchCause`（第 4 章）
- **事件总线**：`makeRuntime`, `Stream.runForEach`, `Queue.offerUnsafe`（第 5 章）
- **桥接层**：`EffectBridge.make()`, `bridge.promise`（第 8 章）

## 10.6 本章小结

从用户在 TUI 中按下回车到 AI 响应逐字出现在屏幕上，整个流程跨越两个线程、经过 15+ 个关键文件：

1. **主线程**：Prompt 组件捕获输入 → SDK 调用 → RPC 代理转发到 Worker
2. **Worker 线程**：HTTP 路由 → SessionPrompt.prompt() → runLoop() → LLM 流式调用 → 事件发布
3. **事件回流**：Worker 的事件通过 Bus → GlobalBus → RPC → EventSource → 主线程 TUI 渲染

整个过程是异步流式的——AI 每生成几个字，事件就推送到主线程，UI 立即更新。这种"边说边显示"的体验正是由 Effect-TS 的 Stream 和 opencode 的双线程 RPC 架构共同实现的。理解这个流程等于掌握了 opencode 的"全景图"。
