# 第 11 章 · Plan 模式：先规划再执行的全链路分析

## 11.1 场景概述

用户在 opencode TUI 中输入带有"先规划再执行"意图的指令（如"帮我设计一个新功能，先规划再实现"），opencode 会进入 **Plan 模式**。在 Plan 模式下，AI 被限制为只读操作——只能阅读代码、搜索文件、分析架构、向用户提问，不能修改任何文件或执行写入命令。当 Plan 完成后，AI 调用 `plan_exit` 工具请求用户批准，用户确认后切换到 Build Agent 开始实现。

本章完整追踪这个流程涉及的代码，并逐一解释：opencode 如何实现规划、如何追踪多步骤任务进度、如何协调并行多任务、工具执行机制、Skill 工作机制和 Plugin 工作机制。

## 11.2 整体时序图

```text
用户: "帮我设计一个新功能，先规划再实现"  按下 Enter
    │
    ▼
┌─ TUI Prompt 组件 (component/prompt/index.tsx) ─────────────┐
│  submitInner() → sdk.client.session.prompt({...})          │
│  输入文本作为 TextPart 发送                                  │
└────────────────────────────────────────────────────────────┘
    │  RPC → Worker
    ▼
┌─ Worker: session/prompt.ts::prompt() ──────────────────────┐
│  createUserMessage()                                        │
│    → resolvePart: 文本 → TextPart                           │
│    → 确定 Agent: 默认 agent (如 "build")                     │
│    → 保存消息                                                │
│                                                             │
│  runLoop() ← 核心循环开始                                    │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ runLoop STEP 1 ───────────────────────────────────────────┐
│                                                             │
│  ① 加载消息历史                                              │
│  ② System Prompt 组装                                       │
│     Effect.all([environment, instructions, skills])         │
│  ③ 消息转换 → ModelMessage[]                                │
│  ④ 注册工具 → resolveTools()                                │
│     ┌─ 内置工具: Bash, Read, Write, Edit, Task, Todo...    │
│     ├─ Plan 工具: plan_exit, plan_enter                     │
│     ├─ Skill 工具: skill                                    │
│     ├─ Plugin 工具: 通过 plugin.trigger() 注册               │
│     └─ MCP 工具: 通过 mcp.tools() 注册                       │
│  ⑤ 调用 LLM → processor.process()                          │
│     → provider/transform.ts::message()                      │
│     → session/llm.ts::stream()                              │
│     → AI SDK streamText() → SSE 流                          │
└────────────────────────────────────────────────────────────┘
    │
    │  LLM 返回 text-delta (AI 开始分析...)
    │  LLM 返回 tool-call: task (启动 explore agent 探索代码)
    │  LLM 返回 tool-call: task (启动 plan agent 设计方案)
    │  LLM 返回 tool-call: question (向用户确认需求)
    │  LLM 返回 tool-call: todowrite (更新任务列表)
    │  LLM 返回 tool-call: plan_exit (请求切换到 build)
    │
    ▼
┌─ 工具执行阶段 ──────────────────────────────────────────────┐
│                                                             │
│  ┌─ Task 工具 (tool/task.ts) ──────────────────────────┐    │
│  │ ① 查找 Agent → agents.get(subagent_type)             │    │
│  │ ② 创建 Subagent Session                              │    │
│  │ ③ Subagent 权限: deriveSubagentSessionPermission()  │    │
│  │ ④ 执行 runLoop (完整的 Agent 循环!)                  │    │
│  │ ⑤ 返回结果给主 Agent                                 │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ TodoWrite 工具 (tool/todo.ts) ─────────────────────┐    │
│  │ ① 权限检查 → ask("todowrite", ...)                   │    │
│  │ ② 更新 Todo 列表 → todo.update({sessionID, todos})  │    │
│  │ ③ 持久化到数据库                                     │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ Question 工具 (question/index.ts) ─────────────────┐    │
│  │ ① 向用户展示问题 (TUI 对话框)                        │    │
│  │ ② 等待用户选择                                       │    │
│  │ ③ 返回答案给 AI                                      │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ PlanExit 工具 (tool/plan.ts) ──────────────────────┐    │
│  │ ① 获取当前 Session 信息                              │    │
│  │ ② 计算 plan 文件路径                                 │    │
│  │ ③ 向用户提问: "是否切换到 build agent?"              │    │
│  │ ④ 用户确认 → 创建新的 User Message (agent="build")   │    │
│  │ ⑤ 注入 BUILD_SWITCH 提示词                           │    │
│  │ ⑥ 返回 "Switching to build agent"                    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ Skill 工具 (tool/skill.ts) ────────────────────────┐    │
│  │ ① 查找 Skill → skill.get(name)                       │    │
│  │ ② 权限检查 → ask("skill", ...)                       │    │
│  │ ③ 扫描 Skill 目录中的文件                             │    │
│  │ ④ 返回 Skill 指令内容 + 相关文件列表                  │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ Plugin 钩子 (plugin/index.ts) ─────────────────────┐    │
│  │  在关键节点触发:                                       │    │
│  │  · tool.execute.before (工具执行前)                   │    │
│  │  · tool.execute.after (工具执行后)                    │    │
│  │  · chat.message (消息发送前)                          │    │
│  │  · shell.env (Shell 执行前)                           │    │
│  │  · command.execute.before (命令执行前)                │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                             │
│  工具结果注入消息历史 → 下一轮 Step                           │
└─────────────────────────────────────────────────────────────┘
    │
    │  Plan 完成后 LLM 返回 finish_reason="stop"
    │  (没有更多 tool_calls)
    ▼
┌─ 用户确认切换到 Build ──────────────────────────────────────┐
│                                                             │
│  plan_exit 工具创建新 User Message:                          │
│    agent: "build"                                            │
│    text: "The plan has been approved, you can now edit..."  │
│                                                             │
│  insertReminders() 注入 BUILD_SWITCH:                        │
│    "Your operational mode has changed from plan to build.    │
│     You are no longer in read-only mode..."                  │
│                                                             │
│  新 Step 使用 build Agent 的权限 (允许 edit/bash)            │
│  → AI 开始执行 plan 中定义的任务                             │
└─────────────────────────────────────────────────────────────┘
```

## 11.3 关键机制详解

### 11.3.1 opencode 如何实现规划（Plan 模式）

Plan 模式的核心是 **Agent 权限限制 + System Prompt 注入**。

**第一步：Plan Agent 的权限定义**

**文件**：`agent/agent.ts:142-164`

Plan Agent 是一个特殊的 Agent，其权限配置禁止了所有编辑操作：

```
plan Agent 权限:
  · question: "allow"           → 允许向用户提问
  · plan_exit: "allow"          → 允许请求退出 Plan 模式
  · external_directory: {...}   → 允许访问 plan 文件目录
  · edit: {
      "*": "deny",              → 拒绝所有编辑操作!
      ".opencode/plans/*.md": "allow"  → 只允许编辑 plan 文件
    }
```

**自然语言解释**：Plan Agent 的权限配置是 Plan 模式的"硬约束"。AI 可以读取任何文件、搜索代码、向用户提问，但一旦尝试调用 Write、Edit、Bash 等编辑工具，权限检查就会拒绝——因为 Plan Agent 的 `edit` 权限对所有路径（`*`）都是 `deny`。唯一例外是 `.opencode/plans/*.md`——AI 可以编辑 plan 文件来记录规划结果。

**第二步：Plan 模式激活的 System Prompt**

**文件**：`session/prompt/plan.txt`

当 Agent 切换到 Plan 模式时，`insertReminders()` 将 plan.txt 的内容注入到用户消息中。这个 System Prompt 包含：

- 明确声明 Plan 模式已激活
- 严禁任何文件编辑和系统变更
- 定义了完整的五阶段工作流：理解需求 → 探索代码 → 设计方案 → 评审 → 最终计划
- 规定了并行 Agent 的使用策略（最多 3 个 explore agent）
- 规定了何时使用 question 工具（澄清需求）、何时使用 plan_exit（请求批准）

**第三步：Plan → Build 的切换**

**文件**：`tool/plan.ts:14-78`

当 AI 完成规划后调用 `plan_exit` 工具：

1. 工具向用户提问"是否切换到 build agent 并开始实现？"
2. 用户确认后，工具创建一个新的 User Message，`agent` 字段设为 `"build"`
3. 注入 `BUILD_SWITCH` 提示词：`"Your operational mode has changed from plan to build. You are no longer in read-only mode."`
4. 下一轮 Step 使用 build Agent 的权限——编辑和 Bash 操作被允许

**第四步：Plan 模式激活的条件判断**

**文件**：`session/prompt.ts:393-519`

`insertReminders()` 函数检查当前状态决定是否激活 Plan 模式：

- 如果 `flags.experimentalPlanMode` 为 false（旧版 Plan 模式）：当 Agent 名为 `"plan"` 时注入 `PROMPT_PLAN`；当从 plan 切换到 build 时注入 `BUILD_SWITCH`
- 如果 `flags.experimentalPlanMode` 为 true（新版实验性 Plan 模式）：检查上一条 Assistant Message 的 Agent——如果上一条是 plan 且当前不是 plan，注入 `BUILD_SWITCH` + plan 文件路径；如果当前是 plan 且上一条不是 plan，注入完整的 plan.txt 指令

### 11.3.2 多步骤任务如何追踪进度（TodoWrite 工具）

**文件**：`tool/todo.ts`

TodoWrite 工具让 AI 在复杂任务中维护一个结构化的任务列表：

```text
AI 调用 TodoWrite:
  { todos: [
      { content: "分析 auth 模块代码", status: "in_progress", priority: "high" },
      { content: "修复类型错误", status: "pending", priority: "high" },
      { content: "添加单元测试", status: "pending", priority: "medium" },
      { content: "运行回归测试", status: "pending", priority: "medium" }
    ]
  }
```

**自然语言解释**：TodoWrite 是 AI 的"执行计划书"。每个 todo 有三个字段：`content`（任务描述）、`status`（pending/in_progress/completed/cancelled）、`priority`（high/medium/low）。AI 在任务执行过程中多次调用 TodoWrite 更新进度——将正在做的标记为 `in_progress`，完成的标记为 `completed`。Todo 列表被持久化到数据库（`session/todo.ts`），在 TUI 的侧边栏实时展示。

Todo 列表还起到一个重要作用——它被注入到 System Prompt 中，让 AI 在每轮对话中都能看到当前的任务进度，避免遗忘。这解决了长对话中 AI "忘记自己要做什么"的常见问题。

### 11.3.3 并行多任务如何协调沟通（Task 工具）

**文件**：`tool/task.ts` + `session/prompt.ts:702-893`

Task 工具让主 Agent 可以派发子任务给 Subagent。多个 Subagent 可以**并行执行**。

**并行执行的关键机制**：

1. **AI 在一次响应中返回多个 tool_call**：LLM 可以同时返回多个 `task` 类型的 tool_call——例如同时启动一个 explore agent（探索代码）和一个 plan agent（设计方案）

2. **工具并行调度**：`resolveTools()` 为每个工具创建独立的执行上下文。多个 tool_call 被并行执行——open code 使用 Effect 的结构化并发（Fiber），每个工具在独立的 Fiber 中运行

3. **Subagent 的独立上下文**：每个 Task 工具调用会创建一个新的 Subagent Session（通过 `handleSubtask()` 函数）。Subagent 有：
   - 独立的 Session ID
   - 独立的 System Prompt（Subagent 自己的 Agent 定义）
   - 独立的对话历史（只包含主 Agent 发来的任务描述）
   - 受限的权限（通过 `deriveSubagentSessionPermission()` 从主 Agent 权限派生）

4. **结果汇总**：所有 Subagent 完成后，它们的结果作为多个 `tool_result` 注入主 Agent 的上下文。主 Agent 在下一 Step 中看到所有子任务的结果，进行综合分析

5. **后台模式**：Task 工具支持 `background: true` 参数——Subagent 在后台运行，主 Agent 不等待其完成。适合非关键的后台探索任务

**自然语言解释**：多 Agent 协作就像团队分工——主 Agent 是"项目经理"，负责拆解任务和汇总结果；Subagent 是"工程师"，负责具体执行。Task 工具的 `background` 参数让主 Agent 可以"异步派发"——派发后继续做其他事，不阻塞主流程。

### 11.3.4 工具执行机制

**文件**：`packages/llm/src/tool-runtime.ts` + `session/prompt.ts:522-700`

工具执行是 Plan 模式中 AI"动手做事"的唯一渠道。完整流程：

```text
LLM 返回 tool_call { name: "read", arguments: { filePath: "src/auth.ts" } }
    │
    ▼
① 查找工具 → registry 中查找 "read"
② 解码参数 → tool._decode({ filePath: "src/auth.ts" }) → 类型安全输入
③ 权限检查 → permission.ask({ permission: "read", patterns: ["src/auth.ts"] })
    │
    ├─ 已授权 → 继续
    └─ 未授权 → 暂停，等待用户决策 (once/always/deny)
    │
    ▼
④ 执行前钩子 → plugin.trigger("tool.execute.before", ...)
⑤ 执行工具 → tool.execute(params, ctx)
    │  (这是一个 Effect.gen)
    │  Read: 读取文件 → 可能触发 instruction.resolve() → 注入 AGENTS.md
    │  Bash: spawn 子进程 → Stream.runForEach 收集输出
    │  Edit: 定位 old_string → 替换 → 写入 → 记录快照
    │
⑥ 结果编码 → tool._encode(result) → JSON
⑦ 输出截断 → Truncate.output(text) → 过长则截断
⑧ 执行后钩子 → plugin.trigger("tool.execute.after", ...)
⑨ 状态更新 → ToolPart: completed/error
⑩ 结果注入 → tool_result 消息 → 下一轮 Step
```

**自然语言解释**：工具执行是一个严格的十步流程。每个步骤都有类型安全保障——参数解码确保 LLM 不会传入错误类型的参数，结果编码确保工具输出符合预期格式。权限检查确保敏感操作必须用户授权。插件钩子在执行前后插入自定义逻辑。输出截断防止工具结果（如 Grep 搜索返回数千行）撑爆上下文窗口。

### 11.3.5 Skill 工作机制

**文件**：`tool/skill.ts` + `skill/index.ts`

Skill 是 opencode 的"可复用操作手册"。每个 Skill 是一个目录，包含 `SKILL.md`（核心指令文件）和辅助文件。

**Skill 的发现与加载**：

**文件**：`skill/index.ts:104`（discoverSkills 函数）

```text
Skill 发现流程:
① 扫描项目目录 .opencode/skills/ 和全局目录 ~/.config/opencode/skills/
② 每个子目录如果包含 SKILL.md 就是一个 Skill
③ 读取 SKILL.md 的 YAML frontmatter 获取 name、description
④ 解析 Markdown 正文作为 AI 指令
⑤ 扫描目录中的其他文件作为 Skill 的辅助文件
```

**Skill 的触发**：

**文件**：`tool/skill.ts:14-55`

当 AI 调用 Skill 工具时：

1. 根据 `name` 查找 Skill → `skill.get(name)`
2. 权限检查 → `ask("skill", [name])`
3. 扫描 Skill 目录中的文件（排除 `SKILL.md`）→ 返回文件列表
4. 返回结果包含：Skill 的完整指令文本 + 辅助文件列表

**Skill 注入 System Prompt**：

**文件**：`session/system.ts`

在 System Prompt 组装阶段，`sys.skills(agent)` 将当前 Agent 可用的 Skill 列表注入到 System Prompt 中。AI 在每次对话中都能看到可用的 Skill 及其描述，自主决定何时调用。

**自然语言解释**：Skill 就像给 AI 的"专业培训手册"。当 AI 看到 System Prompt 中的 Skill 列表时，它知道"遇到 X 场景时可以调用 Y Skill"。调用 Skill 后，Skill 的完整指令被注入 AI 的上下文——这就像 AI 在需要时"翻阅手册"，获得详细的步骤指导。

### 11.3.6 Plugin 工作机制

**文件**：`plugin/index.ts`

Plugin 是 opencode 的"事件钩子系统"。它在关键节点插入自定义逻辑。

**Plugin 的触发点**：

| 钩子名称 | 触发时机 | 用途 |
|---------|---------|------|
| `tool.execute.before` | 工具执行前 | 记录工具调用日志、拦截特定操作 |
| `tool.execute.after` | 工具执行后 | 后处理工具结果、触发通知 |
| `chat.message` | 消息发送前 | 修改消息内容、注入额外上下文 |
| `shell.env` | Shell 执行前 | 注入环境变量 |
| `command.execute.before` | 命令执行前 | 拦截或修改命令参数 |
| `experimental.chat.messages.transform` | 消息转换时 | 修改发送给 LLM 的消息列表 |

**Plugin 的加载**：

**文件**：`plugin/loader.ts` + `plugin/index.ts`

```text
Plugin 加载流程:
① 从配置中读取 plugin 列表 (config.plugin)
② 对每个 plugin:
   · 本地文件 → 直接 import
   · npm 包 → 检查是否已安装 → 安装或加载
③ 注册 Plugin 的 hooks 到全局 hooks 列表
④ 在触发点调用所有注册的 hooks
```

**Plugin 触发示例**：

**文件**：`session/prompt.ts:582-601`（工具执行中的 Plugin 钩子）

```typescript
// 执行前钩子
yield* plugin.trigger(
  "tool.execute.before",
  { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID },
  { args },
)

// 执行工具
const result = yield* item.execute(args, ctx)

// 执行后钩子
yield* plugin.trigger(
  "tool.execute.after",
  { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID, args },
  output,
)
```

**自然语言解释**：Plugin 就像 opencode 的"中间件"。它在关键操作的前后插入自定义逻辑——例如在工具执行前记录日志、在工具执行后发送通知、在消息发送前修改内容。Plugin 的 trigger 函数遍历所有注册的 hooks，并发执行匹配的钩子。Plugin 加载器支持本地文件和 npm 包两种形式——本地文件用于项目自定义，npm 包用于社区分享。

## 11.4 涉及的 Effect 方法

本章涉及的 Effect 方法与前几章高度重叠，新增的要点：

| 方法 | 场景 |
|------|------|
| `Effect.gen` | PlanExit 工具的执行逻辑、Task 工具的子 Agent 调度 |
| `Effect.orDie` | PlanExit 中 session.get() 和 session.messages()——"不应该失败" |
| `Stream.filter` + `Stream.take` + `Stream.runCollect` | Skill 工具中扫描目录文件 |
| `Permission.merge()` | Plan/Build Agent 的权限合并（非 Effect，但是核心设计） |
| `plugin.trigger()` | 所有工具执行的 before/after 钩子 |

## 11.5 本章小结

Plan 模式的全链路涉及 6 个子系统：

1. **Agent 权限系统**：Plan Agent 通过 `edit: { "*": "deny" }` 实现只读约束
2. **System Prompt 注入**：`insertReminders()` 根据 Agent 状态注入 Plan/Build 提示词
3. **TodoWrite**：AI 维护结构化任务列表，持久化到数据库，注入 System Prompt 防止遗忘
4. **Task（多 Agent）**：主 Agent 派发 Subagent，并行执行，通过 `background` 参数支持异步
5. **Skill**：目录中的 `SKILL.md` 被发现、加载、注入 System Prompt，AI 自主调用
6. **Plugin**：事件钩子系统，在关键节点插入自定义逻辑

整个流程从用户输入开始，经过 Agent 选择 → Plan 权限激活 → LLM 多轮 Step → 工具执行（Task/TodoWrite/Question/Skill/PlanExit）→ 用户确认 → 切换到 Build Agent → 开始实现。每个环节都有明确的代码入口和 Effect-TS 类型安全保障。
