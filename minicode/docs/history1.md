# minicode 开发历史记录

> 本文件记录了 minicode 项目的迭代开发过程，从 Step 2 到 Step 4 的完整实现。

---

## Step 2 — Planner Agent + Builder SubAgent

**目标**：解决 `generateText` + `maxSteps` 无法处理多文件生成的问题。Planner 一次 LLM 调用生成结构化 Plan，Builder 直接写文件。

### 新增文件

| 文件 | 行数 | 职责 |
|---|---|---|
| `packages/opencode/src/pipeline/planner.ts` | 76 | Planner Agent — 调用 LLM 生成结构化 Plan JSON |
| `packages/opencode/src/pipeline/builder.ts` | 113 | Builder SubAgent — 按依赖顺序并行写入文件 |
| `packages/opencode/src/cli/cmd/plan.ts` | 73 | `plan` CLI 命令 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `packages/opencode/src/index.ts` | 注册 `plan` 命令到 yargs |

### 关键设计

- **Planner**：接收 prompt → 调用 LLM → 解析 JSON（处理 ```json 包裹）→ PlanSchema 验证
- **Builder**：拓扑排序（按 deps）→ 同批次并行写入 → 自动创建父目录
- **CLI**：`minicode plan -p "..."` 生成计划，`--build` 同时写入文件

### 踩坑记录

- Effect v4 beta.65 使用 `catchEager` 而非 `catchAll`，`Schema.decodeUnknownEffect` 而非 `Schema.decodeUnknown`
- `Effect.runFork` 要求 `never` 的 requirements，需要 `as any` 绕过

---

## Step 3 — Agent Message Bus 层

**目标**：在现有 PubSub Bus 之上构建 typed agent-to-agent 通信层，实现 CLI 和 agents 的解耦。

### 新增文件

| 文件 | 行数 | 职责 |
|---|---|---|
| `packages/opencode/src/agent-bus/message.ts` | 106 | 消息协议定义（AgentID、CorrelationID、6 种消息 Schema） |
| `packages/opencode/src/agent-bus/bus.ts` | 155 | 类型化发送/订阅函数 + request/response 辅助 |
| `packages/opencode/src/agent-bus/agent.ts` | 121 | Agent 注册表 Service（Planner/Builder 的订阅处理） |
| `packages/opencode/src/agent-bus/index.ts` | 3 | 模块导出 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `packages/opencode/src/project/bootstrap.ts` | 注册 ACPAgent layer |
| `packages/opencode/src/cli/cmd/plan.ts` | 重构为通过 agent-bus 通信 |

### 关键设计

- **消息信封**：`{ id, correlationID, source, target, type, content, timestamp }`
- **request/response**：`request<T>()` 发送请求 → 按 correlationID 匹配响应 → 超时处理（30s）
- **Agent 生命周期**：`start()`/`stop()` 管理订阅

### 命名变更

`acp/` → `agent-bus/`（避免与完整版 opencode 的 ACP 协议混淆）

---

## Step 4 — Reviewer Agent + Review Loop

**目标**：实现 Plan → Build → Review → Re-plan 的反馈循环，支持最多 3 次迭代。

### 新增文件

| 文件 | 行数 | 职责 |
|---|---|---|
| `packages/opencode/src/pipeline/reviewer.ts` | 135 | Reviewer — 结构检查 + LLM 语义检查 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `packages/opencode/src/agent-bus/agent.ts` | 注册 Reviewer agent handler |
| `packages/opencode/src/cli/cmd/plan.ts` | 添加 review loop 逻辑 |
| `packages/opencode/src/index.ts` | 注册 `--review` / `-r` 标志 |

### 关键设计

- **双层检查**：先做结构检查（文件是否全部写入、非空），再调用 LLM 做语义检查
- **反馈循环**：Review 失败 → 将 feedback 拼入 prompt 重新 Plan → 最多 3 次迭代
- **CLI 用法**：`minicode plan -p "..." --build --review`

---

## 当前架构总览

```
CLI (yargs)
  run  |  serve  |  plan [-p] [--build] [--review]
                    |
                    ▼
            Agent Message Bus
  (typed pub/sub via Effect + correlationID)
    ┌──────────┬───────────┬───────────┐
    │ Planner  │  Builder  │  Reviewer │
    │ Agent    │  Agent    │  Agent    │
    └────┬─────┴─────┬─────┴─────┬─────┘
         │           │           │
         ▼           ▼           ▼
    LLM.generate  Bun.write  LLM.generate
    (Plan JSON)   (files)    (validation)
```

## 与完整版 opencode 的差距

### ACP 层

minicode 的 `agent-bus` 是进程内 typed 消息总线，完整版 opencode 的 ACP 是 [Agent Client Protocol](https://agentclientprotocol.com/) 标准协议（JSON-RPC over stdio，用于 IDE 集成）。两者只是名字撞了，定位完全不同。

### SubAgent 系统

完整版是一个通用调度引擎（`task` tool），minicode 是硬编码的三步管道。差距包括：

- 无通用 `task` tool 调度器
- 无 Session 隔离（每个 subagent 创建独立 SQLite session）
- 无权限继承
- 无后台执行模式
- 无任务恢复（task_id）
- 无并行 agent 执行


Step 5 完成。所有 5 个步骤已全部实现，typecheck 通过。最终架构：
minicode <command>
Commands:
  run      单次 prompt 或交互式 REPL
  serve    HTTP 服务器
  plan     Plan → [Build] → [Review] 管道（-p, --build, --review）
  build    从 JSON 文件执行 build（--plan / --plan-file）
  review   从 JSON 文件执行 review（--plan / --plan-file + --build-result / --build-result-file）
Step 5 新增：
| 文件 | 行数 | 职责 |
|---|---|---|
| pipeline/pipeline.ts | ~210 | Pipeline 状态机（idle→planning→planned→building→built→reviewing→done/failed） |
| cli/cmd/build.ts | 89 | 独立 build 命令，从 JSON 文件或字符串读取 Plan 并执行 |
| cli/cmd/review.ts | 106 | 独立 review 命令，从 JSON 文件读取 Plan + BuildResult 并验证 |
重构： cli/cmd/plan.ts 从硬编码循环改为使用 Pipeline.run() 状态机，输出改为 Pipeline.formatReport()。
5 个步骤的最终状态：
- Step 1 ✅ — Plan Schema + build_files tool
- Step 2 ✅ — Planner Agent + Builder SubAgent
- Step 3 ✅ — Agent Message Bus（agent-bus/）
- Step 4 ✅ — Reviewer Agent + Review Loop
- Step 5 ✅ — 完整的 CLI 管道命令 + 状态机