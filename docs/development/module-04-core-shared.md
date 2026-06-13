# 模块 4 · 共享基础库

`packages/core` 是跨包共享的基础类型和工具库。它是 monorepo 的最底层包，不依赖任何其他包。

## 4.1 目录结构

```text
packages/core/src/
├── index.ts              # 包入口
├── session-event.ts      # 会话事件类型体系（40+ 种事件）
├── session-message.ts    # 消息 Schema 定义
├── session-prompt.ts     # 用户 Prompt 结构
├── session-message-updater.ts  # 消息状态更新器
├── event.ts              # 通用事件定义框架
├── model.ts              # 模型相关类型
├── tool-output.ts        # 工具输出类型
├── v2-schema.ts          # V2 协议通用 Schema
├── filesystem.ts         # 文件系统抽象
├── global.ts             # 跨平台路径管理
├── npm-config.ts         # npm 配置读取
├── util/
│   ├── log.ts            # 日志系统
│   ├── glob.ts           # 文件 Glob 匹配
│   └── locale.ts         # 本地化工具
├── effect/
│   ├── logger.ts         # Effect 日志桥接
│   ├── observability.ts  # OpenTelemetry 集成
│   └── runtime.ts        # Effect 运行时配置
├── flag/
│   └── flag.ts           # 功能开关
├── installation/         # 安装相关
├── plugin/               # 插件相关基础类型
└── github-copilot/       # GitHub Copilot 集成基础
```

## 4.2 会话事件体系（`session-event.ts`）

这是 opencode 事件驱动架构的基础。定义了 40+ 种会话事件类型，覆盖会话生命周期的所有关键节点。

### 事件分类

| 类别 | 事件 | 说明 |
|------|------|------|
| **会话** | `session.created`、`session.loaded`、`session.archived`、`session.deleted` | 会话生命周期 |
| **消息** | `message.updated` | 消息创建或更新 |
| **Part** | `message.part.updated` | Part 更新（最频繁的事件） |
| **Step** | `step.started`、`step.finished`、`step.failed` | LLM 调用步 |
| **工具** | `tool.started`、`tool.completed`、`tool.failed` | 工具执行 |
| **压缩** | `compaction.started`、`compaction.completed` | 上下文压缩 |
| **权限** | `permission.asked`、`permission.replied` | 权限交互 |
| **Shell** | `shell.started`、`shell.completed` | 命令执行 |
| **错误** | `session.error` | 会话级别错误 |
| **Agent** | `agent-switched`、`model-switched` | Agent/模型切换 |
| **文件** | `file.attachment` | 文件附件 |

### 事件定义框架

`event.ts` 提供了通用的事件定义框架：
- `define(type, version, schema)`：定义一个新事件类型
- `Interface`：事件系统的公共接口

## 4.3 消息 Schema（`session-message.ts`）

定义了会话中所有消息类型的 Schema：

| 消息类型 | 说明 |
|---------|------|
| `User` | 用户输入消息（文本 + 文件 + Agent 引用） |
| `Assistant` | AI 响应消息（文本 + 推理 + 工具调用 + Token 信息） |
| `Shell` | Shell 命令执行记录 |
| `Synthetic` | 合成消息（对用户不可见，仅发送给 AI） |
| `Compaction` | 上下文压缩摘要 |
| `AgentSwitched` | Agent 切换记录 |
| `ModelSwitched` | 模型切换记录 |

### Assistant 消息的 Part 类型

Assistant 消息由多个 Part 组成：
- `AssistantText`：文本内容
- `AssistantReasoning`：推理内容
- `AssistantTool`：工具调用（含状态：pending/running/completed/error）

## 4.4 日志系统（`util/log.ts`）

自研的轻量级日志系统，零外部依赖。

### 关键特性

- **四级日志**：DEBUG、INFO、WARN、ERROR
- **Tag 机制**：每条日志携带键值对 Tag（service、sessionID、modelID 等）
- **文件轮转**：自动保留最近 10 个日志文件
- **时间追踪**：`logger.time()` 方法自动记录操作耗时
- **服务缓存**：同一 service 名的 Logger 被缓存复用

### 使用方式

```typescript
import { Log } from "@opencode-ai/core/util/log"

const log = Log.create({ service: "my-module" })
log.info("operation completed", { duration: 1200 })
log.error("operation failed", { error: new Error("...") })

// 时间追踪
using _ = log.time("expensive-operation")
// ... 操作 ...
// 自动记录: "expensive-operation completed · 1.2s"
```

## 4.5 文件系统抽象（`filesystem.ts`）

统一的文件操作接口，支持依赖注入替换。

### 关键方法

- `read(path)`：读取文件内容
- `write(path, content)`：写入文件
- `exists(path)`：检查文件是否存在
- `stat(path)`：获取文件状态
- `contains(parent, child)`：检查路径包含关系

## 4.6 全局路径管理（`global.ts`）

跨平台的配置、数据、日志目录管理。

| 路径 | 说明 |
|------|------|
| `Global.Path.config` | 配置目录（`~/.config/opencode/`） |
| `Global.Path.data` | 数据目录（`~/.local/share/opencode/`） |
| `Global.Path.log` | 日志目录（`~/.local/share/opencode/log/`） |
| `Global.Path.bin` | 二进制目录 |
| `Global.Path.home` | 用户主目录 |

## 4.7 OpenTelemetry 集成（`effect/observability.ts`）

为关键操作创建标准化 OTel Span 的基础设施。

### 关键功能

- `withRunSpan(name, attributes, fn)`：创建 Span 并执行操作
- `setRunSpanAttributes(attrs)`：设置 Span 属性
- `recordRunSpanError(error)`：记录 Span 错误

---

## 本章小结

`packages/core` 提供了 opencode 的基础类型和工具：SessionEvent 事件体系（40+ 种事件）、Message Schema 定义、日志系统、文件系统抽象和全局路径管理。它是所有其他包的基础依赖，修改 core 中的类型会影响整个项目。
