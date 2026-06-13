# 第 11 章 · 插件与扩展系统

opencode 的扩展能力通过插件系统、MCP 协议集成、LSP 集成和 Skill 系统四个渠道实现。本章概述这些扩展机制的设计思路和集成方式。

## 11.1 TUI 插件 API

opencode 的终端界面（TUI）暴露了一套插件 API，允许外部代码在终端 UI 中注册自定义路由、组件和功能。

### 插件 API 的设计

TUI 插件 API 提供了以下能力：

- **路由注册**：插件可以注册自定义路由（URL 路径 → 组件映射），在 TUI 中展示自定义界面
- **UI 组件访问**：插件可以使用框架提供的 UI 组件库（DialogPrompt、DialogSelect 等）构建界面
- **对话框控制**：插件可以打开、关闭和替换对话框内容
- **路由导航**：插件可以在不同路由之间导航
- **主题感知**：插件可以读取当前主题（暗色/亮色模式）

### 插件加载

插件通过 `.opencode/plugins/` 目录下的文件加载。每个插件是一个 TypeScript/JavaScript 文件，导出一个符合 `TuiPluginApi` 接口的初始化函数。

### 插件示例：Smoke Test 插件

框架内置了一个 Smoke Test 插件（`.opencode/plugins/tui-smoke.tsx`），用于测试 TUI 插件 API 的各项功能。它注册了一个自定义路由，展示对话框提示和选择器，验证插件 API 的各个方法是否正常工作。

## 11.2 MCP 协议集成

MCP（Model Context Protocol）是 Anthropic 提出的 AI 工具集成协议。opencode 作为 MCP 客户端，可以连接到 MCP 服务器，将服务器提供的工具注册到工具系统中。

### MCP 工具集成

MCP 服务器在连接时声明其工具列表和 JSON Schema。opencode 将这些声明转换为 Dynamic 模式的工具（见第 4 章），注册到工具注册表中。AI 可以像调用内置工具一样调用 MCP 工具。

### MCP 资源集成

除了工具，MCP 服务器还可以提供"资源"——文件内容、数据库记录、API 响应等。opencode 将 MCP 资源作为上下文来源，在消息构建时注入相关资源内容。

### MCP 认证

opencode 支持 MCP 的 OAuth 认证流程。当 MCP 服务器要求认证时，框架引导用户完成 OAuth 授权，存储 access token，后续请求自动携带认证信息。

## 11.3 LSP 集成架构

LSP（Language Server Protocol）是代码编辑器的标准协议。opencode 集成了 LSP，让 AI 可以利用语言服务器的能力——跳转到定义、查找引用、获取诊断信息等。

### LSP 工具

opencode 将 LSP 能力封装为 `lsp` 工具，AI 可以调用它来：
- 跳转到符号定义
- 查找符号的所有引用
- 获取文件的诊断信息（错误、警告、提示）
- 获取光标位置的类型信息（Hover）
- 获取文件的符号大纲
- 执行代码操作（重命名等）

### LSP 服务器的自动发现

opencode 内置了常见语言服务器的发现和安装逻辑（`packages/opencode/src/lsp/server.ts`）。对于支持的编程语言，框架自动检测是否安装了对应的 LSP 服务器，如果未安装且用户允许，自动下载安装。

支持的语言包括：TypeScript/JavaScript、Rust（rust-analyzer）、Go（gopls）、Python（Pyright）、Ruby（Rubocop）、Swift（SourceKit）、F#（fsautocomplete）、Biome 等。

### LSP 通信

LSP 服务器作为子进程启动，通过 stdio 与 opencode 通信。框架管理 LSP 进程的生命周期——在需要时启动，在会话结束时关闭。

## 11.4 Skill 系统

Skill 是 opencode 的"可复用提示模板"系统。每个 Skill 是一个 Markdown 文件，包含给 AI 的详细指令，告诉 AI 在特定场景下如何行为。

### Skill 的结构

每个 Skill 文件包含：
- **元数据**：名称、描述、触发条件
- **指令正文**：给 AI 的详细操作指南

### Skill 的加载

Skill 可以从两个来源加载：
- **项目级别**：`.opencode/skills/` 目录
- **全局级别**：`~/.config/opencode/skills/` 目录

### Skill 的触发

Skill 可以通过以下方式触发：
- **用户显式调用**：`/skill-name` 斜杠命令
- **AI 自主选择**：AI 根据 Skill 的触发条件描述，判断当前场景是否适合使用某个 Skill
- **框架自动注入**：某些 Skill 在特定条件下自动注入 System Prompt

### Skill 与 Agent 的关系

Skill 和 Agent 是互补的扩展机制：
- **Agent** 定义了"谁来做"（角色、权限、模型）
- **Skill** 定义了"怎么做"（操作流程、最佳实践）

一个 Agent 可以使用多个 Skill，一个 Skill 可以被多个 Agent 使用。

---

## 本章小结

opencode 的扩展系统通过 TUI 插件 API（界面扩展）、MCP 协议集成（外部工具接入）、LSP 集成（语言智能增强）和 Skill 系统（行为模板复用），提供了多层次的扩展能力。这些扩展机制的设计共同遵循一个原则：扩展点清晰、接口稳定、不影响核心流程的可靠性。
