# 第 7 章 · Agent 埋点与可观测性

可观测性是 AI 编程助手从"能工作"到"可信任"的关键跨越。opencode 通过日志系统、OpenTelemetry 集成、事件总线和 Trace 系统，构建了多层可观测性基础设施。本章阐述这些机制的设计，以及它们如何与评测团队的需求对齐。

## 7.1 日志系统架构

opencode 的日志系统是一个轻量级但功能完备的自研实现，设计目标是零外部依赖、低开销、结构化输出。

### 四级日志

日志按严重程度分为四个级别：

- **DEBUG**：详细的调试信息，包括消息内容、工具参数、中间状态。仅在开发环境或显式开启时输出
- **INFO**：正常的运行信息，包括会话创建、Step 开始/结束、工具执行完成、压缩触发等关键事件
- **WARN**：需要关注但不影响运行的异常，包括工具执行失败后的重试、上下文接近限制、Heap 使用超过阈值
- **ERROR**：影响运行的错误，包括 API 调用失败、会话数据损坏、不可恢复的异常

默认日志级别为 INFO，可通过环境变量或配置调整为 DEBUG。

### Tag 机制

每条日志携带一组键值对 Tag，用于分类和过滤。Tag 在 Logger 创建时设定，后续可追加：

- `service`：产生日志的模块名称（如 `"session"`、`"tool"`、`"provider"`）
- `sessionID`：关联的会话 ID
- `modelID`：使用的模型 ID
- `providerID`：使用的提供商 ID

Tag 机制使得日志可以按模块、会话、模型等维度过滤，便于定位问题。

### 文件轮转

日志写入 `~/.local/share/opencode/log/` 目录（或平台等效路径）。文件命名格式为 `YYYY-MM-DDTHHMMSS.log`（ISO 时间戳去掉冒号）。系统自动保留最近 10 个日志文件，超出数量的旧文件被删除。

### 时间追踪

Logger 提供 `time()` 方法，用于追踪操作耗时：

```
logger.time("llm.call")  // 开始计时
// ... 操作 ...
// 自动记录: "llm.call completed · 1.2s"
```

这比手动记录开始和结束时间更简洁，且输出格式统一。

## 7.2 OpenTelemetry 集成

opencode 集成了 OpenTelemetry（OTel），为关键操作创建标准化的 Span。

### Span 的创建时机

以下关键操作会创建 OTel Span：

- **RunInteractive**：整个交互式运行过程的顶层 Span
- **LLM Call**：每次 LLM API 调用
- **Tool Execution**：每个工具的执行
- **Session Create / Load**：会话的创建和加载
- **Compaction**：上下文压缩操作

### 属性记录规范

每个 Span 携带标准化的属性：

- `opencode.directory`：工作目录
- `opencode.session_id`：会话 ID
- `opencode.model_id`：模型 ID
- `opencode.provider_id`：提供商 ID
- `opencode.tool_name`：工具名称（工具 Span）
- `opencode.step_number`：Step 序号（LLM Span）

### 错误上报

当 Span 内的操作失败时，错误信息被记录到 Span 上：
- 错误类型和消息
- 是否可重试
- 关联的 Session ID（便于按会话聚合错误）

## 7.3 事件总线（Event Bus）

opencode 内部使用事件总线模式来解耦组件。SessionEvent 是事件的类型体系，定义了 40+ 种事件类型。

### 事件类型体系

SessionEvent 覆盖了会话生命周期的所有关键节点：

**会话级别事件**：
- `session.created` / `session.loaded` / `session.archived` / `session.deleted`

**消息级别事件**：
- `message.updated`：消息创建或更新
- `message.part.updated`：消息中的 Part 更新（最频繁的事件）

**Step 级别事件**：
- `step.started` / `step.finished` / `step.failed`

**工具级别事件**：
- `tool.started` / `tool.completed` / `tool.failed`

**压缩事件**：
- `compaction.started` / `compaction.completed`

**权限事件**：
- `permission.asked` / `permission.replied`

**错误事件**：
- `session.error`：会话级别错误

### 发布-订阅模式

事件通过 Event Bus 发布，多个消费者可以独立订阅：

- **UI 消费者**：TUI 和 Web 应用订阅事件来更新界面
- **日志消费者**：日志系统订阅事件来记录关键操作
- **Trace 消费者**：Trace 系统订阅事件来生成 JSONL 追踪
- **Sync 消费者**：同步系统订阅事件来持久化状态

这种设计使得添加新的消费者（如评测数据收集器）不需要修改事件生产者。

## 7.4 Trace 系统

Trace 系统是一个开发专用的 JSONL 事件追踪工具，用于调试流式事件顺序、权限行为和 UI 渲染问题。

### 设计用途

Trace 不同于日志系统——它记录的是**完整的事件流**，而非关键操作的摘要。用途包括：
- 调试流式事件顺序（text-delta 和 tool-call 的到达顺序是否正确）
- 调试权限行为（权限请求是否在正确的时机发出）
- 调试 UI 渲染问题（Footer 和 Transcript 是否同步）
- 复现和诊断用户报告的 Bug

### 启用方式

通过环境变量 `OPENCODE_DIRECT_TRACE=1` 启用。启用后，每次 `opencode run` 会在 `~/.local/share/opencode/log/direct/` 下生成一个 JSONL 文件，每行一个 JSON 事件。

同时生成 `latest.json` 指针文件，方便快速找到最近的 Trace。

### 事件内容

Trace 记录的事件包括：
- `trace.start`：进程启动信息（命令行参数、工作目录、PID）
- `prompt`：发送给 LLM 的完整 Prompt
- `event`：从 SDK 接收的每个事件
- `reducer`：事件处理后的状态变化
- `footer`：UI Footer 的每次提交
- `turn.start` / `turn.end`：每个用户请求处理的起止

## 7.5 与评测团队对齐的日志规范

为确保框架输出的日志满足评测和可观测需求，opencode 遵循以下规范：

### 必须记录的事件

以下事件必须在日志中记录（INFO 级别或以上）：

| 事件 | 记录内容 | 用途 |
|------|---------|------|
| 会话创建 | sessionID、directory、agent、model | 追踪会话来源和配置 |
| Step 开始 | step 序号、modelID、providerID | 追踪 LLM 调用次数和模型使用 |
| Step 结束 | finishReason、usage（input/output/reasoning/cache tokens） | 评测 Token 消耗和停止原因 |
| 工具执行 | toolName、duration、status（completed/error） | 评测工具使用模式和失败率 |
| 压缩触发 | reason（auto/manual）、压缩前后消息数 | 评测上下文管理效果 |
| API 错误 | providerID、errorMessage、retryable | 评测模型可用性 |

### 字段命名约定

- 使用 `camelCase` 命名
- 时间字段使用 ISO 8601 格式
- Token 数量使用数字类型（非字符串）
- 错误信息包含 `name`、`message`、`data` 三个字段

### 结构化输出

日志的 extra 字段使用 JSON 对象格式，便于日志收集系统（如 Datadog、CloudWatch）解析和索引。

---

## 本章小结

opencode 的可观测性体系通过日志系统（分级 + Tag + 轮转）、OpenTelemetry（标准化 Span）、事件总线（发布-订阅解耦）和 Trace 系统（完整事件流），为框架的运行提供了多层可见性。与评测团队对齐的日志规范确保了关键行为可追踪、可量化、可对比。这套体系使得 opencode 不仅是"能运行"的 AI 助手，更是"可观测、可评测、可调试"的工程产品。
