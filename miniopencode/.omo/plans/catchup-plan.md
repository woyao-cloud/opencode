# miniopencode 追平完整版 — 20 次迭代规划

> **目标**：在 20 次迭代内，将 miniopencode 从现状提升到与完整版 opencode 功能等价。
> **方法**：直接从父目录 `../packages/` 移植完整版代码，按需适配 miniopencode 的包结构。不重写，只移植+简化。
> **原则**：优先用户可见的功能缺口，再补内部质量。

---

## 当前差距速览

| 维度 | miniopencode | 完整版 | 差距 |
|---|---|---|---|
| opencode 包代码行 | 4,353 行 | 102,321 行 | 1:23 |
| 源文件数 (3包) | ~95 | ~751 | 1:8 |
| CLI 命令 | 3 个 | 20+ 个 | 缺 17+ |
| TUI | 无 | ~200 文件 | 最大单项缺口 |
| 测试 | 0 目录 | 45+ 目录 | 完全缺失 |
| 多协议 LLM | 仅 OpenAI | 5 协议 (OA/Anthropic/Gemini/Bedrock/Responses) | 缺 4 协议 |
| MCP/ACP/PTY | 无 | 全部实现 | 完全缺失 |
| LSP/Edit 工具 | 无 | lsp.ts + edit.ts + apply_patch.ts | 完全缺失 |
| 类型安全 | 大量 `as any` | 干净 | 技术债 |

---

## 迭代路线图（20 次迭代）

### Phase A: CLI 与多协议（迭代 1-4）

> **目标**：补齐最常用的 CLI 命令，支持 Anthropic/Gemini 模型。

| # | 任务 | 移植源 | 行数估计 | 关键改动 |
|---|---|---|---|---|
| **1** | CLI 命令扩展 | `cli/cmd/` 各文件 | ~800 | 移植 `cmd/providers.ts`、`cmd/models.ts`、`cmd/stats.ts`、`cmd/upgrade.ts`、`cmd/account.ts`、`cmd/mcp.ts`。每个命令保持简单——参数解析 + Service 调用 + 格式化输出。加入到 `index.ts` 的 yargs 注册。 |
| **2** | LLM 多协议移植 | `llm/src/protocols/` | ~600 | 移植 `protocols/anthropic-messages.ts`、`protocols/gemini.ts`、`protocols/openai-responses.ts`、`protocols/bedrock-converse.ts` + `shared.ts`。miniopencode 的 `llm.ts` 目前直接 hardcode OpenAI 格式，改为按 provider 类型路由到对应协议。 |
| **3** | LLM 多 Provider + 路由 | `llm/src/providers/` + `llm/src/route/` | ~800 | 移植 providers (anthropic.ts, google.ts, azure.ts, xai.ts, openrouter.ts) + route 系统 (index.ts, auth.ts, endpoint.ts, executor.ts, framing.ts, protocol.ts)。`llm/provider.ts` 需要扩 interface 支持多 provider 配置。 |
| **4** | LLM Schema 完善 + 验证 | `llm/src/schema/` | ~400 | 移植 `schema/options.ts`（stream/温度/topP 等参数）、`schema/errors.ts`（分类错误类型）、`schema/events.ts`（流式事件）。完善 `messages.ts` 的 tool-call 和 content-part 类型，对齐完整版。|

**验证**：`miniopencode run -p "hello" --provider anthropic` 能在 OpenAI 和 Anthropic 之间切换。

---

### Phase B: TUI 终端 UI（迭代 5-8）

> **目标**：实现交互式终端 UI，替代当前的纯文本 CLI。

| # | 任务 | 移植源 | 行数估计 | 关键改动 |
|---|---|---|---|---|
| **5** | TUI 框架 + 路由 | `cli/cmd/tui/app.tsx` + `layer.ts` + `thread.ts` + `routes/` | ~600 | 移植 Ink 应用入口、layer/thread 调度、home + session 路由。这是 TUI 的骨架 — 只要路由切换和基本渲染正确，后续往里面加组件。miniopencode 需要加 `ink` 依赖。 |
| **6** | TUI 核心组件 | `cli/cmd/tui/component/` 关键文件 | ~800 | 移植 `prompt/index.tsx`（输入框 + autocomplete + history + frecency）、`spinner.tsx`、`logo.tsx`、`todo-item.tsx`、`border.tsx`、`bg-pulse.tsx`、`startup-loading.tsx`、`error-component.tsx`。跳过 dialog 类，下一迭代专门做。 |
| **7** | TUI Dialog 系统 | `cli/cmd/tui/component/dialog-*.tsx` + `ui/dialog*.tsx` | ~700 | 移植 dialog 框架（`dialog.tsx`、`dialog-alert.tsx`、`dialog-confirm.tsx`、`dialog-select.tsx`、`dialog-help.tsx`）+ 业务 dialog（`dialog-agent.tsx`、`dialog-model.tsx`、`dialog-provider.tsx`、`dialog-session-*.tsx`、`dialog-skill.tsx`）。权限和问题的 dialog 是关键交互节点。 |
| **8** | TUI Context + 主题 + 配置 | `cli/cmd/tui/context/` + `theme/` + `config/` | ~600 | 移植必须的 context（`theme.tsx`、`project.tsx`、`args.tsx`、`prompt.tsx`、`route.tsx`）+ 5 个核心主题 + tui config schema。注意 win32 兼容——`win32.ts` 中的 Windows 回退逻辑（ANSI 转义缺失处理）必须一起移植。 |

**验证**：`miniopencode run -i` 启动交互式 TUI，能输入 prompt、看到 spinner、有主题配色。

---

### Phase C: MCP + LSP + 编辑工具（迭代 9-12）

> **目标**：支持 MCP 服务器、LSP 诊断、以及代码编辑工具链。

| # | 任务 | 移植源 | 行数估计 | 关键改动 |
|---|---|---|---|---|
| **9** | MCP 基础 + 认证 | `mcp/index.ts` + `mcp/auth.ts` | ~500 | 移植 MCP 核心：Client/Server 连接、工具注册、资源列表、prompt 模板。`mcp auth.ts` 处理 OAuth 流程。注册到 `project/bootstrap.ts` 和 `tool/registry.ts`。 |
| **10** | MCP OAuth + CLI 集成 | `mcp/oauth-callback.ts` + `mcp/oauth-provider.ts` + `cli/cmd/mcp.ts` | ~400 | 移植 OAuth 回调服务器和 provider 端。`cli/cmd/mcp.ts` 移植为 `miniopencode mcp` 子命令（list/add/remove/connect）。 |
| **11** | LSP 集成 | `lsp/` 全套 (6 文件) + `tool/lsp.ts` + `tool/lsp.txt` | ~700 | 移植 LSP client (`client.ts`)、server 管理 (`launch.ts`、`server.ts`)、diagnostic 收集 (`diagnostic.ts`)、语言检测 (`language.ts`)、`lsp.ts`（Service 封装）。移植 `tool/lsp.ts` 工具（诊断 + goto-def + references）。注册到 tool registry。 |
| **12** | Edit + Apply_Patch + Shell 工具 | `tool/edit.ts`、`tool/apply_patch.ts`、`tool/shell.ts` + `shell/` | ~600 | 移植三个关键工具：`edit.ts`（精确文本替换）、`apply_patch.ts`（unified diff 应用）、`shell.ts`（终端命令执行 + shell prompt + id）。每个工具需要 txt prompt 文件。注册到 tool registry。 |

**验证**：
- `miniopencode mcp add` 连接 MCP 服务器，`run` 中能调用 MCP 工具
- LSP 工具能返回诊断结果
- edit 工具能精确修改文件内容

---

### Phase D: PTY + 高级模块（迭代 13-16）

> **目标**：补齐 PTY 终端、auth/account 系统、测试基础设施。

| # | 任务 | 移植源 | 行数估计 | 关键改动 |
|---|---|---|---|---|
| **13** | PTY 终端全套 | `pty/` 全套 (7 文件) | ~800 | 移植：`index.ts`（PTY Service，365 行核心）、`pty.ts`（类型定义）、`pty.bun.ts`、`pty.node.ts`、`ticket.ts`、`schema.ts`、`input.ts`。PTY 需要 node-pty/npm 依赖。注册到 `project/bootstrap.ts` 和 server endpoint 中。 |
| **14** | Auth + Account 模块 | `auth/` + `account/` | ~600 | 移植 auth Service (`index.ts`：token 管理、安全存储) + account 模块 (`account.ts`、`schema.ts`、`url.ts`、`repo.ts`、`account.sql.ts`)。迁移 `cli/cmd/account.ts`（login/logout/status）。 |
| **15** | Question + Reference + Image | `question/`、`reference/`、`image/` | ~500 | 移植：question Service (`index.ts` + `schema.ts`，用户提问队列/回复)、reference 系统 (`reference.ts` + `repository-cache.ts`，@file 引用解析)、image 处理 (`image.ts`，图片 base64 编码/大小限制)。更新 `tool/question.ts` 和 `session/prompt.ts` 中的引用解析逻辑。 |
| **16** | 测试框架 + 核心测试 | `test/` 目录结构 + 关键测试 | ~600 | 建立测试目录结构（`test/session/`、`test/tool/`、`test/permission/`、`test/provider/` 等）。移植重点测试：session CRUD、tool 执行、permission 评估。配置 bun test、test 辅助函数（`fake/` 目录）。**不作 100% 覆盖，只覆盖核心数据流**。|

**验证**：
- PTY 终端能启动交互式 shell
- `miniopencode account login` / `status` 工作
- `bun test` 跑通核心测试套件

---

### Phase E: 生产化与质量（迭代 17-20）

> **目标**：消除技术债，补完剩余模块，集成验证。

| # | 任务 | 移植源 | 行数估计 | 关键改动 |
|---|---|---|---|---|
| **17** | 类型安全清理 | 全包搜索 + 逐文件修复 | ~300 修改 | 消除 `as any`、`@ts-ignore`、`@ts-expect-error`。具体：`tool/tool.ts` 中的 Def.execute/Info.init 类型逃逸——改为泛型 R 传播；`session/prompt.ts` 中的 `as any`——改用 Effect 类型推导；`server/index.ts` 中的 `catch(e: any)`——改为分类错误类型。每改一个文件跑 `bun typecheck` 验证。 |
| **18** | 错误处理 + 边界情况 | 全包 review | ~400 修改 | 消除空 catch 块。给每个 catch 至少加 `Effect.logError(e)` 或结构化错误处理。补上：session 创建的参数验证、tool 执行的超时/取消传播、LLM 调用的重试回退（retry.ts 集成到 prompt.ts）、文件不存在的友好错误。 |
| **19** | 剩余模块补齐 | `sync/`、`share/`、`control-plane/`、`format/`、`installation/`、`patch/` | ~600 | 移植优先级排列：format/formatter.ts（代码格式化 Service）→ installation/index.ts（版本检测+安装路径）→ patch/index.ts（diff 解析+应用）→ sync/index.ts（事件同步）→ share/session.ts（会话分享 URL）→ control-plane/workspace.ts（工作区管理）。各模块只移植最小可用版本。 |
| **20** | 集成验证 + CI | E2E 流程 + `.github/` | ~400 | 编写 E2E 测试脚本（CLI 启动 → LLM 调用 → 工具执行 → 会话持久化 的完整流程）。配置 GitHub Actions（typecheck + test + build）。编写 CONTRIBUTING.md。验证 `bun run packages/opencode/src/index.ts run -p "hello"` 完整通过。 |

**验证**：
- `bun typecheck` 所有包 exit 0
- `bun test` 所有测试通过
- CI 绿色通过
- E2E 流程完整可运行

---

## 关键路径依赖

```
Phase A (CLI+LLM)
  │
  ▼
Phase B (TUI) ────────── 依赖 A 的 CLI 框架
  │
  ▼
Phase C (MCP/LSP/Edit) ─ 依赖 A 的 tool registry，不依赖 B（可并行）
  │
  ▼
Phase D (PTY/模块/测试) ─ 依赖 A+C，部分不依赖 B（可并行）
  │
  ▼
Phase E (质量/集成) ──── 依赖 A+B+C+D（最终阶段）
```

**可并行窗口**：
- 迭代 5-8（TUI）与 9-12（MCP/LSP）**无依赖关系**，可交替或并行执行
- 迭代 13-14（PTY/Auth）与 15（Question/Reference）**无依赖关系**
- 迭代 17（类型安全）可以贯穿整个过程增量执行

---

## 每次迭代的验收标准

```
每一次迭代完成后必须：
  ✅ bun typecheck 通过（exit 0）
  ✅ 新功能可运行演示
  ✅ 不破坏已有功能（regression check）
  ✅ 迭代产物更新到 progress.md
```

---

## 优先级权衡说明

| 决策 | 原因 |
|---|---|
| TUI 优先于 MCP | TUI 是用户每次使用都面对的东西，MCP 是扩展能力。先让交互体验完整。 |
| 多协议优先于 PTY | 多协议决定能用哪些模型，PTY 是高级功能。前者影响面更大。 |
| Edit/Apply_Patch 优先于 Reference | 编辑工具是 agent 的核心能力（修改代码），引用解析是辅助功能。 |
| 测试靠后不省略 | Phase D 先补核心功能，Phase E 用测试巩固。太早写测试会因 API 变动频繁而浪费。 |
| 类型安全贯穿全程 | 每次迭代新增代码必须类型安全，遗留的 `as any` 在 Phase E 集中清理。 |

---

## 完成后的差距评估

20 次迭代后，预期从 **1:23 代码量差距** 缩小到约 **1:3**（miniopencode ~30,000 行 vs 完整版 ~100,000 行），功能覆盖面从 **~15% 提升到 ~80%**。剩余差距主要是完整版的深度实现（200+ 文件 TUI 的 dialogs/plugins、30+ provider plugins、45 测试目录的完整覆盖），这些对核心用户体验影响较小，可以后续持续补齐。
