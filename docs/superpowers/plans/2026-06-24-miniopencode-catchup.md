# miniopencode 追平完整版 opencode — 实施计划

> **状态：待确认 | 日期：2026-06-24 | 迭代数：20**

**目标：** 用 20 次迭代将 miniopencode 的功能覆盖度从 ~50% 提升到 ~85%，重点补齐核心缺失模块、工具和 CLI 命令。

**当前基线：**
- 源文件：~100（完整版 ~414）
- 模块：30/43（完整版 43）
- 工具：10/20（完整版 20）
- CLI 命令：4/22（完整版 22）
- Provider 协议：3/5（完整版 5）
- 测试：3 个文件（完整版 45+ 测试目录）

**不包含：** TUI、control-plane、account、acp、v2、ide（这些是高级/企业功能，非核心差距）

---

## 迭代规划

### 第 1-2 次：认证系统（auth）

完整版 opencode 有完整的认证系统，支持多 provider 的 API key 管理。

| 文件 | 说明 |
|---|---|
| `src/auth/index.ts` | AuthService — API key 管理、provider 认证、token 刷新 |
| `src/auth/schema.ts` | Auth Schema — 认证配置、凭据类型 |
| `src/provider/auth.ts` | Provider 认证集成 — 各 provider 的认证方式 |

**参考：** `packages/opencode/src/auth/`, `packages/opencode/src/provider/auth.ts`

### 第 3-4 次：安装与升级系统（installation）

| 文件 | 说明 |
|---|---|
| `src/installation/index.ts` | InstallationService — 版本检测、更新检查、自动升级 |
| `src/cli/cmd/upgrade.ts` | `miniopencode upgrade` 命令 |
| `src/cli/cmd/uninstall.ts` | `miniopencode uninstall` 命令 |

**参考：** `packages/opencode/src/installation/`

### 第 5-6 次：补齐工具（上）

| 文件 | 说明 |
|---|---|
| `src/tool/shell.ts` | Shell 执行工具（交互式 shell 会话） |
| `src/tool/todo.ts` | Todo 管理工具 |
| `src/tool/plan.ts` | 计划生成工具 |
| `src/tool/repo_overview.ts` | 仓库概览工具 |
| `src/tool/repo_clone.ts` | 仓库克隆工具 |

**参考：** `packages/opencode/src/tool/shell.ts`, `todo.ts`, `plan.ts` 等

### 第 7-8 次：补齐工具（下）

| 文件 | 说明 |
|---|---|
| `src/tool/mcp-websearch.ts` | 基于 MCP 的 Web 搜索工具 |
| `src/tool/external-directory.ts` | 外部目录访问工具 |
| `src/tool/schema.ts` | 工具参数 Schema 生成 |
| `src/tool/truncation-dir.ts` | 截断目录管理 |
| `src/tool/invalid.ts` | 无效工具处理 |

### 第 9-10 次：CLI 命令（上）

| 文件 | 说明 |
|---|---|
| `src/cli/cmd/agent.ts` | Agent 管理命令（list/get/create） |
| `src/cli/cmd/models.ts` | 模型列表命令 |
| `src/cli/cmd/providers.ts` | Provider 管理命令 |
| `src/cli/cmd/db.ts` | 数据库工具命令 |

### 第 11-12 次：CLI 命令（下）

| 文件 | 说明 |
|---|---|
| `src/cli/cmd/export.ts` | Session 导出命令 |
| `src/cli/cmd/import.ts` | Session 导入命令 |
| `src/cli/cmd/stats.ts` | 使用统计命令 |
| `src/cli/cmd/generate.ts` | 代码生成命令 |

### 第 13-14 次：Patch 系统 + Reference 系统

| 文件 | 说明 |
|---|---|
| `src/patch/index.ts` | PatchService — patch 的创建、应用、管理 |
| `src/reference/index.ts` | ReferenceService — 代码引用管理 |

**参考：** `packages/opencode/src/patch/`, `packages/opencode/src/reference/`

### 第 15-16 次：Image 处理 + ID 系统

| 文件 | 说明 |
|---|---|
| `src/image/index.ts` | ImageService — 图片处理（base64、缩放、格式转换） |
| `src/id/index.ts` | ID 生成系统（Snowflake 风格 ID） |

**参考：** `packages/opencode/src/image/`, `packages/opencode/src/id/`

### 第 17-18 次：测试覆盖

补齐核心模块的测试：

| 测试文件 | 覆盖模块 |
|---|---|
| `test/mcp.test.ts` | MCP 客户端、工具发现 |
| `test/pty.test.ts` | PTY 创建、写入、resize |
| `test/lsp.test.ts` | LSP 初始化、诊断 |
| `test/provider.test.ts` | Provider 路由、协议 |
| `test/auth.test.ts` | 认证、API key 管理 |
| `test/cli.test.ts` | CLI 命令解析、执行 |

### 第 19 次：集成测试 + 端到端验证

| 测试文件 | 说明 |
|---|---|
| `test/e2e/smoke.test.ts` | CLI → Session → LLM → Tools 全链路 |
| `test/e2e/mcp-e2e.test.ts` | MCP 服务器连接 + 工具调用 |
| `test/e2e/pty-e2e.test.ts` | PTY 创建 + 命令执行 + 输出读取 |

### 第 20 次：收尾 + 文档

| 内容 | 说明 |
|---|---|
| `README.md` 更新 | 新功能列表、架构图 |
| CLI --help 完善 | 所有命令的帮助文本 |
| 配置文档 | miniopencode.json 配置说明 |
| 发布脚本 | 版本发布流程 |

---

## 预期效果

20 次迭代后，miniopencode 将达到：

| 维度 | 当前 | 目标 | 完整版 |
|---|---|---|---|
| 模块数 | 30/43 | 38/43 (88%) | 43 |
| 工具数 | 10/20 | 17/20 (85%) | 20 |
| CLI 命令 | 4/22 | 12/22 (55%) | 22 |
| Provider 协议 | 3/5 | 3/5 (60%) | 5 |
| 测试文件 | 3 | 12+ | 45+ |

**仍不包含的模块**（共 5 个，非核心差距）：
- `account` — 账号系统（依赖云端服务）
- `acp` — Agent Client Protocol（高级协议）
- `control-plane` — 控制平面（多 workspace 管理）
- `v2` — v2 迁移（历史兼容）
- `ide` — IDE 集成（VS Code 扩展等）

---

## 执行顺序依赖

```
Iter 1-2:  auth ──────────────────┐
Iter 3-4:  installation ──────────┤
Iter 5-6:  tools (上) ───────────┤
Iter 7-8:  tools (下) ───────────┤  (可并行)
Iter 9-10: CLI (上) ─────────────┤
Iter 11-12: CLI (下) ────────────┘
Iter 13-14: patch + reference ───┐
Iter 15-16: image + id ──────────┤  (可并行)
Iter 17-18: tests ───────────────┤
Iter 19:    e2e tests ───────────┘
Iter 20:    docs + release
```

确认后我开始按此规划执行。
