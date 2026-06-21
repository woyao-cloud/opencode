# 第 3 章 · Agent 运行循环

## 3.1 场景概述

Agent 运行循环是 opencode 中最复杂、最核心的 Effect 触发场景。一次用户消息可能触发多轮 LLM 调用（Step），每轮调用涉及：消息加载、溢出检测、System Prompt 组装、工具注册、LLM 流式通信、事件处理、工具执行、结果注入。整个循环是一个巨大的 `Effect.gen`，内部嵌套了多个子 Effect 和 Stream 操作。

为什么需要 Effect？运行循环需要管理大量副作用——数据库读写、HTTP 请求、子进程管理、文件操作、并发控制。Effect 的生成器语法（`Effect.gen`）让复杂的异步流程以同步风格编写，而结构化并发（Fiber、Latch、Scope）确保子任务的生命周期受父任务控制。

## 3.2 触发流程

```text
SessionPrompt.prompt() 被调用
    │
    ▼
┌─ createUserMessage (Effect.gen) ───────────────────────────┐
│  ① 解析 Agent → Agent.Service                              │
│  ② 解析 Model → Provider.Service                           │
│  ③ 组装 Part → resolvePart() (Effect.forEach 并发)        │
│  ④ 保存消息 → Session.updateMessage/updatePart             │
│  ⑤ 发布事件 → Bus.publish                                   │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ runLoop (Effect.gen) — 核心循环 ─────────────────────────┐
│                                                            │
│  ╔═══════ STEP 迭代 ═══════════════════════════════════╗   │
│  ║                                                      ║   │
│  ║ ① 加载消息 (filterCompactedEffect)                    ║   │
│  ║ ② 检查退出条件 (finish="stop" 且无 tool_calls)        ║   │
│  ║ ③ 处理 SubTask/Compaction 任务                        ║   │
│  ║ ④ 检测上下文溢出 (compaction.isOverflow)              ║   │
│  ║ ⑤ 插入提醒 (insertReminders)                          ║   │
│  ║ ⑥ 组装 System Prompt                                  ║   │
│  ║    Effect.all([sys.environment, instruction.system,   ║   │
│  ║                sys.skills])                            ║   │
│  ║ ⑦ 转换消息格式 (toModelMessagesEffect)                ║   │
│  ║ ⑧ 注册工具 (resolveTools)                             ║   │
│  ║ ⑨ 创建 Processor Handle                               ║   │
│  ║ ⑩ 调用 LLM (handle.process)                           ║   │
│  ║    → 见第 4 章工具执行                                  ║   │
│  ║ ⑪ 处理结果: stop→break / tool_calls→continue          ║   │
│  ║                                                      ║   │
│  ╚══════════════════════════════════════════════════════╝   │
│                                                            │
│  退出后: compaction.prune (Effect.forkIn 后台执行)          │
│  返回: lastAssistant (最终的 Assistant Message)             │
└────────────────────────────────────────────────────────────┘
```

## 3.3 关键触发点详解

### 触发点 1：runLoop — 整个循环是一个 Effect.gen

**文件**：`session/prompt.ts:1643-1875`

```typescript
const runLoop = Effect.fn("SessionPrompt.run")(
  function* (sessionID: SessionID) {
    // ... 初始化 ...
    while (true) {
      yield* status.set(sessionID, { type: "busy" })
      // 加载消息、检查退出、处理任务、检测溢出...
      
      const [skills, env, instructions, modelMsgs] = yield* Effect.all([
        sys.skills(agent),
        sys.environment(model),
        instruction.system().pipe(Effect.orDie),
        MessageV2.toModelMessagesEffect(msgs, model),
      ])
      
      const result = yield* handle.process({...})
      
      if (result === "stop") return "break"
      // ... 继续循环 ...
    }
    yield* compaction.prune({ sessionID }).pipe(
      Effect.ignore, Effect.forkIn(scope)
    )
    return yield* lastAssistant(sessionID)
  }
)
```

**自然语言解释**：`runLoop` 是整个 opencode 最核心的 Effect 函数。它使用 `Effect.fn` 定义（`Effect.gen` 的命名版本），内部是一个 `while(true)` 循环。每次迭代中，通过 `yield*` 依次执行：设置状态为 busy → 加载消息 → 检查退出条件 → 处理子任务 → 检测溢出 → 组装 System Prompt → 注册工具 → 调用 LLM → 处理结果。`Effect.all` 并发执行四个独立的准备操作（skills、environment、instructions、消息转换），而不是串行等待。循环退出后，`compaction.prune` 通过 `Effect.forkIn(scope)` 在后台异步执行，不阻塞主流程。

### 触发点 2：Effect.all — 并发准备 System Prompt

**文件**：`session/prompt.ts:1812-1817`

```typescript
const [skills, env, instructions, modelMsgs] = yield* Effect.all([
  sys.skills(agent),
  sys.environment(model),
  instruction.system().pipe(Effect.orDie),
  MessageV2.toModelMessagesEffect(msgs, model),
])
```

**自然语言解释**：在发送 LLM 请求之前，需要准备四样东西：Skill 提示词、环境信息（日期/OS/Git 状态）、指令文件内容、转换后的消息列表。这四个操作互不依赖，可以并发执行。`Effect.all` 接收一个 Effect 数组，并发执行所有 Effect，等全部完成后返回结果数组。这比串行执行快得多——如果每个操作需要 100ms，串行需要 400ms，并发只需要约 100ms。

### 触发点 3：Stream.runForEach — Shell 输出流消费

**文件**：`session/prompt.ts:1027`

```typescript
yield* Stream.runForEach(
  Stream.decodeText(handle.all),
  (chunk) =>
    Effect.gen(function* () {
      output += chunk
      if (part.state.status === "running") {
        part.state.metadata = { output, description: "" }
        yield* sessions.updatePart(part)
      }
    })
)
```

**自然语言解释**：当用户触发 Shell 命令执行时，命令的输出是一个流（Stream）——输出不是一次性到达的，而是持续产生的。`Stream.decodeText` 将子进程的二进制输出解码为文本流，`Stream.runForEach` 对流中的每个文本块执行回调 Effect：将文本追加到 output 变量，并更新 Part 的状态（让 UI 实时看到命令输出）。这是 Effect Stream 的典型使用模式——将流式数据源与 Effect 副作用（更新数据库）连接起来。

### 触发点 4：Effect.forkIn — 后台异步任务

**文件**：`session/prompt.ts:1683-1688,1872`

```typescript
// 标题生成：不阻塞主流程
yield* title({...}).pipe(
  Effect.ignore,    // 忽略结果
  Effect.forkIn(scope)  // 在 Scope 中 fork
)

// 压缩清理：循环结束后后台执行
yield* compaction.prune({ sessionID }).pipe(
  Effect.ignore,
  Effect.forkIn(scope)
)
```

**自然语言解释**：有些操作不需要阻塞主流程——比如自动生成会话标题、清理过期压缩数据。`Effect.forkIn(scope)` 将 Effect 作为一个独立的 Fiber（轻量级线程）在指定的 Scope 中启动，主流程继续执行而不等待它完成。`Effect.ignore` 表示"我不关心这个 Effect 的结果（成功或失败都忽略）"。Scope 管理所有 fork 出的 Fiber 的生命周期——当 Scope 关闭时，所有未完成的 Fiber 被自动中断。

### 触发点 5：Latch — Shell 执行的同步屏障

**文件**：`session/prompt.ts:1886-1887`

```typescript
const ready = yield* Latch.make()
return yield* state.startShell(
  input.sessionID,
  lastAssistant(input.sessionID),
  shellImpl(input, ready),
  ready
)
```

**自然语言解释**：Shell 命令执行有一个特殊需求：必须先向用户返回"命令已开始执行"的响应，然后再执行实际的命令。`Latch`（门闩）是 Effect 的同步原语——`shellImpl` 在准备好后打开门闩（`ready.open`），而 `startShell` 等待门闩打开后才返回响应。这确保了响应先返回，命令执行在后台继续。Latch 只能打开一次，是一种轻量级的"一次性信号"。

### 触发点 6：Effect.onInterrupt — 中断清理

**文件**：`session/prompt.ts:1758-1764`

```typescript
const handle = yield* processor
  .create({ assistantMessage: msg, sessionID, model })
  .pipe(
    Effect.onInterrupt(() => finalizeInterruptedAssistant)
  )
```

**自然语言解释**：当用户取消操作（如按 Ctrl+C）时，正在执行的 Effect 会被中断。`Effect.onInterrupt` 注册一个清理回调——当中断发生时，执行 `finalizeInterruptedAssistant` 来标记 Assistant Message 为已完成（设置 `time.completed` 和可能的错误信息），确保即使被中断，消息状态也是一致的。这是 Effect 结构化并发的重要特性——每个 Effect 都可以注册中断时的清理逻辑。

## 3.4 涉及的 Effect 方法

### `Effect.gen(function* () { ... })` / `Effect.fn(name, function* () { ... })`
**作用**：创建生成器风格的 Effect。`Effect.fn` 是命名版本，便于调试和追踪。

**本章使用场景**：`runLoop` 整个循环、`createUserMessage`、`handleSubtask` 等几乎所有核心函数。

### `Effect.all(effects)`
**作用**：并发执行多个 Effect，等全部完成后返回结果数组。如果任何一个失败，整体失败。

**本章使用场景**：并发准备 System Prompt 的四个组成部分。

### `Effect.forEach(iterable, fn, options)`
**作用**：对可迭代对象中的每个元素执行 Effect 函数。支持 `concurrency` 选项控制并发数。

**本章使用场景**：`resolvePart` 中并发解析用户输入的多个 Part。

### `Stream.runForEach(stream, fn)`
**作用**：消费流中的每个元素，对每个元素执行回调 Effect。返回一个 Effect，在流结束时完成。

**本章使用场景**：Shell 命令输出的实时消费、Ripgrep 搜索结果的逐行处理。

### `Stream.runDrain(stream)`
**作用**：消费流中的所有元素但不处理它们（"排空"流）。用于需要驱动流执行但不关心每个元素的场景。

**本章使用场景**：`processor.ts` 中驱动 LLM 事件流但不逐个处理。

### `Effect.forkIn(scope)`
**作用**：在指定 Scope 中将 Effect 作为独立 Fiber 启动。主流程不等待它完成。

**本章使用场景**：标题生成、压缩清理等后台任务。

### `Effect.ignore`
**作用**：忽略 Effect 的结果（成功或失败都转为成功）。用于"fire-and-forget"场景。

**本章使用场景**：配合 `forkIn` 使用，表示不关心后台任务的结果。

### `Effect.onInterrupt(callback)`
**作用**：注册中断时的清理回调。当 Effect 被中断（如用户取消）时执行。

**本章使用场景**：Processor Handle 创建时注册清理逻辑。

### `Latch.make()` / `latch.open` / `latch.await`
**作用**：Latch 是一次性的同步信号。`open` 打开门闩，`await` 等待门闩打开。

**本章使用场景**：Shell 执行的"先响应再执行"同步。

### `Effect.exit`
**作用**：执行 Effect 并返回 `Exit` 对象（Success 或 Failure），不抛出异常。

**本章使用场景**：模型查找——失败时不抛异常，而是检查 Exit 类型。

### `Exit.isFailure(exit)` / `Cause.squash(cause)`
**作用**：检查 Exit 是否为失败，从 Cause 中提取原始错误。

**本章使用场景**：模型查找失败时提取错误信息。

## 3.5 本章小结

Agent 运行循环是 opencode 中 Effect 使用最密集的场景。整个循环是一个巨大的 `Effect.gen`，内部使用 `Effect.all` 并发准备数据、`Stream.runForEach` 消费流式输出、`Effect.forkIn` 启动后台任务、`Latch` 同步异步操作、`Effect.onInterrupt` 处理取消。这些 Effect 方法共同构成了一个既复杂又可控的异步流程——每一步的类型安全、错误处理、并发控制和资源清理都由 Effect 运行时管理。
