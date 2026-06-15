# opencode 按模块学习路线指南

## 概述

本指南面向接手 opencode 项目的开发人员，按**六周、24 个模块**的顺序组织学习路径。每周聚焦一个架构层次，从基础层逐层深入到入口层。

学习原则：
- **先读文档再读代码**：每个模块先读对应的开发者文档或书籍章节，建立概念框架，再深入源码
- **代码已全面注释**：`docs/code-annotated/src/` 下所有 `.ts/.tsx` 文件均有中文头部注释，阅读源码时先看文件头注释理解整体作用
- **由浅入深**：每层理解"它解决了什么问题 → 它是怎么做到的 → 为什么这样做"

---

## 第一周：基础层 —— 理解"用什么"

目标：建立对项目技术底座的理解，包括共享类型、工具函数、配置系统和 Effect-TS 桥接层。

### Day 1-2：共享基础库（`packages/core`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `docs/development/module-04-core-shared.md` | 理解事件体系、消息 Schema、日志系统 |
| 2 | 阅读 `session-event.ts` 注释 | 理解 40+ 种事件类型的分类和用途 |
| 3 | 阅读 `session-message.ts` 注释 | 理解 User/Assistant/Shell/Compaction 消息结构 |
| 4 | 阅读 `util/log.ts` 注释 | 理解日志系统的四级日志、Tag 机制、文件轮转 |

**关键概念**：SessionEvent、Message、Part、Log Level

### Day 3：通用工具层（`src/util/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 浏览 `docs/code-annotated/src/util/` 下文件头注释 | 快速了解 23 个工具模块的用途 |
| 2 | 精读 `local-context.ts` | 理解 Effect Context 的创建和使用模式 |
| 3 | 精读 `filesystem.ts` | 理解文件系统抽象层 |
| 4 | 浏览其余文件 | 按需了解：locale、process、token、timeout 等 |

**关键概念**：LocalContext、Effect Layer、文件系统抽象

### Day 4-5：配置系统（`src/config/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `docs/development/module-08-config-system.md` | 理解配置层级、`.opencode` 目录结构 |
| 2 | 阅读 `config.ts` 注释和 Schema 定义 | 理解所有可配置项及其类型 |
| 3 | 浏览 `config/` 子模块 | parse、paths、plugin、provider、mcp 等 |

**关键概念**：配置加载链、Schema 验证、JSONC、多层合并

---

## 第二周：模型层 —— 理解"怎么调用 AI"

目标：理解 opencode 如何接入多个 LLM 提供商，以及工具抽象和流式协议解析。

### Day 1-2：Provider 系统（`src/provider/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `docs/development/module-03-llm-layer.md` | 理解 Provider/Model 定义体系 |
| 2 | 阅读 `provider.ts` 注释 | 理解 Provider 注册、Model 工厂、SDK 加载 |
| 3 | 阅读 `transform.ts` 注释 | 理解消息转换管道：归一化、缓存注入、键名重映射 |

**关键概念**：Provider、Model、BundledSDK、消息归一化、Anthropic Cache

### Day 3-4：LLM 抽象层（`packages/llm`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `packages/llm/src/tool.ts` | 理解 Typed/Dynamic 两种工具定义模式 |
| 2 | 阅读 `packages/llm/src/tool-runtime.ts` | 理解工具调度：解码→执行→编码 |
| 3 | 阅读 `packages/llm/src/protocols/anthropic-messages.ts` | 理解 Anthropic 流式协议解析 |
| 4 | 浏览 `packages/llm/src/providers/` | 了解各提供商的模型定义 |

**关键概念**：Tool、ToolRuntime、LLMEvent、Lifecycle 状态机

### Day 5：LLM 调用封装（`src/session/llm.ts`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `session/llm.ts` 注释 | 理解流式调用的封装逻辑 |

---

## 第三周：会话层 —— 理解"对话怎么流转"

目标：理解 opencode 最核心的会话系统——从用户输入到 AI 响应的完整流程。

### Day 1：消息类型（`src/session/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `docs/development/module-02-opencode-core.md` 中会话系统章节 | 建立整体认知 |
| 2 | 阅读 `session/schema.ts` + `session/message-v2.ts` 注释 | 理解所有 Part 类型和 Message 结构 |

**关键概念**：Part 类型体系、ToolState 状态机、Message 结构

### Day 2-3：核心运行循环（`src/session/prompt.ts`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `docs/book/chapter-03-agent-loop.md` | 理解 Agent 运行循环的完整流程 |
| 2 | 阅读 `prompt.ts` 头部注释 | 理解该文件的 10 大功能点 |
| 3 | 精读 `runLoop` 函数 | 理解多 Step 迭代：工具调用→结果注入→下一轮 |
| 4 | 精读 `createUserMessage` | 理解 Part 解析（文件/Agent/MCP 资源/目录） |
| 5 | 精读 `resolveTools` | 理解工具注册：内置工具 + MCP 工具 → AI SDK 格式 |
| 6 | 精读 `handleSubtask` | 理解子 Agent 调度的完整生命周期 |

**这是全书最重要的单个文件，建议花 2 天精读。**

**关键概念**：runLoop、Step、resolveTools、handleSubtask、Compaction 触发

### Day 4：事件处理（`src/session/processor.ts`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `processor.ts` 注释 | 理解 LLMEvent → Message Part 的转换流程 |
| 2 | 理解文本增量合并、工具状态管理、Step 生命周期 |

### Day 5：指令与压缩

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `docs/book/chapter-06-memory-system.md` | 理解指令文件系统的层级发现机制 |
| 2 | 阅读 `session/instruction.ts` 注释 | 理解 AGENTS.md/CLAUDE.md 的加载与注入 |
| 3 | 阅读 `docs/book/chapter-05-context-management.md` | 理解 Compaction 机制 |
| 4 | 阅读 `session/compaction.ts` 注释 | 理解压缩触发、摘要生成、消息替换 |

---

## 第四周：工具与 Agent 层 —— 理解"AI 怎么做事"

目标：理解工具系统和 Agent 系统——AI 如何执行操作、如何被组织和调度。

### Day 1-2：工具系统基础（`src/tool/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `docs/book/chapter-04-tool-system.md` | 理解工具定义模式、生命周期、权限、截断 |
| 2 | 阅读 `tool/tool.ts` 注释 | 理解 Context、ExecuteResult、Def 类型 |
| 3 | 阅读 `tool/registry.ts` 注释 | 理解工具注册表 |
| 4 | 阅读 `tool/truncate.ts` 注释 | 理解输出截断策略 |

### Day 3：核心工具实现

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `tool/read.ts` + `tool/write.ts` + `tool/edit.ts` | 文件操作三件套 |
| 2 | 阅读 `tool/bash.ts`（或 `tool/shell.ts`） | 命令执行 |
| 3 | 阅读 `tool/glob.ts` + `tool/grep.ts` | 代码搜索 |
| 4 | 阅读 `tool/task.ts` | 子 Agent 派发（多 Agent 协作的关键） |
| 5 | 阅读 `tool/question.ts` + `tool/todo.ts` | 交互与任务管理 |

### Day 4：Agent 系统（`src/agent/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `docs/book/chapter-09-multi-agent.md` | 理解 Agent Mode、Task 调度、Fork、并发 |
| 2 | 阅读 `agent/agent.ts` 注释 | 理解 Agent 定义、内置 Agent、LLM 生成 |
| 3 | 阅读 `agent/subagent-permissions.ts` | 理解双层权限控制 |

### Day 5：权限系统（`src/permission/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `permission/` 下文件注释 | 理解权限键分组、规则评估、用户交互 |

---

## 第五周：扩展层 —— 理解"怎么集成外部系统"

目标：理解 opencode 如何与 LSP、MCP、插件、ACP 等外部系统集成。

### Day 1-2：LSP 集成（`src/lsp/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `lsp/server.ts` 注释 | 理解 20+ 种语言服务器的自动发现和安装 |
| 2 | 阅读 `lsp/lsp.ts` 注释 | 理解 LSP 工具封装（跳转、引用、诊断等） |
| 3 | 浏览 `lsp/` 其余文件 | client、diagnostic、language、launch |

### Day 3：MCP 集成（`src/mcp/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `mcp/index.ts` 注释 | 理解 MCP 客户端：工具和资源的动态加载 |
| 2 | 阅读 `mcp/auth.ts` + `oauth-*.ts` | 理解 MCP OAuth 认证流程 |

### Day 4：插件与 ACP（`src/plugin/`、`src/acp/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `docs/book/chapter-11-plugins.md` | 理解插件、MCP、LSP、Skill 四大扩展机制 |
| 2 | 阅读 `plugin/` 下文件注释 | 理解插件加载、验证、生命周期 |
| 3 | 阅读 `acp/agent.ts` 注释 | 理解 ACP 协议：Prompt 处理、Session 管理 |

### Day 5：Skill 与 Command（`src/skill/`、`src/command/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `skill/` 下文件注释 | 理解 Skill 的发现、加载和注入 |
| 2 | 阅读 `command/index.ts` 注释 | 理解斜杠命令的注册、模板解析和执行 |

---

## 第六周：入口与服务层 —— 理解"怎么跑起来"

目标：理解 opencode 的 CLI 入口、HTTP 服务端、事件同步和持久化机制。

### Day 1-2：CLI 入口（`src/cli/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `cli/cmd/run.ts` 注释 | 理解 `opencode run` 命令：三种运行模式、会话创建 |
| 2 | 阅读 `cli/cmd/run/runtime.ts` 注释 | 理解运行时生命周期管理 |
| 3 | 阅读 `cli/cmd/run/tool.ts` 注释 | 理解 TOOL_RULES 工具 UI 渲染注册表 |
| 4 | 阅读 `cli/effect-cmd.ts` 注释 | 理解 Effect-TS 命令定义模式 |

### Day 3：HTTP 服务端（`src/server/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `server/server.ts` 注释 | 理解服务端入口和路由注册 |
| 2 | 浏览 `server/routes/instance/httpapi/groups/` | 了解 API 分组：session、config、file、mcp 等 |
| 3 | 浏览 `server/routes/instance/httpapi/middleware/` | 了解中间件：auth、cors、error、fence 等 |

### Day 4：事件同步与总线（`src/sync/`、`src/bus/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `sync/index.ts` 注释 | 理解事件定义和投影器注册 |
| 2 | 阅读 `bus/index.ts` + `bus/bus-event.ts` 注释 | 理解发布-订阅模式 |

### Day 5：持久化与项目（`src/storage/`、`src/project/`）

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 阅读 `storage/` 下文件注释 | 理解 SQLite 存储抽象 |
| 2 | 阅读 `project/` 下文件注释 | 理解项目实例的创建、加载和上下文管理 |

---

## 学习辅助资源

| 资源 | 路径 | 用途 |
|------|------|------|
| 机制书 | `docs/book/` | 12 章架构深度解析（自然语言） |
| 开发者文档 | `docs/development/` | 10 模块开发指南 + 附录 |
| 注释源码 | `docs/code-annotated/src/` | 504 个带中文注释的源文件 |
| 术语表 | `docs/book/GLOSSARY.md` | 核心概念定义索引 |
| 文件索引 | `docs/development/APPENDIX.md` | 关键文件路径速查 |

## 学习建议

1. **先文档后代码**：每学一个模块，先读对应的文档章节建立概念框架，再读注释源码理解实现细节
2. **不求一次理解全部**：prompt.ts（2150 行）是整个框架最复杂的文件，建议分 2-3 次阅读
3. **对照注释源码**：文档中的代码引用可以在 `docs/code-annotated/src/` 中找到完整带注释的版本
4. **动手验证**：学完一个模块后，尝试修改一个小功能并运行 `bun typecheck` + `bun test` 验证理解
5. **按需跳转**：如果只需要修改特定功能（如添加工具），可以直接跳到第四周 Day 1-3
