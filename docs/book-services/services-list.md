# OpenCode Services 清单

扫描范围：`packages/opencode/src` + `packages/core/src`，筛选规则：`export class * extends Context.Service`。

## 基础层 (core)

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `AppFileSystem` | `@opencode/FileSystem` | `core/src/filesystem.ts` | 文件系统抽象，读写/目录操作/安全路径检查 |
| `AppProcess` | `@opencode/AppProcess` | `core/src/process.ts` | 进程管理，执行外部命令 |
| `Global` | `@opencode/Global` | `core/src/global.ts` | 全局路径常量（home/config/data/cache） |
| `Location` | `@opencode/Location` | `core/src/location.ts` | 运行时位置追踪（Ref 实现） |
| `Event` | `@opencode/Event` | `core/src/event.ts` | 事件总线（内部 v2，与 Bus 不同） |
| `Npm` | `@opencode/Npm` | `core/src/npm.ts` | npm 包管理，安装/更新依赖 |
| `EffectFlock` | `EffectFlock` | `core/src/util/effect-flock.ts` | 文件锁，防止并发文件写入竞态 |

## v2 基础设施

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `AISDK` | `@opencode/v2/AISDK` | `core/src/aisdk.ts` | AI SDK 统一封装 |
| `Catalog` | `@opencode/v2/Catalog` | `core/src/catalog.ts` | 模型目录/模型发现 |
| `Auth` (v2) | `@opencode/v2/Auth` | `core/src/auth.ts` | v2 认证管理 |
| `Plugin` (v2) | `@opencode/v2/Plugin` | `core/src/plugin.ts` | v2 插件系统 |
| `PluginBoot` | `@opencode/v2/PluginBoot` | `core/src/plugin/boot.ts` | v2 插件引导 |
| `ModelsDev` | `@opencode/ModelsDev` | `core/src/models.ts` | 开发模式模型管理 |

## 账户与认证

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `Auth` | `@opencode/Auth` | `opencode/src/auth/index.ts` | OAuth 认证（GitHub/GitLab/openCode Console 等） |
| `Account` | `@opencode/Account` | `opencode/src/account/account.ts` | 账户管理，Console 登录/组织切换 |
| `AccountRepo` | `@opencode/AccountRepo` | `opencode/src/account/repo.ts` | 账户仓库，持久化账户数据 |

## 配置与安装

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `Config` | `@opencode/Config` | `opencode/src/config/config.ts` | 统一配置管理，多层配置加载/合并/缓存 |
| `Env` | `@opencode/Env` | `opencode/src/env/index.ts` | 环境变量管理 |
| `Installation` | `@opencode/Installation` | `opencode/src/installation/index.ts` | 安装信息，版本检测/升级 |
| `TuiConfig` | `@opencode/TuiConfig` | `opencode/src/cli/cmd/tui/config/tui.ts` | TUI 主题和键盘绑定配置 |
| `DataMigration` | `@opencode/DataMigration` | `opencode/src/data-migration.ts` | 数据格式迁移 |

## 项目与版本控制

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `Project` | `@opencode/Project` | `opencode/src/project/project.ts` | 项目结构分析（多语言/框架检测） |
| `Vcs` | `@opencode/Vcs` | `opencode/src/project/vcs.ts` | 版本控制（Git）操作 |
| `Git` | `@opencode/Git` | `opencode/src/git/index.ts` | Git 操作的低级封装 |
| `Worktree` | `@opencode/Worktree` | `opencode/src/worktree/index.ts` | Git worktree 管理（隔离工作区） |
| `Workspace` | `@opencode/Workspace` | `opencode/src/control-plane/workspace.ts` | 工作空间 CRUD |
| `InstanceStore` | `@opencode/InstanceStore` | `opencode/src/project/instance-store.ts` | 实例状态持久化存储 |
| `InstanceBootstrap` | `@opencode/InstanceBootstrap` | `opencode/src/project/bootstrap-service.ts` | 实例引导启动 |

## Session 体系

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `Session` | `@opencode/Session` | `opencode/src/session/session.ts` | Session 核心管理（CRUD、消息、Fork） |
| `SessionPrompt` | `@opencode/SessionPrompt` | `opencode/src/session/prompt.ts` | LLM 对话 prompt 构建 |
| `SessionProcessor` | `@opencode/SessionProcessor` | `opencode/src/session/processor.ts` | 消息处理流水线（流式/非流式） |
| `SessionCompaction` | `@opencode/SessionCompaction` | `opencode/src/session/compaction.ts` | 上下文压缩/摘要 |
| `SessionSummary` | `@opencode/SessionSummary` | `opencode/src/session/summary.ts` | 对话摘要生成 |
| `SessionRevert` | `@opencode/SessionRevert` | `opencode/src/session/revert.ts` | 对话回退/撤销 |
| `SessionStatus` | `@opencode/SessionStatus` | `opencode/src/session/status.ts` | Session 状态追踪 |
| `SessionTodo` | `@opencode/SessionTodo` | `opencode/src/session/todo.ts` | TODO 列表管理 |
| `SessionRunState` | `@opencode/SessionRunState` | `opencode/src/session/run-state.ts` | 运行状态追踪 |
| `LLM` | `@opencode/LLM` | `opencode/src/session/llm.ts` | LLM 调用封装（流式/非流式） |
| `SystemPrompt` | `@opencode/SystemPrompt` | `opencode/src/session/system.ts` | 系统 Prompt 构建 |
| `Instruction` | `@opencode/Instruction` | `opencode/src/session/instruction.ts` | 用户指令解析 |
| `v2/Session` | `@opencode/v2/Session` | `opencode/src/v2/session.ts` | v2 Session API |

## 工具系统

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `ToolRegistry` | `@opencode/ToolRegistry` | `opencode/src/tool/registry.ts` | 工具注册/发现/分发 |
| `Truncate` | `@opencode/Truncate` | `opencode/src/tool/truncate.ts` | 工具输出截断管理 |

## Provider 体系

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `Provider` | `@opencode/Provider` | `opencode/src/provider/provider.ts` | AI Provider 管理（模型列表/鉴权/调用） |
| `ProviderAuth` | `@opencode/ProviderAuth` | `opencode/src/provider/auth.ts` | Provider 认证（API Key/OAuth） |

## MCP (Model Context Protocol)

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `MCP` | `@opencode/MCP` | `opencode/src/mcp/index.ts` | MCP 服务器生命周期管理 |
| `McpAuth` | `@opencode/McpAuth` | `opencode/src/mcp/auth.ts` | MCP OAuth 认证 |

## LSP / 格式化

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `LSP` | `@opencode/LSP` | `opencode/src/lsp/lsp.ts` | LSP 客户端管理 |
| `Format` | `@opencode/Format` | `opencode/src/format/index.ts` | 代码格式化 |

## 文件与搜索

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `File` | `@opencode/File` | `opencode/src/file/index.ts` | 文件操作（读写/搜索/替换/glob） |
| `FileWatcher` | `@opencode/FileWatcher` | `opencode/src/file/watcher.ts` | 文件变更监控 |
| `Ripgrep` | `@opencode/Ripgrep` | `opencode/src/file/ripgrep.ts` | ripgrep 内容搜索 |

## 终端与 Shell

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `Pty` | `@opencode/Pty` | `opencode/src/pty/index.ts` | 伪终端管理 |
| `PtyTicket` | `@opencode/PtyTicket` | `opencode/src/pty/ticket.ts` | PTY 连接票据 |

## 权限与安全

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `Permission` | `@opencode/Permission` | `opencode/src/permission/index.ts` | 权限策略管理（allow/deny/ask） |

## 技能与命令

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `Skill` | `@opencode/Skill` | `opencode/src/skill/index.ts` | 技能加载与注册 |
| `SkillDiscovery` | `@opencode/SkillDiscovery` | `opencode/src/skill/discovery.ts` | 技能发现（目录扫描） |
| `Command` | `@opencode/Command` | `opencode/src/command/index.ts` | 自定义命令管理 |

## 事件与通信

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `Bus` | `@opencode/Bus` | `opencode/src/bus/index.ts` | 事件总线（发布/订阅） |
| `EventV2Bridge` | `@opencode/EventV2Bridge` | `opencode/src/event-v2-bridge.ts` | v2 事件桥接 |
| `SyncEvent` | `@opencode/SyncEvent` | `opencode/src/sync/index.ts` | 跨实例同步事件 |

## 共享与协作

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `SessionShare` | `@opencode/SessionShare` | `opencode/src/share/session.ts` | Session 分享 |
| `ShareNext` | `@opencode/ShareNext` | `opencode/src/share/share-next.ts` | 新版分享服务 |

## 插件系统

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `Plugin` | `@opencode/Plugin` | `opencode/src/plugin/index.ts` | 插件加载与管理 |

## Agent

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `Agent` | `@opencode/Agent` | `opencode/src/agent/agent.ts` | Agent 定义/加载/执行 |

## 其他

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `Image` | `@opencode/Image` | `opencode/src/image/image.ts` | 图片处理/压缩 |
| `Snapshot` | `@opencode/Snapshot` | `opencode/src/snapshot/index.ts` | 文件快照（用于撤销/重做） |
| `Question` | `@opencode/Question` | `opencode/src/question/index.ts` | 用户交互问题 |
| `BackgroundJob` | `@opencode/BackgroundJob` | `opencode/src/background/job.ts` | 后台任务管理 |
| `Reference` | `@opencode/Reference` | `opencode/src/reference/reference.ts` | `@alias` 引用解析 |
| `Storage` | `@opencode/Storage` | `opencode/src/storage/storage.ts` | 持久化存储抽象 |

## Server 层

| Service | 标识符 | 文件 | 功能 |
|---------|--------|------|------|
| `HttpApiWebSocketTracker` | `@opencode/HttpApiWebSocketTracker` | `opencode/src/server/routes/instance/httpapi/websocket-tracker.ts` | WebSocket 连接追踪 |

## 统计

- **总计**: 67 个 Service
- **opencode 包**: 54 个
- **core 包**: 13 个

## 按领域分布

```
账户与认证          ██████ 6
基础层 (core)       ███████ 7
v2 基础设施         ██████ 6
配置与安装          █████ 5
项目与版本控制      ███████ 7
Session 体系        █████████████ 13
工具系统            ██ 2
Provider 体系       ██ 2
MCP                 ██ 2
LSP/格式化          ██ 2
文件与搜索          ███ 3
终端与 Shell        ██ 2
权限与安全          █ 1
技能与命令          ███ 3
事件与通信          ███ 3
共享与协作          ██ 2
插件系统            █ 1
Agent               █ 1
其他                ██████ 6
Server 层           █ 1
```
