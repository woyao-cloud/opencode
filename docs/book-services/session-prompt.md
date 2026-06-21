# @opencode/SessionPrompt — 会话提示处理服务
> 婧愭枃浠? `opencode/packages/opencode/src/session/prompt.ts`

## 概述

`@opencode/SessionPrompt` 是 OpenCode 会话系统的**用户交互主入口**，负责处理用户消息的创建、prompt 解析、工具收集、LLM 调用循环（agentic loop）、shell 命令执行、自定义命令解析以及子任务分发。它是连接用户输入与 Agent 运行循环的桥梁，也是整个会话引擎的核心调度器。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Bus` | `@opencode/Bus` | 事件总线，发布会话生命周期事件 |
| `SessionStatus` | `@opencode/SessionStatus` | 更新会话状态 |
| `Session` | `@opencode/Session` | 会话持久化，读写消息和会话数据 |
| `Agent` | `@opencode/Agent` | Agent 配置管理，解析 agent 信息 |
| `Provider` | `@opencode/Provider` | AI Provider 管理 |
| `SessionProcessor` | `@opencode/SessionProcessor` | 消息处理管道（预处理/后处理） |
| `SessionCompaction` | `@opencode/SessionCompaction` | 上下文压缩管理 |
| `Plugin` | `@opencode/Plugin` | 插件钩子触发 |
| `Command` | `@opencode/Command` | 自定义命令加载 |
| `Config` | `@opencode/Config` | 配置服务 |
| `Permission` | `@opencode/Permission` | 权限评估 |
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统抽象 |
| `MCP` | `@opencode/MCP` | MCP 服务器工具管理 |
| `LSP` | `@opencode/LSP` | LSP 工具管理 |
| `ToolRegistry` | `@opencode/ToolRegistry` | 工具注册中心 |
| `Truncate` | `@opencode/Truncate` | 工具输出截断 |
| `Image` | `@opencode/Image` | 图片处理（归一化、转换） |
| `ChildProcessSpawner` | `@opencode-ai/core/child-process` | 子进程管理（shell 执行） |
| `Instruction` | `@opencode/Instruction` | 指令服务 |
| `SessionRunState` | `@opencode/SessionRunState` | 运行状态管理（循环控制） |
| `SessionRevert` | `@opencode/SessionRevert` | 会话回退 |
| `SessionSummary` | `@opencode/SessionSummary` | 会话摘要 |
| `SystemPrompt` | `@opencode/SystemPrompt` | 系统提示生成 |
| `LLM` | `@opencode/LLM` | LLM 调用封装 |
| `Reference` | `@opencode/Reference` | 命名引用解析 |
| `EventV2Bridge` | `@opencode/EventV2Bridge` | V2 事件系统桥接 |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 运行时功能标志 |

```typescript
// prompt.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service
  const sessionStatus = yield* SessionStatus.Service
  const session = yield* Session.Service
  const agent = yield* Agent.Service
  const provider = yield* Provider.Service
  const sessionProcessor = yield* SessionProcessor.Service
  const sessionCompaction = yield* SessionCompaction.Service
  const plugin = yield* Plugin.Service
  const command = yield* Command.Service
  const config = yield* Config.Service
  const permission = yield* Permission.Service
  const appFileSystem = yield* AppFileSystem.Service
  const mcp = yield* MCP.Service
  const lsp = yield* LSP.Service
  const toolRegistry = yield* ToolRegistry.Service
  const truncate = yield* Truncate.Service
  const image = yield* Image.Service
  const childProcessSpawner = yield* ChildProcessSpawner.Service
  const instruction = yield* Instruction.Service
  const sessionRunState = yield* SessionRunState.Service
  const sessionRevert = yield* SessionRevert.Service
  const sessionSummary = yield* SessionSummary.Service
  const systemPrompt = yield* SystemPrompt.Service
  const llm = yield* LLM.Service
  const reference = yield* Reference.Service
  const eventV2Bridge = yield* EventV2Bridge.Service
  const runtimeFlags = yield* RuntimeFlags.Service
  // ...
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly cancel: (sessionID: string) => Effect.Effect<void>                    // 取消当前运行的会话
  readonly prompt: (input: PromptInput) => Effect.Effect<MessageV2>              // 处理用户 prompt 输入，创建消息并启动运行循环
  readonly loop: (input: LoopInput) => Effect.Effect<void>                       // 启动/恢复 Agent 运行循环
  readonly shell: (input: ShellInput) => Effect.Effect<MessageV2>                // 执行 shell 命令并记录为工具调用
  readonly command: (input: CommandInput) => Effect.Effect<MessageV2>            // 解析并执行自定义命令
  readonly resolvePromptParts: (input: {                                        // 解析 prompt parts（文件引用、图片等）
    sessionID: string
    parts: PromptPart[]
  }) => Effect.Effect<PromptPart[]>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/SessionPrompt") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 发送用户 prompt
yield* SessionPrompt.Service.prompt({ sessionID, messageID, model, agent, parts })

// 执行 shell 命令
yield* SessionPrompt.Service.shell({ sessionID, command: "ls -la", agent })

// 取消运行
yield* SessionPrompt.Service.cancel(sessionID)
```

## 关键数据结构

### PromptInput

```typescript
export interface PromptInput {
  sessionID: string       // 会话 ID
  messageID?: string      // 消息 ID（可选，用于恢复/继续）
  model: Model            // 使用的模型
  agent: Agent.Info       // Agent 配置
  noReply?: boolean       // 不触发 LLM 回复（仅记录消息）
  tools?: Tool.Def[]      // 显式指定的工具列表
  format?: Format         // 结构化输出格式
  system?: string         // 覆盖系统提示
  variant?: string        // 变体标识
  parts: PromptPart[]     // 消息内容部分（文本、文件、图片等）
}
```

### LoopInput

```typescript
export interface LoopInput {
  sessionID: string
  messageID?: string
  model: Model
  agent: Agent.Info
  format?: Format
  system?: string
  hasUserTurn?: boolean   // 是否有用户参与（用于权限判断）
}
```

### ShellInput

```typescript
export interface ShellInput {
  sessionID: string
  command: string         // 要执行的 shell 命令
  agent: Agent.Info
  model: Model
  parts?: PromptPart[]    // 额外的 prompt 内容（如 @file 引用）
}
```

### CommandInput

```typescript
export interface CommandInput {
  sessionID: string
  agent: Agent.Info
  model: Model
  command: string         // 自定义命令名称
  args: string[]          // 命令参数
  parts: PromptPart[]
}
```

## 核心流程

### prompt() — 用户交互主入口

`prompt()` 是用户与会话交互的主要入口，核心流程如下：

```
prompt(input)
  ├── 1. 会话状态检查（确保会话未在运行）
  ├── 2. 创建用户消息 (createUserMessage)
  │     ├── resolvePromptParts: 解析文件部分
  │     │     ├── 文本文件 → 读取内容作为文本 part
  │     │     ├── 二进制文件 → 转 base64 data URL
  │     │     ├── 目录 → 递归收集目录结构
  │     │     └── MCP 资源 → 获取 MCP 资源内容
  │     ├── 图片归一化 (Image.normalize)
  │     └── Reference 引用解析（@alias → 实际内容）
  ├── 3. 触发 chat.message 插件钩子（before/after）
  ├── 4. 持久化用户消息到数据库
  ├── 5. 双写事件（EventV2Bridge + Bus）
  ├── 6. 如果 noReply 为 false → 调用 loop() 启动运行循环
  └── 7. 返回完整的用户消息
```

### loop() — 启动运行循环

```typescript
loop(input: LoopInput): Effect.Effect<void>
```

`loop()` 委托给 `SessionRunState.ensureRunning` 来管理运行循环的启动：

```typescript
yield* sessionRunState.ensureRunning(input.sessionID, runLoop(input))
```

确保同一会话不会并发运行多个循环实例。

### runLoop() — 核心 Agentic 循环

`runLoop` 是实现 Agent 行为的核心循环，内部包含完整的 LLM 交互流程：

```
runLoop(input)
  ├── 1. 加载会话消息历史
  ├── 2. Plan 模式检查
  │     └── 如果 agent 进入/离开 plan 模式 → 插入 plan/build 提示
  ├── 3. 标题自动生成
  │     └── 对新会话使用 small_model 生成标题
  ├── 4. 主循环 (while true)
  │     ├── 4.1 会话状态检查（是否已取消/回退）
  │     ├── 4.2 触发 tool.execute.before 插件钩子
  │     ├── 4.3 resolveTools: 收集可用工具
  │     │     ├── 从 ToolRegistry.tools() 获取模型过滤后的工具列表
  │     │     ├── 从 MCP 获取 MCP 工具
  │     │     ├── 从 LSP 获取 LSP 工具
  │     │     ├── 用 Permission 包裹工具执行（权限检查）
  │     │     └── 如果 format 存在 → 添加 StructuredOutput 工具
  │     ├── 4.4 上下文压缩检查 (SessionCompaction.needs)
  │     │     └── 需要时执行压缩并更新消息历史
  │     ├── 4.5 消息处理管道 (SessionProcessor)
  │     │     ├── 预处理（插入系统提示、指令等）
  │     │     └── 后处理
  │     ├── 4.6 LLM 调用
  │     │     ├── 流式响应处理
  │     │     ├── 工具调用提取
  │     │     └── 停止原因判断（tool_use / end_turn / max_tokens）
  │     ├── 4.7 工具结果处理
  │     │     ├── 执行工具调用
  │     │     ├── Truncate.output 截断
  │     │     ├── 触发 tool.execute.after 插件钩子
  │     │     └── 生成 tool_result 消息
  │     ├── 4.8 子任务处理 (handleSubtask)
  │     │     └── TaskTool 触发的子 Agent 执行
  │     └── 4.9 终止条件检查
  │           ├── end_turn → 退出循环
  │           ├── 取消/回退 → 退出循环
  │           └── 继续 → 下一轮迭代
  └── 5. 更新会话状态为 idle
```

### shell() — Shell 命令执行

```typescript
shell(input: ShellInput): Effect.Effect<MessageV2>
```

`shell()` 执行用户提交的 shell 命令并将其作为工具调用消息记录：

```
shell(input)
  ├── 1. 创建 shell 工具定义（基于 ChildProcessSpawner）
  ├── 2. 构建 ShellPrompt 消息（含 @file 引用解析）
  ├── 3. 触发 chat.message 插件钩子
  ├── 4. 执行命令，生成 tool_use + tool_result 消息对
  ├── 5. 持久化消息
  └── 6. 触发运行循环（等待 LLM 分析执行结果）
```

### command() — 自定义命令处理

```typescript
command(input: CommandInput): Effect.Effect<MessageV2>
```

`command()` 解析用户输入的自定义命令（slash commands），支持两种模式：

```
command(input)
  ├── 1. 从 Command.Service 加载命令定义
  ├── 2. 判断命令类型
  │     ├── 子任务命令 → handleSubtask 分发到子 Agent
  │     └── 普通命令 → 生成 command prompt 作为用户消息
  ├── 3. 触发 command.execute.before 插件钩子
  ├── 4. 创建命令消息并持久化
  └── 5. 启动运行循环
```

### resolvePromptParts() — 文件部分解析

`resolvePromptParts()` 负责将用户引用的文件路径解析为实际的消息内容：

| 文件类型 | 处理方式 |
|----------|----------|
| 文本文件（`.ts`, `.js`, `.json`, `.md` 等） | 读取内容作为 `text` part |
| 二进制文件（图片、PDF 等） | 转换为 `base64` data URL |
| 目录 | 递归遍历，生成目录结构文本 |
| MCP 资源 | 通过 MCP 服务获取资源内容 |

### resolveTools() — 工具收集与包装

`resolveTools()` 从多个来源收集工具，并用权限检查包裹每个工具的执行：

```typescript
function* resolveTools(input) {
  // 1. 从 ToolRegistry 获取模型过滤后的内置工具
  const builtin = yield* toolRegistry.tools({ providerID, modelID, agent })

  // 2. 从 MCP 获取 MCP 工具
  const mcpTools = yield* mcp.tools()

  // 3. 从 LSP 获取 LSP 工具
  const lspTools = yield* lsp.tools()

  // 4. 如果有 format 参数，添加 StructuredOutput 工具
  if (input.format) {
    tools.push(createStructuredOutputTool(input.format))
  }

  // 5. 用 Permission 包裹每个工具的执行函数
  return tools.map((tool) => ({
    ...tool,
    execute: (args) =>
      permission.canUse(tool.id, args).pipe(
        Effect.flatMap(() => tool.execute(args)),
      ),
  }))
}
```

### handleSubtask() — 子任务分发

当 LLM 调用 Task 工具时，`handleSubtask()` 负责创建子 Agent 并执行子任务：

```
handleSubtask(subagent, taskPrompt, parentSession)
  ├── 1. 解析 subagent 配置
  ├── 2. 创建子会话（或复用已有会话）
  ├── 3. 注入 subagent 专属系统提示和工具
  ├── 4. 调用子 Agent 的 runLoop
  ├── 5. 收集子任务结果
  └── 6. 将结果作为 tool_result 返回给父会话
```

## 辅助功能

### 标题自动生成

对于新创建的会话，`runLoop` 在第一次 LLM 调用后会使用轻量模型（`small_model`）自动生成会话标题：

```typescript
const generateTitle = Effect.fn("SessionPrompt.generateTitle")(function* (sessionID) {
  const session = yield* Session.Service.get(sessionID)
  if (session.title === "New Session" || !session.title) {
    const title = yield* llm.generateTitle(session.messages)
    yield* Session.Service.update(sessionID, { title })
  }
})
```

### Plan 模式支持

当 Agent 在 plan 模式和正常模式之间切换时，`runLoop` 会自动插入相应的提示消息：

- **进入 Plan 模式**：插入 plan 提示，引导 LLM 只进行分析和规划，不执行修改操作
- **离开 Plan 模式**：插入 build 提示，引导 LLM 根据之前的计划执行具体实现

### 结构化输出 (StructuredOutput)

当 `PromptInput` 中包含 `format` 参数时，`resolveTools()` 会创建一个特殊的 `StructuredOutput` 工具。该工具接收符合指定 JSON Schema 的参数，LLM 调用此工具即表示输出结构化的最终答案。

### Reference 引用解析

`@reference` 语法允许用户在 prompt 中引用预定义的命名引用。`createUserMessage` 阶段通过 `Reference.Service` 将 `@alias` 替换为对应的实际内容（文本、文件路径等）。

## 事件系统

SessionPrompt 采用双写事件模式，同时发布到两套事件系统：

| 事件系统 | 用途 |
|----------|------|
| `Bus` (旧版同步事件) | 向后兼容，TUI 和 CLI 客户端依赖 |
| `EventV2Bridge` (实验性 V2) | 新版事件系统，支持更丰富的元数据 |

关键事件节点：
- **消息创建**：用户消息、助手消息、工具调用/结果消息
- **插件钩子**：`chat.message`（消息创建前后）、`tool.execute.before/after`（工具执行前后）、`command.execute.before`（命令执行前）
- **会话状态变更**：running → idle、取消、回退

## 关键设计决策

1. **Effect Bridge 模式**：工具执行可能发生在 Effect 作用域之外（如通过 Bridge 调用），SessionPrompt 使用 Effect Bridge 模式在 Effect 和外部世界之间建立桥接，确保工具执行结果能正确回流到 Effect 管道中

2. **SessionRunState 单例循环**：通过 `SessionRunState.ensureRunning` 确保同一会话只有一个活跃的运行循环，避免并发写入消息导致的状态不一致

3. **插件钩子埋点**：在关键执行节点（工具执行前后、消息创建前后、命令执行）触发插件钩子，允许外部插件介入和修改行为

4. **双写事件系统**：同时维护旧版同步事件和新版 EventV2 事件，确保向后兼容的同时逐步迁移到更丰富的事件模型

5. **图片归一化**：所有用户附带的图片在进入消息管道前经过 `Image.normalize` 处理，统一格式和尺寸，减少 LLM token 消耗

6. **工具执行权限包裹**：`resolveTools()` 为每个工具的执行函数包裹 `Permission` 检查，确保工具调用受权限策略约束，而非依赖 LLM 自觉遵守

7. **上下文压缩集成**：在每个 LLM 调用轮次前检查是否需要压缩（`SessionCompaction.needs`），在上下文窗口即将耗尽时自动触发压缩，保持对话连贯性

8. **标题异步生成**：标题生成使用独立的轻量模型调用，不阻塞主循环。新会话在第一条消息交换完成后异步生成标题

9. **子任务隔离**：Task 工具触发的子任务运行在独立的子 Agent 上下文中，拥有独立的工具集和权限，结果以 tool_result 形式回流
