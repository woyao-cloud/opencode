# OpenCode 项目调试指南

## 1. 调试工具全景

OpenCode 提供了多层次的调试手段，按使用场景排序：

| 手段 | 适用场景 | 复杂度 |
|------|----------|--------|
| `opencode debug info` | 查看环境信息 | ★☆☆ |
| `opencode debug paths` | 查看数据/日志路径 | ★☆☆ |
| `opencode debug wait` | 保持进程不退出（attach debugger） | ★★☆ |
| `opencode debug agent` | 测试特定 Agent 的工具执行 | ★★☆ |
| `opencode debug lsp diagnostics` | LSP 诊断调试 | ★★☆ |
| `opencode debug snapshot` | 快照/差异分析 | ★★☆ |
| 结构化日志 (Log system) | 追踪服务调用链 | ★★☆ |
| `bun test --inspect` | 单步调试测试 | ★★★ |
| Effect 追踪 (Effect.fn) | 追踪 Effect 调用栈 | ★★★ |
| `opencode debug config` | 查看运行时配置 | ★☆☆ |

---

## 2. 日志系统调试

### 2.1 日志架构

项目使用 `@opencode-ai/core/util/log` 模块实现结构化日志（`packages/core/src/util/log.ts`）：

```
日志级别: DEBUG < INFO < WARN < ERROR
日志输出:
  ├── 文件: ~/.local/share/opencode/log/<timestamp>.log (生产)
  └── 文件: ~/.local/share/opencode/log/dev.log (开发模式)
      或 stderr (--print-logs 标志)
```

### 2.2 启用详细日志

```bash
# 打印日志到 stderr（实时查看）
opencode run --print-logs

# 设置日志级别
opencode run --print-logs --log-level DEBUG

# 开发模式下日志写入 dev.log（不按时间分割）
opencode run
```

### 2.3 日志格式

```
DEBUG service=llm providerID=anthropic modelID=claude-sonnet-4-20250514 session.id=ses_xxx stream
INFO  service=session.processor session.id=ses_xxx messageID=msg_xxx process
ERROR service=llm providerID=openai modelID=gpt-4o stream error error=APICallError: 429 Too Many Requests
```

每条日志包含：
- 时间戳 (`2026-06-15T12:00:00`)
- 相对时间 (`+123ms` — 从上一条日志的增量)
- 标签 (`service=xx key=value`)
- 消息正文

### 2.4 关键服务 Logger 标识

| Logger Tag (`service=`) | 文件 | 追踪内容 |
|-------------------------|------|----------|
| `service=llm` | `session/llm.ts` | LLM 流调用、提供商、模型 |
| `service=session.processor` | `session/processor.ts` | 会话处理、工具调用、事件 |
| `service=session` | `session/session.ts` | 会话 CRUD |
| `service=plugin` | `plugin/` | 插件加载/触发 |
| `service=mcp` | `mcp/` | MCP 连接/通信 |
| `service=lsp` | `lsp/` | LSP 请求/响应 |
| `service=project` | `project/` | 项目引导/初始化 |
| `service=tool` | `tool/` | 工具执行 |

---

## 3. 内置 Debug CLI 命令

### 3.1 环境信息

```bash
# 查看版本、OS、终端、插件列表
opencode debug info

# 查看所有全局路径
opencode debug paths
# 输出示例:
# data     C:\Users\xxx\AppData\Local\opencode
# config   C:\Users\xxx\AppData\Roaming\opencode
# cache    C:\Users\xxx\AppData\Local\opencode\cache
# state    C:\Users\xxx\AppData\Local\opencode\state
# log      C:\Users\xxx\AppData\Local\opencode\log
```

### 3.2 进程保活

```bash
# 保持进程运行 24 小时（方便 attach 调试器）
opencode debug wait
```

### 3.3 Agent 调试

```bash
# 查看 Agent 配置详情
opencode debug agent <agent-name>

# 直接执行 Agent 的某个工具
opencode debug agent <agent-name> --tool read --params '{"filePath": "src/index.ts"}'

# 列出可用 Agent
opencode agent list
```

### 3.4 LSP 调试

```bash
# 获取文件诊断
opencode debug lsp diagnostics <file-path>

# 搜索工作区符号
opencode debug lsp symbols <query>

# 获取文档符号
opencode debug lsp document-symbols <file-uri>
```

### 3.5 快照调试

```bash
# 追踪当前快照状态
opencode debug snapshot track

# 查看指定快照的 patch
opencode debug snapshot patch <hash>

# 查看指定快照的 diff
opencode debug snapshot diff <hash>
```

### 3.6 配置调试

```bash
opencode debug config
# 显示当前解析后的完整配置
```

### 3.7 启动时间测量

```bash
opencode debug startup
# 输出 performance.now() 启动耗时 (ms)
```

---

## 4. 运行测试

### 4.1 测试架构

项目使用 **Bun 内置测试框架**（非 Jest/Vitest），测试文件位于 `packages/opencode/test/` 目录。

```bash
# 必须在包目录内运行测试
cd packages/opencode

# 运行所有测试
bun test

# 运行特定测试文件
bun test test/session/system.test.ts

# 模式匹配
bun test test/session/
bun test test/tool/

# 超时控制
bun test --timeout 30000

# watch 模式
bun test --watch
```

### 4.2 测试类别

| 测试目录 | 测试内容 | 文件数 | 关键文件 |
|----------|---------|--------|----------|
| `test/tool/` | 工具系统 (read/edit/grep/bash/lsp) | ~20 | `edit.test.ts`, `read.test.ts`, `registry.test.ts` |
| `test/session/` | 会话/LLM 处理 | ~5 | `system.test.ts`, `structured-output.test.ts` |
| `test/plugin/` | 插件加载/生命周期 | ~10 | `install.test.ts`, `loader-shared.test.ts` |
| `test/provider/` | 提供商集成 | ~10 | `provider.test.ts`, `transform.test.ts` |
| `test/mcp/` | MCP 协议 | ~6 | `lifecycle.test.ts`, `oauth-*.test.ts` |
| `test/project/` | 项目管理 | ~7 | `project.test.ts`, `instance.test.ts` |
| `test/storage/` | 数据库 | ~4 | `db.test.ts`, `json-migration.test.ts` |
| `test/pty/` | 终端模拟 | ~4 | `pty-shell.test.ts`, `pty-session.test.ts` |
| `test/permission/` | 权限系统 | ~3 | `next.test.ts`, `arity.test.ts` |
| `test/agent/` | Agent 系统 | ~5 | `agent.test.ts`, `plan-mode-*.test.ts` |
| `test/file/` | 文件系统 | ~7 | `index.test.ts`, `ripgrep.test.ts` |
| `test/util/` | 通用工具 | ~15 | `log.test.ts`, `glob.test.ts` |

### 4.3 类型检查

```bash
cd packages/opencode
bun typecheck    # 使用 tsgo (不是 tsc)
```

### 4.4 测试最佳实践

```
// 不需要 mock，鼓励真实集成测试
// 使用 bun:test 的 describe/it/expect

import { describe, it, expect } from "bun:test"

describe("Tool Registry", () => {
  it("should register and list tools", () => {
    // 实际测试逻辑
  })
})
```

---

## 5. 断点调试

### 5.1 使用 `--inspect` 启动 Bun

```bash
# 在包目录内
cd packages/opencode

# 使用 Bun 的 --inspect 标志启动（等待调试器附加）
bun --inspect --conditions=browser src/index.ts run

# 使用 --inspect-brk（在第一条语句暂停）
bun --inspect-brk --conditions=browser src/index.ts run

# 在特定端口启动检查器
bun --inspect=9229 --conditions=browser src/index.ts run
```

### 5.2 Chrome DevTools 调试

1. 启动：`bun --inspect-brk --conditions=browser packages/opencode/src/index.ts run`
2. Chrome 地址栏输入：`chrome://inspect`
3. 点击 "Open dedicated DevTools for Node"
4. 在 Sources 面板设置断点
5. 按继续执行

### 5.3 VS Code 调试 (无需 launch.json)

1. 在 VS Code 中打开项目根目录
2. 按 `Ctrl+Shift+P` → `Debug: JavaScript Debug Terminal`
3. 在该终端中运行：
```bash
cd packages/opencode
bun --inspect --conditions=browser src/index.ts run
```
4. 在源码中设置断点
5. 调试器会自动附加

### 5.4 VS Code launch.json (可选)

如果需要 `.vscode/launch.json`，创建一个：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug opencode run (TUI)",
      "cwd": "${workspaceFolder}/packages/opencode",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["--inspect-brk", "--conditions=browser"],
      "program": "src/index.ts",
      "args": ["run"],
      "port": 9229,
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug opencode run (one-shot)",
      "cwd": "${workspaceFolder}/packages/opencode",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["--inspect-brk", "--conditions=browser"],
      "program": "src/index.ts",
      "args": ["run", "hello world"],
      "port": 9229,
      "console": "integratedTerminal"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug current test file",
      "cwd": "${workspaceFolder}/packages/opencode",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["--inspect-brk"],
      "program": "node_modules/.bin/bun",
      "args": ["test", "${file}"],
      "port": 9229,
      "console": "integratedTerminal"
    }
  ]
}
```

---

## 6. Effect 追踪

项目广泛使用 Effect v4 的 `Effect.fn("Domain.method")` 为每个 Effect 命名，这些名称会自动用于 OpenTelemetry 追踪：

### 6.1 关键 Effect 追踪名称

| Effect 名称 | 文件位置 | 说明 |
|-------------|----------|------|
| `LLM.run` | `session/llm.ts:76` | LLM 流调用入口 |
| `SessionProcessor.create` | `session/processor.ts:106` | 创建会话处理器 |
| `SessionProcessor.process` | `session/processor.ts:721` | 处理 LLM 流 |
| `SessionProcessor.settleToolCall` | `session/processor.ts:132` | 完成工具调用 |
| `SessionProcessor.readToolCall` | `session/processor.ts:138` | 读取工具调用 |
| `SessionProcessor.updateToolCall` | `session/processor.ts:153` | 更新工具调用 |
| `SessionProcessor.completeToolCall` | `session/processor.ts:169` | 完成工具调用 |
| `SessionProcessor.failToolCall` | `session/processor.ts:195` | 失败工具调用 |
| `SessionProcessor.handleEvent` | `session/processor.ts:214` | 处理流事件 |
| `SessionProcessor.cleanup` | `session/processor.ts:632` | 清理 |
| `Cli.debug.*` | `cli/cmd/debug/*.ts` | 调试命令 |

### 6.2 启用 OpenTelemetry 追踪

在 `opencode.json` 中配置：

```json
{
  "experimental": {
    "openTelemetry": true
  }
}
```

启用后，所有 `Effect.fn` 命名的 Effect 会被自动追踪，输出 OpenTelemetry spans。

---

## 7. 常见问题场景

### 7.1 LLM 调用失败

```bash
# 1. 启用日志查看错误详情
opencode run --print-logs --log-level DEBUG

# 2. 检查提供商配置
opencode debug config

# 3. 手动测试 Agent 工具
opencode debug agent default --tool read --params '{"filePath": "test.txt"}'

# 4. 检查 providers
opencode providers list
```

### 7.2 会话数据问题

```bash
# 1. 查看会话列表
opencode session list

# 2. 查看快照状态
opencode debug snapshot track

# 3. DB 管理
opencode db

# 4. 数据路径
opencode debug paths
```

### 7.3 性能分析

```bash
# 1. 启动耗时
opencode debug startup

# 2. Log 中的时间戳 delta
# 每条日志包含从上一条到当前的时间差 (+123ms)

# 3. Logger.time API
# 代码中: using _ = Log.Default.time("operation")
# 输出: INFO  service=default operation status=started
#       INFO  service=default operation status=completed duration=1234
```

### 7.4 插件问题

```bash
# 1. 禁用所有外部插件运行
opencode run --pure

# 2. 查看已安装插件
opencode debug info
# 查看 "plugins:" 部分

# 3. 插件配置
opencode debug config

# 4. 单独管理插件
opencode plugin list
opencode plugin remove <name>
```

---

## 8. 快速参考卡片

```bash
# ─── 开发运行 ───
cd packages/opencode
bun dev                              # 启动 TUI 交互模式
bun run --conditions=browser src/index.ts run "hello"  # 单次运行

# ─── 测试 ───
cd packages/opencode
bun test                             # 运行所有测试
bun test test/tool/read.test.ts      # 运行单个测试
bun typecheck                        # 类型检查

# ─── 调试运行 ───
bun --inspect-brk --conditions=browser src/index.ts run  # 断点调试

# ─── 日志 ───
opencode run --print-logs            # 实时日志
opencode run --print-logs --log-level DEBUG  # DEBUG 级别日志

# ─── 诊断 ───
opencode debug info                  # 环境信息
opencode debug paths                 # 路径信息
opencode debug config                # 配置信息
opencode debug startup               # 启动耗时
opencode debug agent default --tool read --params '{"filePath":"test.txt"}'

# ─── Web 开发 ───
cd packages/app
bun dev                              # Web UI 开发服务器

# ─── Desktop ───
cd packages/desktop
bun dev                              # Electron 开发

# ─── LLM 测试 ───
cd packages/llm
bun test                             # LLM 模块测试
```