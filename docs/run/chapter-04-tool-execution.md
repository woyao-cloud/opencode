# 第 4 章 · 工具执行

## 4.1 场景概述

当 LLM 返回 `tool_calls`（AI 决定调用工具）时，opencode 需要：解码 AI 生成的 JSON 参数 → 检查权限 → 执行工具 → 编码结果 → 截断输出 → 注入对话历史。这个流程的核心挑战是**桥接两个世界**：AI SDK（`ai` 包）期望工具执行函数返回 Promise，而 opencode 的工具执行逻辑全部用 Effect 编写。

为什么需要 Effect？工具执行涉及文件 I/O、子进程管理、网络请求、权限检查——全部是可能失败的副作用。Effect 的类型安全错误处理确保每个工具的失败模式被明确定义，而 `EffectBridge` 解决了 Effect ↔ Promise 的互操作问题。

## 4.2 触发流程

```text
LLM 返回 tool_calls
    │
    ▼
┌─ resolveTools (session/prompt.ts) ─────────────────────────┐
│  为每个工具创建 AI SDK Tool 对象:                            │
│                                                             │
│  tool({                                                     │
│    description, inputSchema,                                │
│    execute(args, options) {                                 │
│      return bridge.promise(  ←── Effect → Promise 桥接      │
│        Effect.gen(function* () {                            │
│          // ① 权限检查                                       │
│          yield* permission.ask({...})                       │
│          // ② 执行前插件钩子                                  │
│          yield* plugin.trigger("tool.execute.before", ...)  │
│          // ③ 执行工具                                       │
│          const result = yield* item.execute(args, ctx)      │
│          // ④ 执行后插件钩子                                  │
│          yield* plugin.trigger("tool.execute.after", ...)   │
│          return result                                      │
│        })                                                   │
│      )                                                      │
│    }                                                        │
│  })                                                         │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ AI SDK 调用 execute() → bridge.promise 触发 Effect ───────┐
│                                                             │
│  ┌─ 内置工具 ──────────────────────────────────────────┐    │
│  │ tool/read.ts: 读取文件 → 触发指令发现                 │    │
│  │ tool/write.ts: 写入文件 → 记录快照                    │    │
│  │ tool/edit.ts: 精确替换 → 验证 old_string 匹配         │    │
│  │ tool/bash.ts: 子进程执行 → Stream.runForEach 消费输出 │    │
│  │ tool/task.ts: 子 Agent 调度 → 完整 runLoop            │    │
│  │ tool/glob.ts: 文件搜索 → Stream.runCollect            │    │
│  │ tool/grep.ts: 内容搜索 → Ripgrep 子进程               │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ MCP 工具 ──────────────────────────────────────────┐    │
│  │ mcp/index.ts: 远程工具 → Effect.promise 包装          │    │
│  │   → MCP Server 的 execute() 返回 Promise              │    │
│  │   → 用 Effect.promise 将其包装为 Effect               │    │
│  │   → 结果截断 (Truncate.output)                        │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                             │
│  执行完成后:                                                 │
│  → tool/truncate.ts: 截断过长输出                            │
│  → session/session.ts: updatePart (状态→completed/error)    │
│  → 结果作为 tool_result 注入消息历史                         │
└────────────────────────────────────────────────────────────┘
```

## 4.3 关键触发点详解

### 触发点 1：EffectBridge — Effect ↔ Promise 的核心桥接

**文件**：`session/prompt.ts:580-608`（resolveTools 内部）

```typescript
execute(args, options) {
  return run.promise(  // bridge.promise: Effect → Promise
    Effect.gen(function* () {
      const ctx = context(args, options)
      // 执行前钩子
      yield* plugin.trigger("tool.execute.before", {...}, { args })
      // 执行工具
      const result = yield* item.execute(args, ctx)
      // 执行后钩子
      yield* plugin.trigger("tool.execute.after", {...}, output)
      return output
    })
  )
}
```

**自然语言解释**：这是工具执行中最关键的桥接点。AI SDK 的 `tool()` 函数要求 `execute` 返回 Promise，但 opencode 的工具逻辑全部用 Effect 编写。`bridge.promise()`（通过 `run.promise` 调用）将 Effect 转换为 Promise——它启动 Effect 执行，成功时 resolve Promise，失败时 reject Promise。桥接内部是一个 `Effect.gen`，依次执行权限检查、插件钩子、工具执行、结果处理。如果其中任何一步失败，错误会通过 Promise rejection 传递给 AI SDK。

### 触发点 2：Bash 工具 — Stream.runForEach 消费子进程输出

**文件**：`tool/shell.ts:485`

```typescript
yield* Stream.runForEach(
  Stream.decodeText(handle.all),
  (chunk) => {
    output += chunk
    // 实时更新 Part 状态
    if (part.state.status === "running") {
      part.state.metadata = { output, description: "" }
      yield* sessions.updatePart(part)
    }
  }
)
```

**自然语言解释**：Bash 工具执行 Shell 命令时，命令的输出是流式的——可能持续几秒甚至几分钟。`Stream.decodeText` 将子进程的 stdout/stderr 合并流解码为文本流，`Stream.runForEach` 对每个文本块执行回调：追加到 output 变量，并实时更新 Part 状态（让 UI 看到命令的实时输出）。这种"边执行边更新 UI"的模式是 Effect Stream 的典型应用。

### 触发点 3：Task 工具 — 子 Agent 的完整 Effect 链

**文件**：`session/prompt.ts:702-893`（handleSubtask）

```typescript
const result = yield* taskTool
  .execute(taskArgs, {...})
  .pipe(
    Effect.catchCause((cause) => {
      // 子任务失败 → 记录错误，不中断主流程
      error = Cause.squash(cause)
      log.error("subtask execution failed", {...})
      return Effect.void
    }),
    Effect.onInterrupt(() =>
      Effect.gen(function* () {
        // 中断时：标记消息完成、更新 Part 为 error
        taskAbort.abort()
        assistantMessage.time.completed = Date.now()
        yield* sessions.updateMessage(assistantMessage)
        // ...
      })
    ),
  )
```

**自然语言解释**：Task 工具（子 Agent 调度）是工具中最复杂的一个——它实际上启动了一个完整的 Agent 运行循环。`Effect.catchCause` 捕获子任务执行中的所有错误（包括缺陷），记录日志后返回 `Effect.void`（表示"错误已处理，继续主流程"）。`Effect.onInterrupt` 注册中断清理逻辑——当用户取消时，通过 `AbortController` 中止子任务，并更新消息和 Part 状态。这种"错误不中断主流程 + 中断时清理"的双重保护是 Effect 错误处理的精髓。

### 触发点 4：MCP 工具 — Effect.promise 包装外部 Promise

**文件**：`session/prompt.ts:628-640`

```typescript
const result = yield* Effect.gen(function* () {
  yield* ctx.ask({ permission: key, ... })
  return yield* Effect.promise(() => execute(args, opts))
}).pipe(
  Effect.withSpan("Tool.execute", {
    attributes: {
      "tool.name": key,
      "session.id": ctx.sessionID,
    },
  })
)
```

**自然语言解释**：MCP 工具的 `execute` 函数来自外部 MCP 服务器——它返回的是 Promise，不是 Effect。`Effect.promise(() => execute(args, opts))` 将这个 Promise 包装为 Effect——如果 Promise resolve，Effect 成功；如果 Promise reject，Effect 失败。包装后的 Effect 被 `.pipe(Effect.withSpan(...))` 添加 OpenTelemetry 追踪 Span，使得 MCP 工具的执行也被纳入可观测性体系。

### 触发点 5：Truncate — 输出截断的 Effect 调用

**文件**：`session/prompt.ts:671`

```typescript
const truncated = yield* truncate.output(
  textParts.join("\n\n"), {}, input.agent
)
```

**自然语言解释**：工具输出可能非常长（如 Grep 返回数千行）。`truncate.output()` 返回一个 Effect——它检查输出长度，如果超过限制则截断并写入截断文件。截断后的结果（`truncated.content` + `truncated.truncated` 标记）被注入消息历史。这是一个典型的"可能失败但通常不会"的 Effect 操作——文件写入可能失败（磁盘满），所以用 Effect 建模。

### 触发点 6：Read 工具 — 指令文件发现的连锁 Effect

**文件**：`tool/read.ts:120`

```typescript
yield* Stream.runForEach(
  Stream.decodeText(handle.all),
  (text) => Effect.sync(() => { output += text })
)
```

**自然语言解释**：Read 工具读取文件时，如果文件很大，内容通过流式读取。`Stream.runForEach` 消费流中的每个文本块，用 `Effect.sync`（同步 Effect，不会失败）追加到 output。读取完成后，`session/prompt.ts` 中的 `resolvePart` 还会触发 `instruction.resolve()`——从被读取文件所在目录向上查找 AGENTS.md/CLAUDE.md 并注入上下文。这是一个"一个 Effect 触发另一个 Effect"的连锁反应。

## 4.4 涉及的 Effect 方法

### `EffectBridge.make()` / `bridge.promise(effect)`
**作用**：创建 Effect 桥接器。`bridge.promise` 将 Effect 转换为 Promise，是 Effect 世界与外部 Promise 世界的主要桥梁。

**本章使用场景**：所有工具的 `execute` 函数——将 Effect 执行逻辑暴露为 AI SDK 期望的 Promise 接口。

### `bridge.fork(effect)`
**作用**：将 Effect 作为后台 Fiber 启动，返回不带结果的 Promise。

**本章使用场景**：某些不需要等待结果的工具操作。

### `Effect.promise(() => promise)`
**作用**：将 Promise 包装为 Effect。Promise resolve → Effect 成功，Promise reject → Effect 失败。这是反向桥接——从 Promise 世界回到 Effect 世界。

**本章使用场景**：MCP 工具执行——外部 MCP 服务器的 execute 返回 Promise，用 `Effect.promise` 包装后纳入 Effect 的错误处理体系。

### `Effect.sync(() => value)`
**作用**：创建同步 Effect——一个不会失败的 Effect。用于包装纯计算或已知不会失败的操作。

**本章使用场景**：Read 工具中追加文本到 output 变量。

### `Effect.withSpan(name, options)`
**作用**：为 Effect 添加 OpenTelemetry Span，用于分布式追踪。

**本章使用场景**：MCP 工具执行——添加 Span 以追踪工具调用的耗时和状态。

### `Effect.catchCause(handler)`
**作用**：捕获 Effect 中的所有错误（包括缺陷），执行恢复逻辑。比 `Effect.catch` 更宽——`catch` 只捕获声明的错误类型，`catchCause` 捕获一切。

**本章使用场景**：Task 工具——子任务失败不应中断主流程，用 `catchCause` 兜底。

### `Effect.onInterrupt(callback)`
**作用**：注册中断清理回调。

**本章使用场景**：Task 工具——用户取消时中止子任务并更新状态。

### `Effect.orDie`
**作用**：将错误转为缺陷——"这个操作不应该失败"。

**本章使用场景**：权限检查——权限拒绝被视为不可恢复的缺陷。

### `Stream.runForEach(stream, fn)`
**作用**：消费流中每个元素，执行回调 Effect。

**本章使用场景**：Bash 输出消费、Read 文件内容消费。

### `Stream.runCollect(stream)`
**作用**：收集流中所有元素到数组。

**本章使用场景**：Glob 搜索结果收集、Ripgrep 输出收集。

## 4.5 本章小结

工具执行是 Effect ↔ Promise 桥接最密集的场景。`EffectBridge` 的 `bridge.promise` 将所有工具的 Effect 执行逻辑转换为 AI SDK 期望的 Promise 接口。在 Effect 内部，`Effect.gen` 编排权限检查→插件钩子→工具执行→结果处理的完整流程，`Effect.catchCause` 确保子任务失败不中断主流程，`Effect.onInterrupt` 确保取消时状态一致，`Effect.withSpan` 将外部工具也纳入可观测性。`Stream.runForEach` 和 `Stream.runCollect` 处理流式输出。这套设计让工具执行既类型安全又灵活可控。
