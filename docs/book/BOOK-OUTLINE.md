# 《opencode 内部工作机制》— 全书大纲

## 写作目标

面向对 AI 编程助手框架感兴趣的工程师，用自然语言阐述 opencode 的核心架构与设计决策。以"它解决了什么问题 → 它是怎么做到的 → 为什么这样做"为主线，由浅入深，减少代码片段，增强可读性。

## 全书结构

全书分为四部分、十二个章节，另附术语表。

---

## 第一部分：概览与架构基础

### 第 1 章 · opencode 是什么

- 项目定位：AI 编程助手框架，而非单一工具
- 核心能力全景：对话式编程、工具调用执行、多 Agent 协作、多模型接入
- 技术栈概览：TypeScript + Bun 运行时 + Effect-TS 效应系统 + SolidJS 前端
- 与同类工具的架构差异（为什么选择事件驱动而非请求-响应式）

### 第 2 章 · 代码地图

- monorepo 包结构导览：opencode（核心）、llm（模型层）、core（共享基础）、app（Web 端）、sdk（客户端库）等
- 关键文件路径索引：从入口到各子系统的快速定位
- 数据流向总览：用户输入 → Session → Prompt → LLM → 工具执行 → 文件变更 → 响应展示

---

## 第二部分：核心循环（重点）

### 第 3 章 · Agent 运行循环：从输入到响应

- 会话生命周期：创建、Fork（分支）、继续、归档
- 消息准备：用户输入如何被拆解为 Part（文本、文件、图片、Agent 引用）
- System Prompt 动态组装：AGENTS.md / CLAUDE.md 的层级发现与注入机制
- 模型选择与 Provider 路由：从配置到实际 API 端点的解析链
- 流式 API 通信：请求发送 → SSE 流解析 → 增量事件分发
- Step 机制：一次 LLM 调用 = 一个 Step（start → text/tool/reasoning → finish）
- 工具并发调度：模型返回 tool_call → 并行执行 → 结果注入下一轮对话
- 异常兜底：Provider 错误重试策略、工具执行失败降级、Session 级别错误处理

### 第 4 章 · 工具系统设计

- 工具的两种定义模式：Typed（编译时类型安全）与 Dynamic（运行时动态加载）
- 工具生命周期状态机：pending → running → completed / error
- 工具审批（Permission）机制：权限键、模式匹配、用户交互
- 关键工具详解：Bash、Read、Write、Edit、Glob、Grep、Task、Question 等
- 工具输出截断（Truncation）策略：防止上下文膨胀
- 工具注册表与 UI 渲染规则：每种工具如何映射到终端展示

---

## 第三部分：上下文与记忆

### 第 5 章 · 多层 Context 管理

- Context 的构成：System Prompt + 指令文件 + 对话历史 + 工具执行结果
- 上下文窗口感知：Token 估算方法、用量可视化（SessionContextBreakdown）
- Compaction（压缩）机制：触发条件、摘要生成流程、压缩后的上下文结构
- 上下文溢出检测与自动压缩的协同
- Anthropic Prompt Caching 的集成策略：何时标记缓存断点
- 长对话场景下的体验保障：压缩策略 + 缓存策略如何协同维持质量

### 第 6 章 · Memory 体系

- 指令文件系统：AGENTS.md / CLAUDE.md 的层级发现（从文件目录向上走到项目根）
- 跨会话持久化：Global Config、Workspace 级别配置的存储与读取
- 会话内记忆：从对话历史中自动提取已读文件路径，避免重复注入
- 指令的远程加载：URL 指令源的获取与缓存
- Memory 的清理与生命周期管理

---

## 第四部分：工程质量与进阶架构

### 第 7 章 · Agent 埋点与可观测性

- 日志系统架构：四级日志（DEBUG/INFO/WARN/ERROR）、Tag 机制、文件轮转与保留策略
- OpenTelemetry 集成：Span 的创建时机、属性记录规范、错误上报路径
- 事件总线（Event Bus）：SessionEvent 类型体系与发布-订阅模式
- Trace 系统：JSONL 事件追踪的设计用途与启用方式
- 与评测团队对齐的日志规范：哪些事件必须记录、字段命名约定

### 第 8 章 · C 端体验优化

- 首 Token 延迟（TTFT）优化：流式传输的边收边渲染策略
- 流式输出流畅度：Text Delta 合并策略、Reasoning 内容的增量展示
- 工具失败的降级策略：错误分类（可重试/不可重试）、重试逻辑、用户提示设计
- 静默失败的检测与兜底：超时检测机制、Provider 错误信号捕获、Heap 快照的自动触发
- UI 渲染优化：工具内联展示、Footer 状态栏信息层次、Diff 变更展示

### 第 9 章 · 多 Agent 协作架构

- Agent 定义体系：Mode（primary / subagent / all）的含义与适用场景
- Task 工具：子 Agent 的生成、参数传递与调度流程
- Subagent 的权限继承与隔离边界
- Session Fork：从任意消息点分支对话的实现与用途
- 并发子任务：多个 Subagent 的并行执行与结果汇总策略
- 多 Agent 场景下的上下文隔离与消息路由

### 第 10 章 · Provider 抽象层

- 多模型支持架构：Anthropic、OpenAI、AWS Bedrock、Google Vertex、GitHub Copilot 等
- Provider 定义与 Model 工厂模式：如何用统一接口描述不同模型
- 消息转换管道（Transform）：归一化处理、缓存标记注入、Provider Options 键名重映射
- 协议适配器：OpenAI Compatible Chat、Bedrock Converse、Anthropic Messages 的统一抽象
- 流式协议的通用抽象：Lifecycle 状态机、ToolStream 解析器

### 第 11 章 · 插件与扩展系统

- TUI 插件 API 设计：终端界面如何暴露可编程接口
- MCP 协议集成：Model Context Protocol 的客户端实现
- LSP 集成架构：语言服务器的自动发现、安装与通信
- 自定义指令与 Skill 系统：用户如何扩展 Agent 行为

### 第 12 章 · 设计决策与权衡回顾

- 全书关键设计决策的汇总表
- 架构取舍：为什么选择 Effect-TS 作为效应系统、为什么用 Event 驱动而非请求-响应、为什么 Step 是核心抽象而非 Turn
- 未来演进方向与开放问题

---

## 附录

- **术语表**：Session、Message、Part、Step、Tool、Compaction、Agent、Provider 等核心概念的定义索引
- **文件索引**：关键源码文件的路径与功能说明

---

## 六个重点需求的覆盖映射

| 需求编号 | 需求描述 | 对应章节 | 覆盖说明 |
|----------|---------|---------|---------|
| 4.1 | Agent 核心运行循环：消息准备、System Prompt 动态组装、流式 API 通信、工具并发调度、结果收集与异常兜底 | 第 3、4 章 | 第 3 章覆盖完整循环流程，第 4 章深入工具系统细节 |
| 4.2 | 多层 Context 管理机制，C 端长对话场景体验保障 | 第 5 章 | 覆盖上下文构成、压缩机制、缓存策略、长对话保障 |
| 4.3 | Memory 体系：跨会话持久化记忆、自动提取与离线巩固 | 第 6 章 | 覆盖指令发现、持久化存储、自动提取、远程加载 |
| 4.4 | Agent 埋点规范，与评测团队对齐，确保日志满足评测和可观测需求 | 第 7 章 | 覆盖日志系统、OTel 集成、事件总线、Trace、规范约定 |
| 4.5 | C 端体验关键指标：首 Token 延迟、流式流畅度、工具失败降级、静默失败检测与兜底 | 第 8 章 | 覆盖 TTFT、流式合并、错误分类重试、超时与 Heap 检测 |
| 4.6 | 多 Agent 协作架构设计，并发子任务等复杂场景 | 第 9 章 | 覆盖 Agent 定义、Task/Subagent、Fork、并发执行、上下文隔离 |

## 写作原则

1. **自然语言优先**：用概念描述代替代码片段，仅在关键架构点使用简化的伪代码或 ASCII 图
2. **由浅入深**：每章从"它解决了什么问题"开始，再到"它是怎么做到的"，最后到"为什么这样做"
3. **图表辅助**：关键流程配 ASCII 流程图，架构关系配层次图
4. **术语一致**：全书使用统一的术语体系，首次出现时给出定义
5. **章节独立**：每章可相对独立阅读，但通过交叉引用建立关联
