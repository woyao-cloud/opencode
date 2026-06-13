# 第 9 章 · 多 Agent 协作架构

单个 AI Agent 的能力有限——上下文窗口有上限，专注领域有边界，单次推理的复杂度有天花板。opencode 通过多 Agent 协作架构来突破这些限制：主 Agent 可以将复杂任务拆解为子任务，派发给多个 Subagent 并发执行，然后汇总结果继续推进。

## 9.1 Agent 定义体系

### Agent 的三种 Mode

每个 Agent 在定义时声明其 Mode，Mode 决定了 Agent 的使用方式：

- **primary**：主 Agent，可以被用户直接调用。用户通过 `--agent` 参数或 Session 配置选择主 Agent。典型的 primary Agent 包括 `claude`（通用编程助手）、`build`（专注于构建和部署）、`plan`（专注于需求分析和架构设计）。

- **subagent**：子 Agent，只能被主 Agent 通过 Task 工具调用，不能直接被用户使用。Subagent 通常有更窄的专注领域和更受限的权限。例如，`code-reviewer` Subagent 只能读取文件和分析代码，不能修改文件。

- **all**：既可以作为主 Agent 也可以作为 Subagent 使用。这种 Agent 定义灵活但较少使用，因为大多数 Agent 的设计目标明确偏向一侧。

### Agent 定义的结构

每个 Agent 定义包含：

- **identifier**：唯一标识名（如 `claude`、`build`、`code-reviewer`）
- **description**：人类可读的描述
- **whenToUse**：给 AI 的建议——什么场景下应该选择这个 Agent
- **mode**：`primary` | `subagent` | `all`
- **systemPrompt**：该 Agent 专属的 System Prompt 模板（可以包含变量占位符）
- **permission**：权限配置（允许或拒绝哪些权限键）
- **model**：推荐的模型（可选）
- **native**：是否为框架内置 Agent（内置 Agent 有特殊处理逻辑）

### Agent 的存储位置

Agent 定义可以存储在三个位置：

1. **框架内置**：`packages/opencode/src/agent/` 目录下的内置 Agent 定义（如 `claude`、`build`、`plan`）
2. **项目级别**：`.opencode/agents/` 目录下的项目自定义 Agent
3. **全局级别**：`~/.config/opencode/agents/` 目录下的用户自定义 Agent

加载优先级：项目级别 > 全局级别 > 框架内置。这意味着项目可以覆盖框架内置的 Agent 定义。

## 9.2 Task 工具：子 Agent 的调度入口

Task 工具是多 Agent 协作的关键机制。当主 Agent 认为某个子任务适合交给 Subagent 处理时，它调用 Task 工具。

### Task 工具的输入

Task 工具接收以下参数：

- **subagent_name**：要使用的 Subagent 名称（如 `code-reviewer`、`explore`）
- **description**：子任务的简短描述（用于 UI 展示）
- **prompt**：发给 Subagent 的完整任务描述

### Task 工具的调度流程

1. **Agent 查找**：框架根据 `subagent_name` 查找对应的 Agent 定义。如果找不到，返回错误给主 Agent。

2. **权限检查**：Task 工具本身需要 `task` 权限。此外，Subagent 的权限配置决定了它在执行子任务时能使用哪些工具。

3. **上下文构建**：为 Subagent 构建独立的上下文：
   - Subagent 的 System Prompt
   - 主 Agent 发来的任务描述
   - 必要的项目环境信息（工作目录、文件列表等）
   - Subagent 可用工具的定义

4. **独立执行**：Subagent 在自己的上下文中运行，执行工具、产生响应。Subagent 的运行过程对主 Agent 透明——主 Agent 只看到最终结果。

5. **结果返回**：Subagent 完成后，其最终文本输出作为 Task 工具的结果返回给主 Agent。主 Agent 将结果纳入自己的上下文，继续推进主任务。

### Subagent 的权限隔离

Subagent 的权限由两个层面控制：

- **Agent 定义中的 permission 字段**：声明该 Subagent 允许使用哪些权限键。例如，`code-reviewer` 可能只允许 `read`、`glob`、`grep`、`lsp`，不允许 `bash` 和 `edit`。
- **主 Agent 的权限继承**：Subagent 不能拥有主 Agent 没有的权限。如果主 Agent 被用户拒绝了 `bash` 权限，即使 Subagent 定义中允许 `bash`，它也无法执行 Shell 命令。

这种双层权限控制确保了 Subagent 不会越权操作。

## 9.3 Session Fork：对话分支

Session Fork 是另一种形式的多 Agent 协作——不是并发执行，而是时序上的分支探索。

### Fork 的机制

Fork 操作创建一个新 Session，复制原 Session 到指定消息点为止的所有消息。新 Session 有独立的 Session ID，独立的后续对话历史，但共享相同的起点。

### Fork 的用途

- **方案探索**：在某个决策点 Fork 出多个分支，每个分支尝试不同的实现方案，最后比较结果
- **错误恢复**：当 AI 的某个修改方向被证明错误时，从修改前的消息点 Fork，尝试不同方向
- **团队协作**：不同开发者从同一个 Session 的某个节点 Fork，各自继续探索

### Fork 与 Subagent 的区别

- **Subagent**：并发执行，结果返回主 Agent，在主 Agent 的上下文中汇总
- **Fork**：时序分支，各分支独立发展，不汇总结果，由用户手动比较和选择

## 9.4 并发子任务

当主 Agent 同时派发多个 Task 时，这些子任务可以并发执行。

### 并发模型

多个 Task 工具调用在同一 Step 中被 LLM 返回时，它们被并行执行（与普通工具的并发调度相同，见第 3 章）。每个 Subagent 在自己的上下文中独立运行，互不干扰。

### 结果汇总

所有 Subagent 完成后，它们的结果作为多个 `tool_result` 注入主 Agent 的上下文。主 Agent 在下一 Step 中看到所有子任务的结果，进行综合分析。

### 并发控制

Subagent 的并发数量受框架的全局并发限制控制。每个 Subagent 消耗一个并发槽位，防止无限派生导致资源耗尽。

## 9.5 多 Agent 场景下的上下文隔离

多 Agent 协作面临的一个关键挑战是上下文隔离——每个 Subagent 需要足够的上下文来理解子任务，但又不能携带主 Agent 的全部历史（那会导致上下文快速膨胀）。

### 隔离策略

opencode 的上下文隔离策略是：

- **System Prompt 隔离**：每个 Subagent 使用自己的 System Prompt，而非主 Agent 的
- **消息历史隔离**：Subagent 不继承主 Agent 的完整对话历史，只接收主 Agent 发来的任务描述
- **工具集隔离**：Subagent 只能使用自己权限配置中允许的工具
- **文件系统共享**：Subagent 与主 Agent 共享同一个文件系统（工作目录），Subagent 的文件修改对主 Agent 可见

### 信息传递

主 Agent 向 Subagent 传递信息的方式是任务描述（prompt 参数）。主 Agent 需要在任务描述中提供足够的上下文——相关文件路径、问题背景、期望输出格式——让 Subagent 能够独立完成任务。

这种设计迫使主 Agent 在派发子任务时进行"信息压缩"——提炼出子任务真正需要的上下文，而非将全部历史倾倒给 Subagent。这既是限制，也是优势：它迫使更清晰的任务分解。

---

## 本章小结

opencode 的多 Agent 协作架构通过 Agent Mode 体系（primary/subagent/all）、Task 工具调度、Session Fork 分支和上下文隔离策略，实现了从简单的一对一派发到复杂的并发多 Agent 协作。Subagent 的权限双层控制和上下文隔离确保了协作的安全性。这套架构的核心设计哲学是：让主 Agent 负责"想清楚做什么"，让 Subagent 负责"把具体的事情做好"，通过清晰的任务分解和信息传递来实现高效协作。
