# miniopencode — 从零到完整 opencode 的 500 次迭代规划

> 目标：通过约 500 次小步迭代，从最小可运行版本逐步构建到完整 opencode 功能。
> 每次迭代都是可运行、可验证的增量。
> 三个核心包：`@miniopencode/core`（工具层）、`@miniopencode/llm`（LLM 层）、`@miniopencode/opencode`（主程序）

---

## 完整版 opencode 架构总览

### 包结构

```
packages/
├── core/     @opencode-ai/core   — 工具层（32 个源文件）
│   ├── util/         — 日志、错误、slug、opencode-process
│   ├── effect/       — Effect 工具（observability、memo-map、logger）
│   ├── installation/ — 版本号
│   ├── github-copilot/ — GitHub Copilot 集成
│   ├── plugin/       — 插件系统
│   ├── flag/         — Feature flags
│   └── 顶层: global.ts, filesystem.ts, schema.ts, session.ts, event.ts, model.ts, provider.ts, npm.ts, ...
│
├── llm/      @opencode-ai/llm    — LLM 抽象层（10 个源文件）
│   ├── protocols/     — 5 种协议（openai-chat, anthropic-messages, gemini, bedrock-converse, openai-responses）
│   ├── providers/     — 10+ 个 provider（openai, anthropic, google, azure, xai, ...）
│   ├── route/         — 路由层
│   ├── schema/        — 消息 schema
│   └── 顶层: llm.ts, provider.ts, tool.ts, tool-runtime.ts, cache-policy.ts
│
└── opencode/  opencode            — 主程序（50 个子模块）
    ├── cli/           — CLI 入口（yargs, TUI, 20+ 命令）
    ├── session/       — 会话系统（22 文件，核心 2157 行 prompt.ts）
    ├── tool/          — 工具系统（46 文件，20+ 工具）
    ├── agent/         — Agent 定义（463 行）
    ├── project/       — 项目引导（10 文件）
    ├── effect/        — Effect 运行时（12 文件）
    ├── bus/           — 事件总线（3 文件）
    ├── permission/    — 权限系统（4 文件）
    ├── background/    — 后台任务（1 文件）
    ├── config/        — 配置加载（23 文件）
    ├── acp/           — Agent Client Protocol
    ├── mcp/           — Model Context Protocol
    ├── file/          — 文件操作
    ├── git/           — Git 操作
    ├── lsp/           — 语言服务器
    ├── server/        — HTTP 服务器
    ├── storage/       — SQLite 存储
    ├── shell/         — Shell/PTY
    ├── skill/         — Skill 系统
    ├── plugin/        — 插件系统
    ├── reference/     — 引用系统
    ├── provider/      — Provider 管理
    ├── auth/          — 认证
    ├── pty/           — PTY 终端
    ├── image/         — 图片处理
    ├── question/      — 问题提示
    ├── format/        — 格式化
    ├── snapshot/      — 快照
    ├── sync/          — 同步
    ├── share/         — 分享
    ├── worktree/      — Git worktree
    ├── control-plane/ — 控制面
    ├── installation/  — 安装
    ├── patch/         — 补丁
    ├── v2/            — V2 迁移
    ├── id/            — ID 生成
    ├── ide/           — IDE 集成
    └── 顶层: index.ts（251 行 CLI 入口）
```

### 核心数据流

```
用户输入
  │
  ▼
CLI (yargs) → run command
  │
  ▼
Bootstrap → InstanceLayer (所有 Service 的 Layer.mergeAll)
  │
  ▼
Session.create() → SQLite 持久化
  │
  ▼
SessionPrompt.prompt() ← 核心引擎 (2157 行)
  ├── 解析 prompt parts (文本/文件/引用)
  ├── 构建 system prompt (agent + instruction + tools)
  ├── 调用 LLM.generate() 带 tools
  ├── 工具执行循环 (maxSteps)
  │   ├── ToolRegistry.tools() → 按 agent permission + model 过滤
  │   ├── 执行工具 → 结果截断 → 继续 LLM 调用
  │   └── task tool → 子 Session → 递归调用 prompt()
  ├── 处理结果 → 持久化消息
  └── 返回最终文本
```

### 关键依赖链

```
ToolRegistry → Agent → Config
            → Session → Storage (SQLite)
            → BackgroundJob
            → Provider
            → Git
            → Permission
            → Truncate
            → 20+ 其他 Service

SessionPrompt → ToolRegistry
              → Session
              → Agent
              → LLM
              → Provider
              → Bus
              → Permission
              → 15+ 其他 Service
```

---

## 迭代路线图（500 次迭代）

### 符号说明
- **核心路径** — 必须实现，否则系统不可用
- **增强路径** — 提升体验，可延后
- **外围路径** — 完整版功能，可长期迭代

---

## Phase 0: 脚手架（迭代 1-10）

建立 monorepo 结构、包配置、构建工具。

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 1 | 创建目录结构 | `package.json`, `tsconfig.json` | 30 | monorepo 基础 |
| 2 | core 包骨架 | `packages/core/package.json` | 15 | 包配置 |
| 3 | llm 包骨架 | `packages/llm/package.json` | 15 | 包配置 |
| 4 | opencode 包骨架 | `packages/opencode/package.json` | 20 | 包配置 |
| 5 | 根 tsconfig | `tsconfig.json` | 15 | 路径别名 |
| 6 | core: global.ts | `packages/core/src/global.ts` | 20 | 全局路径 |
| 7 | core: schema.ts | `packages/core/src/schema.ts` | 15 | 通用 Schema |
| 8 | core: util/log.ts | `packages/core/src/util/log.ts` | 30 | 日志系统 |
| 9 | core: util/error.ts | `packages/core/src/util/error.ts` | 15 | 命名错误 |
| 10 | core: util/slug.ts | `packages/core/src/util/slug.ts` | 10 | ID 生成 |

**验证**: `bun install` + `bun typecheck` 通过

---

## Phase 1: 最小 LLM 调用（迭代 11-30）

**目标**: 能输入 prompt，调用 LLM，输出文本。这是整个系统的基础。

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 11 | llm: provider schema | `packages/llm/src/schema/ids.ts` | 15 | ProviderID/ModelID brand |
| 12 | llm: 消息 schema | `packages/llm/src/schema/messages.ts` | 40 | Message/ContentPart/ToolDefinition |
| 13 | llm: provider 接口 | `packages/llm/src/provider.ts` | 20 | Provider 抽象 |
| 14 | llm: OpenAI provider | `packages/llm/src/providers/openai.ts` | 25 | 第一个 provider |
| 15 | llm: OpenAI 兼容 provider | `packages/llm/src/providers/openai-compatible.ts` | 20 | 多 provider 支持 |
| 16 | llm: LLM.generate | `packages/llm/src/llm.ts` | 50 | 核心 LLM 调用 |
| 17 | llm: LLM.stream | `packages/llm/src/llm.ts` | 30 | 流式输出 |
| 18 | llm: tool 定义 | `packages/llm/src/tool.ts` | 30 | Tool Schema |
| 19 | llm: tool-runtime | `packages/llm/src/tool-runtime.ts` | 40 | 工具调用运行时 |
| 20 | llm: index.ts | `packages/llm/src/index.ts` | 10 | 模块导出 |
| 21 | opencode: effect/instance-ref | `packages/opencode/src/effect/instance-ref.ts` | 10 | InstanceRef/WorkspaceRef |
| 22 | opencode: effect/instance-state | `packages/opencode/src/effect/instance-state.ts` | 30 | ScopedCache |
| 23 | opencode: effect/run-service | `packages/opencode/src/effect/run-service.ts` | 30 | makeRuntime |
| 24 | opencode: effect/bridge | `packages/opencode/src/effect/bridge.ts` | 25 | EffectBridge |
| 25 | opencode: env | `packages/opencode/src/env/index.ts` | 15 | 环境变量 |
| 26 | opencode: CLI 入口 | `packages/opencode/src/index.ts` | 40 | yargs 基础 |
| 27 | opencode: CLI bootstrap | `packages/opencode/src/cli/bootstrap.ts` | 30 | AppRuntime |
| 28 | opencode: run 命令 | `packages/opencode/src/cli/cmd/run.ts` | 40 | 单次 prompt |
| 29 | opencode: serve 命令 | `packages/opencode/src/cli/cmd/serve.ts` | 40 | HTTP 服务 |
| 30 | 验证 | — | — | `miniopencode run -p "hello"` |

**验证**: `miniopencode run -p "hello"` 调用 LLM 并返回文本

---

## Phase 2: 配置与权限（迭代 31-50）

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 31 | opencode: config schema | `packages/opencode/src/config/config.ts` | 40 | Config Service |
| 32 | opencode: config agent | `packages/opencode/src/config/agent.ts` | 20 | Agent 配置 |
| 33 | opencode: config provider | `packages/opencode/src/config/provider.ts` | 20 | Provider 配置 |
| 34 | opencode: config 加载 | `packages/opencode/src/config/config.ts` | 30 | miniopencode.json |
| 35 | opencode: permission schema | `packages/opencode/src/permission/schema.ts` | 10 | PermissionID |
| 36 | opencode: permission Rule | `packages/opencode/src/permission/index.ts` | 30 | Rule/Ruleset/Action |
| 37 | opencode: permission evaluate | `packages/opencode/src/permission/evaluate.ts` | 20 | 规则匹配 |
| 38 | opencode: permission merge | `packages/opencode/src/permission/index.ts` | 15 | 合并 ruleset |
| 39 | opencode: permission fromConfig | `packages/opencode/src/permission/index.ts` | 20 | 嵌套配置 |
| 40 | opencode: permission Service | `packages/opencode/src/permission/index.ts` | 30 | resolve/request |
| 41 | opencode: agent schema | `packages/opencode/src/agent/agent.ts` | 40 | Agent.Info |
| 42 | opencode: agent Service | `packages/opencode/src/agent/agent.ts` | 40 | get/list/defaultAgent |
| 43 | opencode: agent prompt | `packages/opencode/src/agent/prompt/build.txt` | 5 | 默认 prompt |
| 44 | opencode: project Service | `packages/opencode/src/project/project.ts` | 30 | 项目信息 |
| 45 | opencode: project bootstrap | `packages/opencode/src/project/bootstrap.ts` | 40 | InstanceLayer |
| 46 | opencode: CLI 集成配置 | `packages/opencode/src/cli/bootstrap.ts` | 20 | AppLayer |
| 47 | opencode: run 命令集成 | `packages/opencode/src/cli/cmd/run.ts` | 20 | 使用 Agent/Config |
| 48 | opencode: plugin 骨架 | `packages/opencode/src/plugin/index.ts` | 15 | 空实现 |
| 49 | opencode: skill 骨架 | `packages/opencode/src/skill/index.ts` | 15 | 空实现 |
| 50 | 验证 | — | — | 配置加载 + 权限评估 |

**验证**: `miniopencode.json` 配置生效，权限规则可评估

---

## Phase 3: 工具系统（迭代 51-80）

**目标**: 实现 Tool 定义、注册、执行，LLM 可调用工具。

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 51 | opencode: tool 接口 | `packages/opencode/src/tool/tool.ts` | 50 | Def/Info/define/init |
| 52 | opencode: read 工具 | `packages/opencode/src/tool/read.ts` | 30 | 第一个工具 |
| 53 | opencode: write 工具 | `packages/opencode/src/tool/write.ts` | 30 | 文件写入 |
| 54 | opencode: bash 工具 | `packages/opencode/src/tool/bash.ts` | 40 | Shell 执行 |
| 55 | opencode: glob 工具 | `packages/opencode/src/tool/glob.ts` | 30 | 文件搜索 |
| 56 | opencode: grep 工具 | `packages/opencode/src/tool/grep.ts` | 30 | 内容搜索 |
| 57 | opencode: tool registry | `packages/opencode/src/tool/registry.ts` | 50 | 注册/查询 |
| 58 | opencode: tool 截断 | `packages/opencode/src/tool/truncate.ts` | 40 | 输出截断 |
| 59 | opencode: tool json-schema | `packages/opencode/src/tool/json-schema.ts` | 30 | JSON Schema 生成 |
| 60 | opencode: tool 集成到 LLM | `packages/llm/src/llm.ts` | 30 | tools 参数 |
| 61 | opencode: run 命令带工具 | `packages/opencode/src/cli/cmd/run.ts` | 30 | 工具传递 |
| 62 | opencode: 交互模式 | `packages/opencode/src/cli/cmd/run.ts` | 60 | REPL + 工具 |
| 63 | opencode: file Service | `packages/opencode/src/file/index.ts` | 20 | 文件操作封装 |
| 64 | opencode: git Service | `packages/opencode/src/git/index.ts` | 30 | Git 操作 |
| 65 | opencode: command 骨架 | `packages/opencode/src/command/index.ts` | 20 | 命令模板 |
| 66 | opencode: worktree 骨架 | `packages/opencode/src/worktree/index.ts` | 20 | Git worktree |
| 67 | 验证: 交互模式 | — | — | REPL + read/write/bash |
| 68 | 验证: 工具截断 | — | — | 大输出截断 |
| 69 | 验证: 多工具调用 | — | — | LLM 连续调用工具 |
| 70 | 验证: maxSteps | — | — | 工具循环上限 |

**验证**: 交互模式下 LLM 可调用 read/write/bash 工具

---

## Phase 4: Session 系统（迭代 71-110）

**目标**: 实现完整的会话管理，包括 SQLite 持久化、消息历史、会话生命周期。

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 71 | opencode: session schema | `packages/opencode/src/session/schema.ts` | 20 | SessionID/MessageID/PartID |
| 72 | opencode: session id | `packages/opencode/src/session/id.ts` | 10 | 有序 ID |
| 73 | opencode: session SQL schema | `packages/opencode/src/session/session.sql.ts` | 20 | Drizzle 表定义 |
| 74 | opencode: session create | `packages/opencode/src/session/session.ts` | 30 | 创建会话 |
| 75 | opencode: session get/list | `packages/opencode/src/session/session.ts` | 30 | 查询会话 |
| 76 | opencode: session appendMessage | `packages/opencode/src/session/session.ts` | 30 | 追加消息 |
| 77 | opencode: session messages | `packages/opencode/src/session/session.ts` | 30 | 读取消息 |
| 78 | opencode: session Service | `packages/opencode/src/session/session.ts` | 30 | Service 封装 |
| 79 | opencode: session 集成到 run | `packages/opencode/src/cli/cmd/run.ts` | 20 | 使用 Session |
| 80 | opencode: message-v2 | `packages/opencode/src/session/message-v2.ts` | 80 | 消息模型 |
| 81 | opencode: session status | `packages/opencode/src/session/status.ts` | 30 | 会话状态 |
| 82 | opencode: session run-state | `packages/opencode/src/session/run-state.ts` | 40 | 运行状态 |
| 83 | opencode: session 持久化验证 | — | — | SQLite 读写 |
| 84 | opencode: session 列表 CLI | `packages/opencode/src/cli/cmd/session.ts` | 30 | session list |
| 85 | opencode: session 查看 CLI | `packages/opencode/src/cli/cmd/session.ts` | 30 | session get |
| 86 | opencode: serve 集成 session | `packages/opencode/src/cli/cmd/serve.ts` | 40 | HTTP API |
| 87 | opencode: bus event | `packages/opencode/src/bus/bus-event.ts` | 10 | 事件定义 |
| 88 | opencode: bus PubSub | `packages/opencode/src/bus/index.ts` | 60 | 发布订阅 |
| 89 | opencode: bus Service | `packages/opencode/src/bus/index.ts` | 30 | Service 封装 |
| 90 | opencode: bus 集成 | `packages/opencode/src/project/bootstrap.ts` | 10 | 注册 Bus |
| 91 | 验证: 会话创建 | — | — | SQLite 有记录 |
| 92 | 验证: 消息持久化 | — | — | 重启后消息还在 |
| 93 | 验证: HTTP API | — | — | curl 测试 |
| 94 | 验证: Bus 事件 | — | — | 发布/订阅 |
| 95 | 验证: 多会话 | — | — | 创建/列出/查看 |
| 96 | 验证: 会话状态 | — | — | idle/running/error |
| 97 | 验证: 消息分页 | — | — | 大量消息 |
| 98 | 验证: 会话删除 | — | — | 清理 |
| 99 | 验证: 跨会话隔离 | — | — | 消息不串 |
| 100 | 验证: 完整流程 | — | — | run → session → LLM → 持久化 |

**验证**: 会话创建、消息持久化、重启后恢复

---

## Phase 5: Prompt 引擎（迭代 111-150）

**目标**: 实现 SessionPrompt.prompt() 核心引擎——这是 opencode 最复杂的部分（完整版 2157 行）。

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 111 | opencode: prompt 基础 | `packages/opencode/src/session/prompt.ts` | 80 | PromptInput/PromptOutput |
| 112 | opencode: system prompt | `packages/opencode/src/session/system.ts` | 40 | 系统提示词构建 |
| 113 | opencode: instruction | `packages/opencode/src/session/instruction.ts` | 30 | 指令系统 |
| 114 | opencode: prompt 解析 parts | `packages/opencode/src/session/prompt.ts` | 60 | 文本/文件/引用 |
| 115 | opencode: prompt 构建消息 | `packages/opencode/src/session/prompt.ts` | 50 | 消息组装 |
| 116 | opencode: prompt 调用 LLM | `packages/opencode/src/session/prompt.ts` | 50 | LLM.generate + tools |
| 117 | opencode: prompt 工具循环 | `packages/opencode/src/session/prompt.ts` | 60 | maxSteps 循环 |
| 118 | opencode: prompt 结果处理 | `packages/opencode/src/session/prompt.ts` | 40 | 解析/持久化 |
| 119 | opencode: prompt loop | `packages/opencode/src/session/prompt.ts` | 40 | 持续对话 |
| 120 | opencode: prompt cancel | `packages/opencode/src/session/prompt.ts` | 20 | 取消机制 |
| 121 | opencode: prompt 错误处理 | `packages/opencode/src/session/prompt.ts` | 30 | 重试/回退 |
| 122 | opencode: prompt Service | `packages/opencode/src/session/prompt.ts` | 30 | Service 封装 |
| 123 | opencode: LLM Service | `packages/opencode/src/session/llm.ts` | 40 | LLM 封装 |
| 124 | opencode: prompt 集成到 run | `packages/opencode/src/cli/cmd/run.ts` | 30 | 使用 Prompt |
| 125 | opencode: prompt 集成到 serve | `packages/opencode/src/cli/cmd/serve.ts` | 30 | HTTP 使用 Prompt |
| 126 | 验证: 单轮对话 | — | — | prompt → LLM → 回复 |
| 127 | 验证: 多轮对话 | — | — | 历史上下文 |
| 128 | 验证: 工具调用循环 | — | — | LLM 调用工具 → 继续 |
| 129 | 验证: maxSteps 限制 | — | — | 工具循环上限 |
| 130 | 验证: 取消机制 | — | — | 中断正在执行的 prompt |
| 131 | 验证: 错误恢复 | — | — | LLM 调用失败重试 |
| 132 | 验证: 消息持久化 | — | — | 所有消息写入 SQLite |
| 133 | 验证: 系统提示词 | — | — | agent prompt 生效 |
| 134 | 验证: 指令系统 | — | — | instruction 注入 |
| 135 | 验证: 引用解析 | — | — | @引用文件 |
| 136 | 验证: 文件附件 | — | — | 文件作为上下文 |
| 137 | 验证: 多工具 | — | — | read/write/bash/glob/grep |
| 138 | 验证: 工具结果截断 | — | — | 大输出截断 |
| 139 | 验证: 工具权限 | — | — | 按 agent 过滤 |
| 140 | 验证: 完整流程 | — | — | prompt → 工具 → 回复 → 持久化 |

**验证**: 多轮对话 + 工具调用循环

---

## Phase 6: SubAgent 系统（迭代 141-170）

**目标**: 实现 task tool，支持 LLM 动态创建子 agent 执行任务。

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 141 | opencode: task tool 基础 | `packages/opencode/src/tool/task.ts` | 60 | subagent_type + prompt |
| 142 | opencode: task 子 session | `packages/opencode/src/tool/task.ts` | 30 | 独立 Session |
| 143 | opencode: task 权限继承 | `packages/opencode/src/agent/subagent-permissions.ts` | 35 | deriveSubagentSessionPermission |
| 144 | opencode: task 工具过滤 | `packages/opencode/src/tool/task.ts` | 20 | 按 permission 过滤 |
| 145 | opencode: task 后台模式 | `packages/opencode/src/tool/task.ts` | 30 | background: true |
| 146 | opencode: task 安全取消 | `packages/opencode/src/tool/task.ts` | 30 | acquireUseRelease |
| 147 | opencode: task task_id 恢复 | `packages/opencode/src/tool/task.ts` | 20 | 恢复子 session |
| 148 | opencode: background Job | `packages/opencode/src/background/job.ts` | 80 | 后台任务管理 |
| 149 | opencode: background 集成 | `packages/opencode/src/project/bootstrap.ts` | 10 | 注册 BackgroundJob |
| 150 | opencode: 内置 subagent | `packages/opencode/src/agent/agent.ts` | 40 | build/general/explore |
| 151 | opencode: explore prompt | `packages/opencode/src/agent/prompt/explore.txt` | 15 | 专用 prompt |
| 152 | opencode: general prompt | `packages/opencode/src/agent/prompt/general.txt` | 10 | 专用 prompt |
| 153 | opencode: task 集成到 prompt | `packages/opencode/src/session/prompt.ts` | 30 | TaskPromptOps |
| 154 | opencode: task 结果注入 | `packages/opencode/src/tool/task.ts` | 30 | 后台结果注入父 session |
| 155 | 验证: task 调用 subagent | — | — | task(subagent_type="explore") |
| 156 | 验证: task 权限继承 | — | — | 子 session 继承 deny 规则 |
| 157 | 验证: task 后台执行 | — | — | background: true |
| 158 | 验证: task 恢复 | — | — | task_id 恢复 |
| 159 | 验证: task 取消 | — | — | 中断子任务 |
| 160 | 验证: 多 subagent | — | — | 并行 task 调用 |
| 161 | 验证: explore agent | — | — | 代码搜索 |
| 162 | 验证: general agent | — | — | 通用子任务 |
| 163 | 验证: 后台结果注入 | — | — | 完成通知父 session |
| 164 | 验证: BackgroundJob 管理 | — | — | list/get/cancel |
| 165 | 验证: 工具过滤 | — | — | subagent 不能调用 todowrite |
| 166 | 验证: 嵌套 task | — | — | subagent 再调 task |
| 167 | 验证: 错误传播 | — | — | subagent 错误 → 父 session |
| 168 | 验证: 并发限制 | — | — | 防止重复 task |
| 169 | 验证: 资源清理 | — | — | 子 session 关闭 |
| 170 | 验证: 完整流程 | — | — | task → subagent → 结果 → 父 session |

**验证**: LLM 可通过 task tool 动态创建 subagent 执行任务

---

## Phase 7: 权限与安全（迭代 171-200）

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 171 | opencode: permission 请求 | `packages/opencode/src/permission/index.ts` | 40 | ask/reply |
| 172 | opencode: permission 事件 | `packages/opencode/src/permission/index.ts` | 20 | Bus 事件 |
| 173 | opencode: permission 持久化 | `packages/opencode/src/permission/index.ts` | 30 | SQLite 持久化 |
| 174 | opencode: permission 评估链 | `packages/opencode/src/permission/evaluate.ts` | 20 | 多 ruleset |
| 175 | opencode: permission 通配符 | `packages/opencode/src/util/wildcard.ts` | 30 | 模式匹配 |
| 176 | opencode: permission arity | `packages/opencode/src/permission/arity.ts` | 160 | 命令前缀 |
| 177 | opencode: tool 权限检查 | `packages/opencode/src/tool/tool.ts` | 20 | ctx.ask |
| 178 | opencode: session 权限 | `packages/opencode/src/session/session.ts` | 20 | permission 字段 |
| 179 | opencode: 默认权限规则 | `packages/opencode/src/agent/agent.ts` | 30 | defaults |
| 180 | 验证: 权限请求 | — | — | ask → allow/deny |
| 181 | 验证: 权限持久化 | — | — | always 记住 |
| 182 | 验证: 权限继承 | — | — | 子 session 继承 |
| 183 | 验证: 工具权限 | — | — | 按 permission 过滤 |
| 184 | 验证: 通配符匹配 | — | — | *.env 模式 |
| 185 | 验证: 命令 arity | — | — | git checkout → 2 tokens |
| 186 | 验证: 默认 deny | — | — | 未配置的默认行为 |
| 187 | 验证: 权限事件 | — | — | Bus 事件通知 |
| 188 | 验证: 批量权限 | — | — | 多个 pattern |
| 189 | 验证: 权限错误 | — | — | DeniedError/RejectedError |
| 190 | 验证: 权限 UI | — | — | 终端提示 |
| 191 | 验证: 外部目录 | — | — | external_directory 规则 |
| 192 | 验证: 只读模式 | — | — | edit: deny |
| 193 | 验证: 环境文件保护 | — | — | .env 文件 |
| 194 | 验证: 权限合并 | — | — | defaults + user + agent |
| 195 | 验证: 权限覆盖 | — | — | 用户配置覆盖默认 |
| 196 | 验证: 权限调试 | — | — | 日志输出 |
| 197 | 验证: 权限性能 | — | — | 大量规则 |
| 198 | 验证: 权限边界 | — | — | 空 ruleset |
| 199 | 验证: 权限安全 | — | — | 不可绕过 |
| 200 | 验证: 完整流程 | — | — | 权限请求 → 用户选择 → 执行 |

**验证**: 权限系统完整可用，支持 ask/allow/deny/always

---

## Phase 8: 配置系统完善（迭代 201-230）

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 201 | opencode: config 多文件 | `packages/opencode/src/config/config.ts` | 30 | 多目录搜索 |
| 202 | opencode: config 合并 | `packages/opencode/src/config/config.ts` | 20 | 深层合并 |
| 203 | opencode: config markdown | `packages/opencode/src/config/markdown.ts` | 30 | Markdown 配置 |
| 204 | opencode: config permission | `packages/opencode/src/config/permission.ts` | 20 | 权限配置 |
| 205 | opencode: config mcp | `packages/opencode/src/config/mcp.ts` | 30 | MCP 配置 |
| 206 | opencode: config lsp | `packages/opencode/src/config/lsp.ts` | 20 | LSP 配置 |
| 207 | opencode: config plugin | `packages/opencode/src/config/plugin.ts` | 20 | 插件配置 |
| 208 | opencode: config provider | `packages/opencode/src/config/provider.ts` | 20 | Provider 配置 |
| 209 | opencode: config agent | `packages/opencode/src/config/agent.ts` | 20 | Agent 配置 |
| 210 | opencode: config command | `packages/opencode/src/config/command.ts` | 20 | 命令配置 |
| 211 | opencode: config server | `packages/opencode/src/config/server.ts` | 15 | 服务器配置 |
| 212 | opencode: config paths | `packages/opencode/src/config/paths.ts` | 15 | 路径配置 |
| 213 | opencode: config parse | `packages/opencode/src/config/parse.ts` | 30 | 配置解析 |
| 214 | opencode: config error | `packages/opencode/src/config/error.ts` | 15 | 配置错误 |
| 215 | opencode: config formatter | `packages/opencode/src/config/formatter.ts` | 20 | 配置格式化 |
| 216 | opencode: config variable | `packages/opencode/src/config/variable.ts` | 20 | 变量替换 |
| 217 | opencode: config managed | `packages/opencode/src/config/managed.ts` | 30 | 托管配置 |
| 218 | opencode: config entry-name | `packages/opencode/src/config/entry-name.ts` | 15 | 入口名称 |
| 219 | opencode: config attachment | `packages/opencode/src/config/attachment.ts` | 20 | 附件配置 |
| 220 | opencode: config reference | `packages/opencode/src/config/reference.ts` | 20 | 引用配置 |
| 221 | opencode: config skills | `packages/opencode/src/config/skills.ts` | 15 | Skill 配置 |
| 222 | opencode: config console-state | `packages/opencode/src/config/console-state.ts` | 20 | 控制台状态 |
| 223 | opencode: config model-id | `packages/opencode/src/config/model-id.ts` | 15 | 模型 ID |
| 224 | 验证: 多目录配置 | — | — | 项目/用户/全局 |
| 225 | 验证: 配置合并 | — | — | 深层覆盖 |
| 226 | 验证: 配置错误 | — | — | 无效配置提示 |
| 227 | 验证: 变量替换 | — | — | $HOME 等 |
| 228 | 验证: 配置热重载 | — | — | 文件变化重载 |
| 229 | 验证: 配置验证 | — | — | Schema 验证 |
| 230 | 验证: 完整配置 | — | — | 所有配置项生效 |

**验证**: 完整的配置系统，支持多目录、合并、验证

---

## Phase 9: Provider 系统（迭代 231-260）

**目标**: 实现多 provider 支持、路由、认证。

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 231 | opencode: provider Service | `packages/opencode/src/provider/provider.ts` | 60 | Provider 管理 |
| 232 | opencode: provider schema | `packages/opencode/src/provider/schema.ts` | 20 | ProviderID/ModelID |
| 233 | opencode: provider auth | `packages/opencode/src/provider/auth.ts` | 40 | API Key 管理 |
| 234 | opencode: provider transform | `packages/opencode/src/provider/transform.ts` | 30 | Provider 转换 |
| 235 | opencode: provider 路由 | `packages/opencode/src/provider/route.ts` | 30 | 模型路由 |
| 236 | opencode: provider 默认模型 | `packages/opencode/src/provider/provider.ts` | 20 | 默认选择 |
| 237 | opencode: provider 模型列表 | `packages/opencode/src/provider/provider.ts` | 30 | 可用模型 |
| 238 | opencode: provider 语言 | `packages/opencode/src/provider/provider.ts` | 20 | ai-sdk 语言 |
| 239 | opencode: auth Service | `packages/opencode/src/auth/index.ts` | 40 | 认证管理 |
| 240 | opencode: auth 存储 | `packages/opencode/src/auth/index.ts` | 20 | 安全存储 |
| 241 | opencode: auth 登录 CLI | `packages/opencode/src/cli/cmd/account.ts` | 30 | auth login |
| 242 | opencode: providers CLI | `packages/opencode/src/cli/cmd/providers.ts` | 30 | 列出 provider |
| 243 | opencode: models CLI | `packages/opencode/src/cli/cmd/models.ts` | 30 | 列出模型 |
| 244 | opencode: llm 协议路由 | `packages/llm/src/route/index.ts` | 40 | 协议选择 |
| 245 | opencode: llm Anthropic 协议 | `packages/llm/src/protocols/anthropic-messages.ts` | 60 | 第二协议 |
| 246 | opencode: llm Gemini 协议 | `packages/llm/src/protocols/gemini.ts` | 60 | 第三协议 |
| 247 | opencode: llm Anthropic provider | `packages/llm/src/providers/anthropic.ts` | 30 | 第二 provider |
| 248 | opencode: llm Google provider | `packages/llm/src/providers/google.ts` | 30 | 第三 provider |
| 249 | opencode: llm Azure provider | `packages/llm/src/providers/azure.ts` | 30 | 第四 provider |
| 250 | opencode: llm cache-policy | `packages/llm/src/cache-policy.ts` | 30 | 缓存策略 |
| 251 | 验证: 多 provider | — | — | OpenAI + Anthropic |
| 252 | 验证: 模型路由 | — | — | 按模型选择 provider |
| 253 | 验证: API Key 管理 | — | — | 安全存储 |
| 254 | 验证: auth login | — | — | OAuth 流程 |
| 255 | 验证: 模型列表 | — | — | 可用模型查询 |
| 256 | 验证: 协议切换 | — | — | OpenAI ↔ Anthropic |
| 257 | 验证: 缓存策略 | — | — | 请求缓存 |
| 258 | 验证: provider 错误 | — | — | 无效 API Key |
| 259 | 验证: 默认模型 | — | — | 配置默认 |
| 260 | 验证: 完整流程 | — | — | 切换 provider 后运行 |

**验证**: 支持多个 LLM provider，可切换

---

## Phase 10: 存储系统（迭代 261-290）

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 261 | opencode: storage Service | `packages/opencode/src/storage/storage.ts` | 40 | 存储抽象 |
| 262 | opencode: storage db | `packages/opencode/src/storage/db.ts` | 30 | SQLite 连接 |
| 263 | opencode: storage bun | `packages/opencode/src/storage/db.bun.ts` | 20 | Bun SQLite |
| 264 | opencode: storage node | `packages/opencode/src/storage/db.node.ts` | 20 | Node SQLite |
| 265 | opencode: data-migration | `packages/opencode/src/data-migration.ts` | 60 | 数据迁移 |
| 266 | opencode: json-migration | `packages/opencode/src/storage/json-migration.ts` | 80 | JSON 迁移 |
| 267 | opencode: session SQL 完善 | `packages/opencode/src/session/session.sql.ts` | 30 | 完整表定义 |
| 268 | opencode: project SQL | `packages/opencode/src/project/project.sql.ts` | 20 | 项目表 |
| 269 | opencode: permission SQL | `packages/opencode/src/permission/index.ts` | 20 | 权限持久化 |
| 270 | opencode: snapshot Service | `packages/opencode/src/snapshot/index.ts` | 40 | 快照系统 |
| 271 | 验证: SQLite 初始化 | — | — | 自动建表 |
| 272 | 验证: 数据迁移 | — | — | 版本升级 |
| 273 | 验证: 快照创建 | — | — | 会话快照 |
| 274 | 验证: 快照恢复 | — | — | 从快照恢复 |
| 275 | 验证: 跨平台存储 | — | — | Bun + Node |
| 276 | 验证: 存储性能 | — | — | 大量消息 |
| 277 | 验证: 存储错误 | — | — | 磁盘满 |
| 278 | 验证: 并发访问 | — | — | 多进程 |
| 279 | 验证: 数据完整性 | — | — | 事务 |
| 280 | 验证: 迁移回滚 | — | — | 失败回滚 |

**验证**: 完整的存储系统，支持迁移和快照

---

## Phase 11: 文件系统与 Git（迭代 291-320）

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 291 | opencode: file 完善 | `packages/opencode/src/file/index.ts` | 30 | 文件操作 |
| 292 | opencode: file watcher | `packages/opencode/src/file/watcher.ts` | 50 | 文件监听 |
| 293 | opencode: file ripgrep | `packages/opencode/src/file/ripgrep.ts` | 40 | 快速搜索 |
| 294 | opencode: file ignore | `packages/opencode/src/file/ignore.ts` | 30 | .gitignore |
| 295 | opencode: git 完善 | `packages/opencode/src/git/index.ts` | 60 | diff/status/log |
| 296 | opencode: git branch | `packages/opencode/src/git/index.ts` | 20 | 分支操作 |
| 297 | opencode: git commit | `packages/opencode/src/git/index.ts` | 30 | 提交 |
| 298 | opencode: git worktree | `packages/opencode/src/worktree/index.ts` | 40 | Worktree 管理 |
| 299 | opencode: format Service | `packages/opencode/src/format/index.ts` | 30 | 格式化 |
| 300 | opencode: lsp Service | `packages/opencode/src/lsp/lsp.ts` | 60 | 语言服务器 |
| 301 | opencode: lsp 工具 | `packages/opencode/src/tool/lsp.ts` | 40 | LSP 工具 |
| 302 | opencode: edit 工具 | `packages/opencode/src/tool/edit.ts` | 40 | 编辑工具 |
| 303 | opencode: apply_patch 工具 | `packages/opencode/src/tool/apply_patch.ts` | 40 | 补丁工具 |
| 304 | opencode: shell 工具完善 | `packages/opencode/src/tool/shell.ts` | 60 | Shell 执行 |
| 305 | opencode: shell ID | `packages/opencode/src/tool/shell/id.ts` | 10 | Shell 标识 |
| 306 | 验证: 文件监听 | — | — | 文件变化通知 |
| 307 | 验证: ripgrep 搜索 | — | — | 快速全文搜索 |
| 308 | 验证: git diff | — | — | 变更查看 |
| 309 | 验证: git commit | — | — | 提交工作流 |
| 310 | 验证: LSP 诊断 | — | — | 错误提示 |
| 311 | 验证: edit 工具 | — | — | 精确编辑 |
| 312 | 验证: apply_patch | — | — | 补丁应用 |
| 313 | 验证: worktree | — | — | 多工作目录 |
| 314 | 验证: 格式化 | — | — | 代码格式化 |
| 315 | 验证: 文件忽略 | — | — | .gitignore 支持 |
| 316 | 验证: 大文件处理 | — | — | 截断/分页 |
| 317 | 验证: 二进制文件 | — | — | 安全处理 |
| 318 | 验证: 符号链接 | — | — | 安全跟随 |
| 319 | 验证: 文件权限 | — | — | 只读检测 |
| 320 | 验证: 完整流程 | — | — | 编辑 → LSP → Git |

**验证**: 完整的文件操作和 Git 集成

---

## Phase 12: 高级会话功能（迭代 321-360）

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 321 | opencode: session compaction | `packages/opencode/src/session/compaction.ts` | 80 | 会话压缩 |
| 322 | opencode: session retry | `packages/opencode/src/session/retry.ts` | 50 | 自动重试 |
| 323 | opencode: session revert | `packages/opencode/src/session/revert.ts` | 60 | 会话回退 |
| 324 | opencode: session processor | `packages/opencode/src/session/processor.ts` | 60 | 消息处理 |
| 325 | opencode: session summary | `packages/opencode/src/session/summary.ts` | 40 | 会话摘要 |
| 326 | opencode: session todo | `packages/opencode/src/session/todo.ts` | 50 | 待办事项 |
| 327 | opencode: session overflow | `packages/opencode/src/session/overflow.ts` | 30 | 上下文溢出 |
| 328 | opencode: session projectors | `packages/opencode/src/session/projectors.ts` | 40 | 投影器 |
| 329 | opencode: session projectors-next | `packages/opencode/src/session/projectors-next.ts` | 40 | 下一代投影 |
| 330 | opencode: session message-error | `packages/opencode/src/session/message-error.ts` | 20 | 消息错误 |
| 331 | opencode: session instruction | `packages/opencode/src/session/instruction.ts` | 30 | 指令完善 |
| 332 | opencode: session system | `packages/opencode/src/session/system.ts` | 30 | 系统提示完善 |
| 333 | opencode: session llm | `packages/opencode/src/session/llm.ts` | 40 | LLM 封装完善 |
| 334 | opencode: session status | `packages/opencode/src/session/status.ts` | 30 | 状态完善 |
| 335 | opencode: session run-state | `packages/opencode/src/session/run-state.ts` | 30 | 运行状态完善 |
| 336 | 验证: 压缩 | — | — | 长会话压缩 |
| 337 | 验证: 重试 | — | — | LLM 失败重试 |
| 338 | 验证: 回退 | — | — | 撤销消息 |
| 339 | 验证: 待办 | — | — | todowrite 工具 |
| 340 | 验证: 摘要 | — | — | 会话摘要生成 |
| 341 | 验证: 溢出处理 | — | — | 上下文超限 |
| 342 | 验证: 投影器 | — | — | 消息投影 |
| 343 | 验证: 指令系统 | — | — | 自定义指令 |
| 344 | 验证: 系统提示 | — | — | 动态系统提示 |
| 345 | 验证: 状态管理 | — | — | 完整状态机 |
| 346 | 验证: 错误处理 | — | — | 消息错误恢复 |
| 347 | 验证: 性能 | — | — | 长会话性能 |
| 348 | 验证: 内存 | — | — | 大上下文内存 |
| 349 | 验证: 边界 | — | — | 空会话 |
| 350 | 验证: 完整流程 | — | — | 压缩 → 摘要 → 继续 |

**验证**: 完整的会话生命周期管理

---

## Phase 13: 工具系统完善（迭代 361-400）

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 361 | opencode: webfetch 工具 | `packages/opencode/src/tool/webfetch.ts` | 40 | 网页抓取 |
| 362 | opencode: websearch 工具 | `packages/opencode/src/tool/websearch.ts` | 40 | 网络搜索 |
| 363 | opencode: question 工具 | `packages/opencode/src/tool/question.ts` | 30 | 用户提问 |
| 364 | opencode: question Service | `packages/opencode/src/question/index.ts` | 30 | 问题管理 |
| 365 | opencode: todo 工具 | `packages/opencode/src/tool/todo.ts` | 40 | 待办工具 |
| 366 | opencode: skill 工具 | `packages/opencode/src/tool/skill.ts` | 30 | Skill 加载 |
| 367 | opencode: skill Service | `packages/opencode/src/skill/index.ts` | 40 | Skill 管理 |
| 368 | opencode: skill discovery | `packages/opencode/src/skill/discovery.ts` | 30 | Skill 发现 |
| 369 | opencode: plan 工具 | `packages/opencode/src/tool/plan.ts` | 30 | 计划模式 |
| 370 | opencode: repo_clone 工具 | `packages/opencode/src/tool/repo_clone.ts` | 40 | 仓库克隆 |
| 371 | opencode: repo_overview 工具 | `packages/opencode/src/tool/repo_overview.ts` | 30 | 仓库概览 |
| 372 | opencode: task_status 工具 | `packages/opencode/src/tool/task_status.ts` | 30 | 任务状态 |
| 373 | opencode: invalid 工具 | `packages/opencode/src/tool/invalid.ts` | 20 | 无效工具 |
| 374 | opencode: mcp-websearch 工具 | `packages/opencode/src/tool/mcp-websearch.ts` | 30 | MCP 搜索 |
| 375 | opencode: external-directory 工具 | `packages/opencode/src/tool/external-directory.ts` | 20 | 外部目录 |
| 376 | opencode: truncation-dir | `packages/opencode/src/tool/truncation-dir.ts` | 20 | 截断目录 |
| 377 | opencode: tool schema | `packages/opencode/src/tool/schema.ts` | 20 | 工具 Schema |
| 378 | 验证: webfetch | — | — | 网页内容获取 |
| 379 | 验证: websearch | — | — | 网络搜索 |
| 380 | 验证: question | — | — | 用户交互 |
| 381 | 验证: todo | — | — | 待办管理 |
| 382 | 验证: skill | — | — | Skill 加载 |
| 383 | 验证: plan | — | — | 计划模式 |
| 384 | 验证: repo_clone | — | — | 仓库克隆 |
| 385 | 验证: task_status | — | — | 后台任务查询 |
| 386 | 验证: 工具描述 | — | — | 动态描述 |
| 387 | 验证: 工具过滤 | — | — | 按模型/agent |
| 388 | 验证: 工具错误 | — | — | 参数验证 |
| 389 | 验证: 工具性能 | — | — | 大量工具 |
| 390 | 验证: 工具安全 | — | — | 权限检查 |
| 391 | 验证: 工具截断 | — | — | 大输出处理 |
| 392 | 验证: 工具附件 | — | — | 文件附件 |
| 393 | 验证: 工具元数据 | — | — | metadata 传递 |
| 394 | 验证: 工具取消 | — | — | abort 信号 |
| 395 | 验证: 工具重试 | — | — | 失败重试 |
| 396 | 验证: 工具日志 | — | — | 执行追踪 |
| 397 | 验证: 工具并发 | — | — | 并行工具 |
| 398 | 验证: 工具超时 | — | — | 超时处理 |
| 399 | 验证: 工具边界 | — | — | 空参数 |
| 400 | 验证: 完整工具集 | — | — | 所有工具可用 |

**验证**: 完整的工具系统，20+ 工具可用

---

## Phase 14: 高级功能（迭代 401-450）

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 401 | opencode: MCP 基础 | `packages/opencode/src/mcp/index.ts` | 60 | MCP 协议 |
| 402 | opencode: MCP auth | `packages/opencode/src/mcp/auth.ts` | 30 | MCP 认证 |
| 403 | opencode: MCP 工具 | `packages/opencode/src/mcp/index.ts` | 40 | MCP 工具集成 |
| 404 | opencode: ACP 基础 | `packages/opencode/src/acp/agent.ts` | 200 | ACP 协议 |
| 405 | opencode: ACP session | `packages/opencode/src/acp/session.ts` | 80 | ACP 会话 |
| 406 | opencode: ACP runtime | `packages/opencode/src/acp/runtime.ts` | 30 | ACP 运行时 |
| 407 | opencode: ACP server | `packages/opencode/src/acp/server.ts` | 60 | ACP 服务器 |
| 408 | opencode: ACP CLI | `packages/opencode/src/cli/cmd/acp.ts` | 30 | acp 命令 |
| 409 | opencode: reference Service | `packages/opencode/src/reference/reference.ts` | 60 | 引用系统 |
| 410 | opencode: reference 解析 | `packages/opencode/src/reference/reference.ts` | 40 | @引用解析 |
| 411 | opencode: image 处理 | `packages/opencode/src/image/image.ts` | 40 | 图片处理 |
| 412 | opencode: pty 终端 | `packages/opencode/src/pty/pty.ts` | 60 | PTY 终端 |
| 413 | opencode: pty ticket | `packages/opencode/src/pty/ticket.ts` | 30 | PTY 票据 |
| 414 | opencode: pty bun | `packages/opencode/src/pty/pty.bun.ts` | 30 | Bun PTY |
| 415 | opencode: pty node | `packages/opencode/src/pty/pty.node.ts` | 30 | Node PTY |
| 416 | opencode: installation | `packages/opencode/src/installation/index.ts` | 30 | 安装管理 |
| 417 | opencode: upgrade CLI | `packages/opencode/src/cli/cmd/upgrade.ts` | 30 | 升级命令 |
| 418 | opencode: uninstall CLI | `packages/opencode/src/cli/cmd/uninstall.ts` | 20 | 卸载命令 |
| 419 | opencode: debug CLI | `packages/opencode/src/cli/cmd/debug.ts` | 30 | 调试命令 |
| 420 | opencode: stats CLI | `packages/opencode/src/cli/cmd/stats.ts` | 30 | 统计命令 |
| 421 | 验证: MCP 连接 | — | — | MCP 服务器 |
| 422 | 验证: MCP 工具 | — | — | MCP 工具调用 |
| 423 | 验证: ACP 初始化 | — | — | ACP 协议握手 |
| 424 | 验证: ACP session | — | — | ACP 会话管理 |
| 425 | 验证: ACP prompt | — | — | ACP 提示 |
| 426 | 验证: 引用解析 | — | — | @file 引用 |
| 427 | 验证: 图片处理 | — | — | 图片分析 |
| 428 | 验证: PTY 终端 | — | — | 交互式终端 |
| 429 | 验证: 安装管理 | — | — | 安装/升级/卸载 |
| 430 | 验证: 调试工具 | — | — | 调试信息 |
| 431 | 验证: 统计 | — | — | 使用统计 |
| 432 | 验证: MCP 安全 | — | — | 权限控制 |
| 433 | 验证: ACP 安全 | — | — | 认证 |
| 434 | 验证: 引用安全 | — | — | 路径转义 |
| 435 | 验证: PTY 安全 | — | — | 会话隔离 |
| 436 | 验证: 性能 | — | — | MCP/ACP 延迟 |
| 437 | 验证: 错误处理 | — | — | 连接断开 |
| 438 | 验证: 重连 | — | — | 自动重连 |
| 439 | 验证: 并发 | — | — | 多连接 |
| 440 | 验证: 边界 | — | — | 空配置 |
| 441 | 验证: 兼容性 | — | — | 协议版本 |
| 442 | 验证: 文档 | — | — | 使用说明 |
| 443 | 验证: 日志 | — | — | 调试日志 |
| 444 | 验证: 监控 | — | — | 健康检查 |
| 445 | 验证: 安全审计 | — | — | 安全审查 |
| 446 | 验证: 性能基准 | — | — | 基准测试 |
| 447 | 验证: 压力测试 | — | — | 高负载 |
| 448 | 验证: 兼容性测试 | — | — | 多平台 |
| 449 | 验证: 集成测试 | — | — | 端到端 |
| 450 | 验证: 完整功能 | — | — | 所有功能可用 |

**验证**: MCP/ACP/Reference/PTY 等高级功能

---

## Phase 15: 生产化（迭代 451-500）

| # | 迭代 | 文件 | 行数 | 核心概念 |
|---|---|---|---|---|
| 451 | opencode: sync Service | `packages/opencode/src/sync/index.ts` | 60 | 同步 |
| 452 | opencode: share Service | `packages/opencode/src/share/index.ts` | 40 | 分享 |
| 453 | opencode: share session | `packages/opencode/src/share/session.ts` | 30 | 会话分享 |
| 454 | opencode: share-next | `packages/opencode/src/share/share-next.ts` | 30 | 下一代分享 |
| 455 | opencode: control-plane | `packages/opencode/src/control-plane/workspace.ts` | 40 | 控制面 |
| 456 | opencode: account | `packages/opencode/src/account/account.ts` | 40 | 账户管理 |
| 457 | opencode: event-v2-bridge | `packages/opencode/src/event-v2-bridge.ts` | 40 | 事件桥接 |
| 458 | opencode: v2 迁移 | `packages/opencode/src/v2/index.ts` | 40 | V2 兼容 |
| 459 | opencode: id 系统 | `packages/opencode/src/id/id.ts` | 20 | ID 生成 |
| 460 | opencode: ide 集成 | `packages/opencode/src/ide/index.ts` | 30 | IDE 集成 |
| 461 | opencode: TUI 基础 | `packages/opencode/src/cli/ui.ts` | 40 | 终端 UI |
| 462 | opencode: TUI logo | `packages/opencode/src/cli/logo.ts` | 20 | Logo |
| 463 | opencode: TUI error | `packages/opencode/src/cli/error.ts` | 20 | 错误显示 |
| 464 | opencode: TUI heap | `packages/opencode/src/cli/heap.ts` | 20 | 堆追踪 |
| 465 | opencode: TUI network | `packages/opencode/src/cli/network.ts` | 20 | 网络状态 |
| 466 | opencode: TUI upgrade | `packages/opencode/src/cli/upgrade.ts` | 20 | 升级提示 |
| 467 | opencode: TUI effect | `packages/opencode/src/cli/effect/index.ts` | 20 | Effect 工具 |
| 468 | opencode: TUI effect-cmd | `packages/opencode/src/cli/effect-cmd.ts` | 20 | 命令工具 |
| 469 | opencode: TUI bootstrap | `packages/opencode/src/cli/bootstrap.ts` | 20 | TUI 引导 |
| 470 | opencode: 测试框架 | `packages/opencode/test/` | 100 | 测试基础 |
| 471 | opencode: 单元测试 | `packages/opencode/test/` | 200 | 核心测试 |
| 472 | opencode: 集成测试 | `packages/opencode/test/` | 200 | 集成测试 |
| 473 | opencode: E2E 测试 | `packages/opencode/test/` | 200 | 端到端测试 |
| 474 | opencode: 性能测试 | `packages/opencode/test/` | 100 | 性能基准 |
| 475 | opencode: 文档 | `docs/` | 200 | 使用文档 |
| 476 | opencode: API 文档 | `docs/` | 100 | API 参考 |
| 477 | opencode: 架构文档 | `docs/` | 100 | 架构说明 |
| 478 | opencode: 贡献指南 | `CONTRIBUTING.md` | 50 | 贡献说明 |
| 479 | opencode: CI 配置 | `.github/` | 50 | CI/CD |
| 480 | opencode: 发布脚本 | `script/` | 50 | 发布流程 |
| 481 | 验证: 同步 | — | — | 多设备同步 |
| 482 | 验证: 分享 | — | — | 会话分享 |
| 483 | 验证: 控制面 | — | — | 工作区管理 |
| 484 | 验证: 账户 | — | — | 用户账户 |
| 485 | 验证: TUI | — | — | 终端 UI |
| 486 | 验证: 测试覆盖 | — | — | 80%+ 覆盖 |
| 487 | 验证: 文档完整 | — | — | 所有功能文档 |
| 488 | 验证: CI 通过 | — | — | 自动测试 |
| 489 | 验证: 发布流程 | — | — | 版本发布 |
| 490 | 验证: 性能基准 | — | — | 性能达标 |
| 491 | 验证: 安全审计 | — | — | 安全通过 |
| 492 | 验证: 兼容性 | — | — | 多平台 |
| 493 | 验证: 稳定性 | — | — | 长时间运行 |
| 494 | 验证: 回滚 | — | — | 版本回滚 |
| 495 | 验证: 监控 | — | — | 运行监控 |
| 496 | 验证: 告警 | — | — | 异常告警 |
| 497 | 验证: 备份 | — | — | 数据备份 |
| 498 | 验证: 恢复 | — | — | 灾难恢复 |
| 499 | 验证: 安全 | — | — | 安全加固 |
| 500 | 🎉 完整版 | — | — | 功能完整 |

**验证**: 生产级可用，完整功能

---

## 总结

| Phase | 迭代范围 | 迭代数 | 核心主题 | 关键文件 |
|---|---|---|---|---|
| 0 | 1-10 | 10 | 脚手架 | package.json, tsconfig |
| 1 | 11-30 | 20 | 最小 LLM 调用 | llm.ts, run.ts |
| 2 | 31-50 | 20 | 配置与权限 | config, permission, agent |
| 3 | 51-70 | 20 | 工具系统 | tool, registry |
| 4 | 71-110 | 40 | Session 系统 | session, bus |
| 5 | 111-140 | 30 | Prompt 引擎 | prompt.ts (核心) |
| 6 | 141-170 | 30 | SubAgent 系统 | task tool, background |
| 7 | 171-200 | 30 | 权限与安全 | permission 完善 |
| 8 | 201-230 | 30 | 配置系统完善 | config 子模块 |
| 9 | 231-260 | 30 | Provider 系统 | provider, auth, 多协议 |
| 10 | 261-290 | 30 | 存储系统 | storage, migration |
| 11 | 291-320 | 30 | 文件系统与 Git | file, git, lsp |
| 12 | 321-360 | 40 | 高级会话 | compaction, retry, todo |
| 13 | 361-400 | 40 | 工具系统完善 | 20+ 工具 |
| 14 | 401-450 | 50 | 高级功能 | MCP, ACP, PTY |
| 15 | 451-500 | 50 | 生产化 | sync, share, TUI, 测试 |
| **总计** | **1-500** | **500** | — | — |

### 关键里程碑

- **迭代 30**: 第一个可运行的 LLM 调用
- **迭代 70**: 交互模式 + 工具调用
- **迭代 110**: 完整的 Session 系统
- **迭代 140**: Prompt 引擎（核心）
- **迭代 170**: SubAgent 系统
- **迭代 200**: 权限系统
- **迭代 260**: 多 Provider 支持
- **迭代 320**: 文件系统 + Git + LSP
- **迭代 400**: 完整工具集
- **迭代 450**: MCP/ACP/PTY
- **迭代 500**: 生产级完整版
