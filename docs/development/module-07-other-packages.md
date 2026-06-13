# 模块 7 · 其他包

本章介绍除核心包（opencode、llm、core、app、sdk）之外的其他 9 个包。

## 7.1 desktop — 桌面应用

`packages/desktop` 是 Electron 桌面应用，内嵌 Web 应用（`packages/app`）。

### 关键文件

| 文件 | 职责 |
|------|------|
| `src/main.ts` | Electron 主进程入口 |
| `src/preload.ts` | 预加载脚本（桥接 Node.js 和渲染进程） |
| `src/window.ts` | 窗口管理 |
| `icons/` | 应用图标资源 |

### 架构

Desktop 是一个薄壳——它启动 Electron 窗口，加载 Web 应用，通过预加载脚本提供 Node.js 能力（文件系统访问、进程管理等）。核心业务逻辑都在 Web 应用中。

## 7.2 enterprise — 企业版

`packages/enterprise` 提供企业版功能。

### 关键功能

- **共享会话**：`routes/share/[shareID].tsx` — 生成会话共享链接，供外部查看
- **团队管理**：Workspace 级别的成员和权限管理
- **认证集成**：企业 SSO 和 OAuth 集成

### 架构

Enterprise 包依赖 opencode 核心包，在其基础上添加企业级功能。共享会话通过生成唯一的 share ID，将会话内容以只读方式暴露给外部。

## 7.3 console — 管理控制台

`packages/console` 是 Workspace 管理控制台。

### 子包结构

| 子包 | 路径 | 功能 |
|------|------|------|
| `console/app` | `packages/console/app` | 控制台 Web 应用 |
| `console/core` | `packages/console/core` | 控制台核心逻辑（Actor 模型、数据库访问） |
| `console/resource` | `packages/console/resource` | 控制台资源定义 |

### 关键功能

- **Workspace 管理**：创建、配置、删除 Workspace
- **Provider 配置**：管理可用的模型提供商和 API 密钥
- **用量统计**：Token 消耗和成本追踪
- **成员管理**：邀请、角色、权限

### Actor 模型（`console/core/src/actor.ts`）

Console 使用 Actor 模型进行权限控制：
- `Account`：账户级别
- `User`：用户级别（关联 Workspace 和角色）
- `System`：系统级别（后台任务）
- `Public`：公开访问

## 7.4 ui — UI 组件库

`packages/ui` 是共享 UI 组件库，被 Web 应用和 Console 共同使用。

### 关键组件

| 组件 | 文件 | 功能 |
|------|------|------|
| `Button` | `components/button.tsx` | 按钮（多种 variant） |
| `Tooltip` | `components/tooltip.tsx` | 工具提示 |
| `Dialog` | `components/dialog.tsx` | 对话框 |
| `ProgressCircle` | `components/progress-circle.tsx` | 进度环（上下文用量展示） |
| `IconButton` | `components/icon-button.tsx` | 图标按钮 |
| `FileIcon` | `components/file-icon.tsx` | 文件类型图标 |
| `TextField` | `components/text-field.tsx` | 文本输入框 |

### 使用方式

```typescript
import { Button, Tooltip } from "@opencode-ai/ui"
```

组件库使用 SolidJS 构建，支持主题（暗色/亮色模式）。

## 7.5 plugin — 插件 SDK

`packages/plugin` 提供供外部插件开发者使用的类型定义和工具函数。

### 关键文件

| 文件 | 职责 |
|------|------|
| `src/tool.ts` | 插件工具定义接口（ToolContext、ToolResult） |
| `src/tui.ts` | TUI 插件 API 类型定义 |
| `src/example.ts` | 插件示例 |

### 使用场景

外部开发者使用 `@opencode-ai/plugin` 包来构建 opencode 插件，获得类型安全的工具定义和 TUI 集成能力。

## 7.6 function — 函数运行时

`packages/function` 提供沙箱化的代码执行环境，用于安全运行 AI 生成的代码。

## 7.7 http-recorder — HTTP 录制/回放

`packages/http-recorder` 是测试工具，用于录制和回放 HTTP 交互。

### 关键概念

- **Cassette**：一组录制的 HTTP 交互（请求-响应对）
- **录制模式**：记录真实的 HTTP 交互到文件
- **回放模式**：用录制的响应替代真实 HTTP 调用

### 使用场景

在测试中替代真实的 LLM API 调用，确保测试可重复、快速且不消耗 API 额度。

### 关键文件

| 文件 | 职责 |
|------|------|
| `src/cassette.ts` | Cassette 的读写（文件系统版和内存版） |
| `src/schema.ts` | Cassette 数据格式定义 |
| `src/redaction.ts` | 敏感信息检测与脱敏 |

## 7.8 slack — Slack 集成

`packages/slack` 提供 Slack Bot 功能，允许通过 Slack 与 opencode 交互。

## 7.9 storybook — 组件文档

`packages/storybook` 是 UI 组件库的 Storybook 展示，用于组件的独立开发和文档。

## 7.10 web — 网站/文档

`packages/web` 是 opencode 的官方网站和文档站点。

## 7.11 script — 构建脚本

`packages/script` 是跨包共享的构建和发布脚本库。

---

## 本章小结

除核心包外的 9 个包各有明确职责：desktop 提供桌面壳、enterprise 提供企业功能、console 提供管理控制台、ui 提供共享组件库、plugin 提供插件 SDK、function 提供沙箱执行、http-recorder 提供测试录制、slack 提供 Slack 集成、storybook 提供组件文档。大多数新功能开发集中在核心包（opencode、llm、app），这些辅助包在特定场景下才需要修改。
