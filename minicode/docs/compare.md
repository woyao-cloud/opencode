
# 完整版 opencode 的 subagent 系统和 minicode 的差距非常大——完整版是一个生产级的多 agent 编排引擎，minicode 只是一个硬编码的两步管道。以下是具体差距：

1. Agent 定义系统
| 维度 | 完整版 | minicode |
|---|---|---|
| Agent 数量 | 7 个内置（build/plan/general/explore/scout/compaction/title/summary）+ 用户自定义 | 2 个硬编码（Planner/Builder） |
| Agent Schema | 12 个字段：name、description、mode、native、hidden、temperature、topP、color、permission、model、variant、prompt、options、steps | 无独立 Schema，直接写在 message.ts 里 |
| mode 字段 | "subagent" / "primary" / "all" 三种模式 | 无 |
| 权限系统 | 每个 agent 有独立的 Permission ruleset，继承父 session 的 deny 规则 | 无 |
| 用户自定义 | 通过 opencode.json 的 agent 字段可添加/覆盖任意 agent | 无 |
| Agent 生成 | Agent.generate() 用 LLM 自动生成新 agent 配置 | 无 |
2. SubAgent 执行引擎
| 维度 | 完整版 | minicode |
|---|---|---|
| 核心机制 | task tool — 通用 subagent 调度器，337 行 | 无通用调度器，Planner/Builder 是硬编码函数调用 |
| Session 隔离 | 每个 subagent 创建独立 Session（SQLite），有独立消息历史 | 无 session 隔离，直接函数调用 |
| 权限继承 | deriveSubagentSessionPermission() 合并父 agent deny + 父 session deny + subagent 自身规则 | 无 |
| 后台执行 | background: true 支持，通过 BackgroundJob 管理 | 无 |
| 任务恢复 | task_id 参数可恢复之前未完成的 subagent 任务 | 无 |
| 取消机制 | AbortController + Effect.acquireUseRelease 安全取消 | 无 |
| 并行执行 | 多个 task 调用可并行运行多个 subagent | 无（Builder 内部文件并行，但 agent 级串行） |
| 结果注入 | 后台任务完成后自动注入结果到父 session | 无 |
3. 通信机制
| 维度 | 完整版 | minicode |
|---|---|---|
| 通信方式 | 通过 Session + Message 持久化通信（SQLite） | 进程内 Effect PubSub（内存） |
| 消息持久化 | 所有 subagent 消息写入 SQLite，可回溯 | 无持久化 |
| 事件推送 | Bus.publish 推送 tool 状态、permission 请求、toast 通知到 TUI | 仅 agent-bus 内部消息 |
| 跨进程 | ACP 支持跨进程 agent 通信（JSON-RPC over stdio） | 无 |
4. 工具系统
| 维度 | 完整版 | minicode |
|---|---|---|
| Tool 定义 | 完整 Tool.define 系统，支持 JSON Schema 生成 | 有 Tool.define 但 subagent 不用 |
| task tool | 作为工具暴露给 LLM，LLM 可动态调用 | 无 |
| 工具权限过滤 | subagent 执行时自动过滤不允许的工具（如 todowrite、task） | 无 |
| 工具状态上报 | tool_call 的 pending/running/completed/error 状态实时推送到 TUI | 无 |
5. 代码量对比
| 模块 | 完整版 | minicode |
|---|---|---|
| Agent 定义 | 463 行 | 29 行（骨架） |
| SubAgent 调度 | 337 行（task tool） | 0 行 |
| 权限派生 | 34 行 | 0 行 |
| Agent 提示词 | 7 个专用 prompt 文件 | 1 个（build.txt，1 行） |
| Agent 总线 | 2000+ 行（ACP 协议） | ~300 行（agent-bus） |
结论
minicode 当前的 agent-bus 本质上是一个硬编码的两步管道（Plan → Build），不是真正的 subagent 系统。完整版的 subagent 是一个通用调度引擎：任何 agent 可以通过 task tool 动态创建子 session、设置独立权限、并行执行、后台运行、结果回传。
如果要缩小差距，minicode 需要：
1. 实现 task tool — 通用 subagent 调度器，接收 subagent_type + prompt，创建子 session 执行
2. 实现 deriveSubagentSessionPermission — 权限继承逻辑
3. 实现 background 模式 — 后台执行 + 结果注入
4. 实现 task_id 恢复 — 通过 session ID 恢复之前未完成的任务
5. 为每个 subagent 创建独立 Session（复用现有的 SQLite session 系统）
这些就是 Step 4 和 Step 5 的内容。要继续做吗？