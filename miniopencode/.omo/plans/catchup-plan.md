# miniopencode 追平完整版 — 20 次迭代规划（无 TUI）

> **目标**：在 20 次迭代内，将 miniopencode 从现状提升到与完整版 opencode 功能等价。
> **方法**：直接从父目录 `../packages/` 移植完整版代码，按需适配 miniopencode 的包结构。不重写，只移植+简化。
> **原则**：优先用户可见的功能缺口，再补内部质量。
> **注意**：TUI（~200 文件）暂不纳入，集中精力在非 UI 的功能模块上。

---

## 当前差距速览

| 维度 | miniopencode | 完整版 | 覆盖率 |
|---|---|---|---|
| opencode 包代码行 | 4,353 行 | 102,321 行 | ~4% |
| 源文件数 (3包) | ~95 | ~751 | ~13% |
| CLI 命令 | 3 个 | 20+ 个 | ~15% |
| LLM 协议 | 仅 OpenAI | 5 协议 | ~20% |
| Provider | 2 个 | 13+ 个 | ~15% |
| MCP/ACP | 无 | 有 | 0% |
| LSP | 无 | 6 文件 | 0% |
| PTY 终端 | 无 | 7 文件 | 0% |
| Edit/Apply_Patch | 无 | 有 | 0% |
| 测试 | 0 目录 | 45+ 目录 | 0% |
| 类型安全 | 大量 `as any` | 干净 | 技术债 |

---

## 迭代路线图（20 次迭代）

### Phase A: CLI + 多协议 LLM（迭代 1-4）

> **目标**：补齐最常用的 CLI 命令，支持 Anthropic/Gemini 等多协议 LLM。

| # | 任务 | 移植源 | 行数 | 关键改动 |
|---|---|---|---|---|
| **A1** | CLI 命令扩展 | `cli/cmd/` 各文件 | ~800 | 移植 `cmd/providers.ts`、`cmd/models.ts`、`cmd/stats.ts`、`cmd/upgrade.ts`、`cmd/account.ts`、`cmd/mcp.ts`、`cmd/acp.ts`。每个命令保持简单——参数解析 + Service 调用 + 格式化输出。加入到 `index.ts` 的 yargs 注册。 |
| **A2** | LLM 多协议移植 | `llm/src/protocols/` | ~600 | 移植 `protocols/anthropic-messages.ts`、`protocols/gemini.ts`、`protocols/openai-responses.ts`、`protocols/bedrock-converse.ts` + `shared.ts`。miniopencode 的 `llm.ts` 目前直接 hardcode OpenAI 格式，改为按 provider 类型路由到对应协议。 |
| **A3** | LLM 多 Provider + 路由 | `llm/src/providers/` + `llm/src/route/` | ~800 | 移植 providers（anthropic.ts、google.ts、azure.ts、xai.ts、openrouter.ts）+ route 系统（index.ts、auth.ts、endpoint.ts、executor.ts、framing.ts、protocol.ts）。`llm/provider.ts` 接口需要扩展支持多 provider。 |
| **A4** | LLM Schema + 缓存 + 验证 | `llm/src/schema/` | ~400 | 移植 `schema/options.ts`（stream/温度/topP 等参数）、`schema/errors.ts`（分类错误类型）、`schema/events.ts`（流式事件）。移植 `cache-policy.ts`（请求缓存策略）。完善 `messages.ts` 的 tool-call 和 content-part 类型。 |

**验证**：`miniopencode run -p "hello" --provider anthropic` 能在 OpenAI、Anthropic、Gemini 之间切换。

---

### Phase B: MCP + ACP + PTY（迭代 5-9）

> **目标**：补齐三大高级协议——MCP 服务器集成、ACP Agent 通信、PTY 终端交互。

| # | 任务 | 移植源 | 行数 | 关键改动 |
|---|---|---|---|---|
| **B1** | MCP 基础 + Client | `mcp/index.ts` + `mcp/auth.ts` | ~500 | 移植 MCP 核心：Client/Server 连接管理、工具注册、资源列表、prompt 模板。`mcp/auth.ts` 处理 OAuth 流程。注册到 `project/bootstrap.ts`（MCP Service）和 `tool/registry.ts`（MCP 工具）。需要 `config/mcp.ts` 配置加载（已有骨架）。 |
| **B2** | MCP OAuth + CLI | `mcp/oauth-callback.ts` + `mcp/oauth-provider.ts` + `cli/cmd/mcp.ts` | ~400 | 移植 OAuth 回调服务器和 provider 端。`cli/cmd/mcp.ts` 提供子命令（list/add/remove/connect）。移植 `config/mcp.ts` 从完整版（现有的是骨架，需要对齐）。 |
| **B3** | ACP 协议 | `acp/` 全套 (5 文件) | ~400 | 移植 ACP 核心：`agent.ts`（协议定义，200 行）、`session.ts`（会话管理）、`runtime.ts`（运行时）、`types.ts`（类型）。`cli/cmd/acp.ts`（acp 命令）。ACP 让 miniopencode 能作为 agent 被其他进程调用。 |
| **B4** | PTY 终端 | `pty/` 全套 (7 文件) | ~800 | 移植：`index.ts`（PTY Service，365 行核心）、`pty.ts`（类型定义）、`pty.bun.ts`、`pty.node.ts`、`ticket.ts`、`schema.ts`、`input.ts`。PTY 需要 `node-pty` npm 依赖。注册到 `project/bootstrap.ts` 和 server endpoint。 |
| **B5** | PTY 集成 + 工具 | PTY 集成到 tool/server/cli | ~300 | PTY 工具注册到 `tool/registry.ts`。PTY API route 集成到 server。`cli/cmd/pty.ts`（可选）。PTY 票据系统与 session 绑定。 |

**验证**：
- `miniopencode mcp add` 连接 MCP 服务器，LLM 能调用 MCP 工具
- ACP 协议初始化握手通过
- PTY 终端能启动交互式 shell

---

### Phase C: LSP + 编辑工具 + Shell（迭代 10-12）

> **目标**：语言服务器协议集成、精确代码编辑工具、Shell 执行能力。

| # | 任务 | 移植源 | 行数 | 关键改动 |
|---|---|---|---|---|
| **C1** | LSP 服务 + 客户端 | `lsp/` 全套 (6 文件) | ~700 | 移植：`client.ts`（LSP 客户端）、`launch.ts`（Server 启动管理）、`server.ts`（Server 生命周期）、`diagnostic.ts`（诊断收集与缓存）、`language.ts`（语言检测）、`lsp.ts`（Service 封装）。注册到 `project/bootstrap.ts`。依赖 `vscode-languageserver-protocol` npm 包。 |
| **C2** | LSP 工具 + 集成 | `tool/lsp.ts` + `tool/lsp.txt` | ~300 | 移植 LSP 工具（diagnostics、goto-definition、references、hover）。注册到 `tool/registry.ts`。`session/system.ts` 中可选注入 LSP 诊断信息到 system prompt。 |
| **C3** | Edit + Apply_Patch + Shell | `tool/edit.ts`、`tool/apply_patch.ts`、`tool/shell.ts` + `shell/` + `format/` | ~700 | 移植：`edit.ts`（精确文本替换 + 行号模式）、`apply_patch.ts`（unified diff 应用）、`shell.ts`（终端命令执行 + prompt 管理 + id 生成）、`shell/shell.txt`。同时移植 `format/formatter.ts`（代码格式化 Service）。每个工具需要对应的 txt prompt 文件。 |

**验证**：
- LSP 工具返回诊断结果
- edit 工具精确修改文件内容
- apply_patch 能应用 unified diff

---

### Phase D: 核心模块补齐（迭代 13-16）

> **目标**：补齐完整版中剩余的独立模块，每个移植为最小可用版本。

| # | 任务 | 移植源 | 行数 | 关键改动 |
|---|---|---|---|---|
| **D1** | Auth + Account | `auth/` + `account/` | ~600 | 移植 auth Service（`index.ts`：token 管理、安全存储）+ account 模块（`account.ts`、`schema.ts`、`url.ts`、`repo.ts`、`account.sql.ts`）。迁移 `cli/cmd/account.ts`（login/logout/status 命令）。依赖 `open` npm 包（浏览器登录）。 |
| **D2** | Question + Reference | `question/` + `reference/` | ~500 | 移植 question Service（`index.ts` + `schema.ts`：用户提问队列/回复机制）。移植 reference 系统（`reference.ts`：@file 引用解析、`repository-cache.ts`：仓库缓存）。更新 `tool/question.ts` 工具（已有骨架，需要补全 Service 调用）。更新 `session/prompt.ts` 中的 parts 解析逻辑以支持 `@引用`。 |
| **D3** | Image + Patch + Installation | `image/` + `patch/` + `installation/` | ~400 | 移植：`image/image.ts`（图片 base64 编码、大小限制、格式检测）、`patch/index.ts`（diff 解析与应用）、`installation/index.ts`（版本检测、安装路径管理）。`cli/cmd/upgrade.ts` 和 `cli/cmd/uninstall.ts` 注册。 |
| **D4** | Sync + Share + Control-plane | `sync/`、`share/`、`control-plane/` | ~500 | 移植：`sync/index.ts`（事件同步，EventSource 订阅）、`share/session.ts`（会话分享 URL 生成）、`share/share-next.ts`、`control-plane/workspace.ts`（工作区管理）、`control-plane/workspace.sql.ts`。依赖 `event-source` polyfill（Node 环境）。 |

**验证**：
- `miniopencode account login` / `status` 工作
- LLM 在 prompt 中使用 `@file.ts` 引用被正确解析
- `miniopencode upgrade` 检测当前版本

---

### Phase E: 生产化与质量（迭代 17-20）

> **目标**：消除技术债，建立测试体系，打通端到端流程。

| # | 任务 | 移植源 | 行数 | 关键改动 |
|---|---|---|---|---|
| **E1** | 测试基础设施 + 核心测试 | `test/` 目录结构 | ~600 | 建立测试目录（`test/session/`、`test/tool/`、`test/permission/`、`test/provider/` 等）。移植重点测试：session CRUD 流程、tool 注册与执行、permission 评估链、Provider 路由。迁移 `test/fake/` 中的 mock 辅助函数。配置 `bun test` + test tsconfig。 |
| **E2** | 类型安全清理 | 全包逐文件修复 | ~300 修改 | 消除 `as any`、`@ts-ignore`、`@ts-expect-error`。重点：`tool/tool.ts` 的 Def.execute/Info.init 类型逃逸——改为泛型 R 传播；`session/prompt.ts` 的 `as any`——改用 Effect 类型推导；`server/index.ts` 的 `catch(e: any)`——改为分类错误类型。每个修改后跑 `bun typecheck` 验证。 |
| **E3** | 错误处理 + 边界情况 | 全包 review | ~400 修改 | 消除所有空 catch 块，至少加 `Effect.logError(e)`。补上：session 创建参数验证、tool 执行超时/取消传播（`Effect.timeout` + `Fiber.interrupt`）、LLM 调用重试回退（`retry.ts` 集成到 `prompt.ts`）、文件不存在的友好错误消息、Provider 连接失败的降级。 |
| **E4** | 集成验证 + CI + 收尾 | E2E 流程 + `.github/` | ~400 | 编写 E2E 测试脚本（CLI → LLM → 工具 → 会话持久化 完整流程）。配置 GitHub Actions（typecheck + test + build on push/PR）。验证 `bun run packages/opencode/src/index.ts run -p "hello"` 完整通过。更新 `progress.md` 和 `PLAN.md` 状态。 |

**验证**：
- `bun typecheck` 三个包全部 exit 0
- `bun test` 所有测试通过
- CI 绿色（push + PR）
- 端到端流程完整可运行

---

## 关键路径依赖

```
Phase A (CLI + LLM)
  │
  ├──▶ Phase B (MCP/ACP/PTY) — 依赖 A 的 CLI 命令注册 + tool registry
  │
  ├──▶ Phase C (LSP/Edit)    — 依赖 A 的 tool registry，不依赖 B（可并行）
  │
  ├──▶ Phase D (Modules)     — 依赖 A 的 CLI + config，部分不依赖 B/C（可并行）
  │
  └──▶ Phase E (Quality)     — 依赖所有前置 Phase
```

**可并行窗口**：
- B（迭代 5-9）和 C（迭代 10-12）**无依赖关系**，如果资源允许可交替执行
- D1（Auth/Account）和 D2（Question/Reference）**无依赖关系**
- E2（类型安全）可以贯穿全过程增量执行，不必等到 Phase E

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
| 多协议 LLM 优先于 MCP | 决定能用哪些模型（Claude/Gemini vs 仅 OpenAI），影响面最大 |
| MCP 优先于 LSP | MCP 是扩展能力的基础（第三方工具），LSP 是辅助功能 |
| PTY 先于 Auth/Account | PTY 是交互式编码体验的关键能力 |
| Edit/Apply_Patch 先于 Sync/Share | 编辑工具是 agent 核心能力（修改代码），Sync 是外围功能 |
| 测试集中到 Phase E | 前 16 次迭代 API 仍在变动，太早写测试会频繁重写 |
| 类型安全贯穿全程 | 每次迭代的新增代码必须类型安全，遗留 `as any` 在 E2 集中清理 |

---

## 完成后的预期状态

| 维度 | 当前 | 计划目标 | 覆盖率提升 |
|---|---|---|---|
| opencode 代码行 | 4,353 行 | ~25,000 行 | 4% → ~25% |
| CLI 命令 | 3 个 | 15+ 个 | 15% → ~75% |
| LLM 协议 | 1 个 | 5 个 | 20% → 100% |
| Provider | 2 个 | 8+ 个 | 15% → ~60% |
| MCP/ACP/PTY | 无 | 全部实现 | 0% → 100% |
| LSP + Edit 工具 | 无 | 全部实现 | 0% → 100% |
| 核心模块覆盖面 | ~40% | ~85% | 40% → ~85% |
| 测试 | 0 目录 | 10+ 目录 | 0% → 覆盖核心路径 |
| 类型安全 | 大量逃逸 | 零逃逸 | 修复全部技术债 |
