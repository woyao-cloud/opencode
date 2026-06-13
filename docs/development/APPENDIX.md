# 附录 · 文件索引 / 命令速查 / 常见问题

## A. 关键文件索引

### 核心流程文件

| 文件路径 | 功能 | 修改频率 |
|---------|------|---------|
| `packages/opencode/src/cli/cmd/run.ts` | CLI run 命令完整实现 | 高 |
| `packages/opencode/src/session/prompt.ts` | Prompt 处理入口 | 高 |
| `packages/opencode/src/session/processor.ts` | 事件→Part 转换 | 高 |
| `packages/opencode/src/session/instruction.ts` | 指令文件加载 | 中 |
| `packages/opencode/src/session/message-v2.ts` | 消息/Part Schema | 中 |
| `packages/opencode/src/session/compaction.ts` | 上下文压缩 | 中 |
| `packages/opencode/src/provider/transform.ts` | 消息转换管道 | 中 |
| `packages/opencode/src/provider/provider.ts` | Provider/Model 管理 | 中 |
| `packages/llm/src/tool.ts` | 工具抽象定义 | 低 |
| `packages/llm/src/tool-runtime.ts` | 工具运行时调度 | 中 |
| `packages/llm/src/protocols/anthropic-messages.ts` | Anthropic 协议适配 | 中 |
| `packages/llm/src/protocols/openai-compatible-chat.ts` | OpenAI 协议适配 | 中 |
| `packages/core/src/session-event.ts` | 事件类型定义 | 中 |
| `packages/core/src/session-message.ts` | 消息 Schema | 低 |
| `packages/core/src/util/log.ts` | 日志系统 | 低 |

### 工具实现文件

| 文件路径 | 工具 |
|---------|------|
| `packages/opencode/src/tool/bash.ts` | Bash |
| `packages/opencode/src/tool/read.ts` | Read |
| `packages/opencode/src/tool/write.ts` | Write |
| `packages/opencode/src/tool/edit.ts` | Edit |
| `packages/opencode/src/tool/apply-patch.ts` | ApplyPatch |
| `packages/opencode/src/tool/glob.ts` | Glob |
| `packages/opencode/src/tool/grep.ts` | Grep |
| `packages/opencode/src/tool/task.ts` | Task |
| `packages/opencode/src/tool/question.ts` | Question |
| `packages/opencode/src/tool/todo.ts` | TodoWrite |
| `packages/opencode/src/tool/webfetch.ts` | WebFetch |
| `packages/opencode/src/tool/websearch.ts` | WebSearch |
| `packages/opencode/src/tool/lsp.ts` | Lsp |
| `packages/opencode/src/tool/skill.ts` | Skill |
| `packages/opencode/src/tool/truncate.ts` | 截断逻辑 |
| `packages/opencode/src/cli/cmd/run/tool.ts` | 工具 UI 渲染规则 |

### 配置与 Agent 文件

| 文件路径 | 功能 |
|---------|------|
| `.opencode/opencode.jsonc` | 项目配置 |
| `.opencode/agent/` | 项目自定义 Agent |
| `.opencode/command/` | 项目自定义命令 |
| `.opencode/skill/` | 项目自定义 Skill |
| `.opencode/tool/` | 项目自定义工具 |
| `.opencode/plugin/` | 项目插件 |
| `~/.config/opencode/config.json` | 全局配置 |
| `~/.config/opencode/agents/` | 全局自定义 Agent |
| `~/.claude/CLAUDE.md` | 全局指令文件 |

## B. 命令速查

### 开发命令

```bash
# 类型检查
bun typecheck                          # 全项目
cd packages/<name> && bun run tsc --noEmit  # 单包

# 测试
bun test                               # 全项目
cd packages/<name> && bun test         # 单包
cd packages/<name> && bun test --test-name-pattern="pattern"  # 匹配

# 构建
cd packages/opencode && ./script/build.ts --single  # 单包构建
cd packages/opencode && ./script/build.ts           # 全量构建
./script/generate.ts                                # 生成 SDK

# 格式化
./script/format.ts

# 版本
./script/version.ts <new-version>
./script/changelog.ts
```

### 调试命令

```bash
# 日志
OPENCODE_LOG_LEVEL=DEBUG bun opencode run "test"

# Trace
OPENCODE_DIRECT_TRACE=1 bun opencode run "test"

# Heap
OPENCODE_AUTO_HEAP_SNAPSHOT=1 bun opencode run "test"

# 开发模式
OPENCODE_DEV=1 bun opencode run "test"
```

### opencode CLI 命令

```bash
bun opencode run "message"             # 发送消息
bun opencode run --model "provider/model" "message"  # 指定模型
bun opencode run --agent "name" "message"  # 指定 Agent
bun opencode run --continue            # 继续最近会话
bun opencode run --session <id>        # 恢复指定会话
bun opencode run --fork                # Fork 会话
bun opencode agent create              # 创建 Agent
bun opencode agent list                # 列出 Agent
```

## C. 常见问题

### Q: 如何添加一个新的 LLM Provider？

1. 在 `packages/llm/src/providers/` 下创建新文件
2. 定义 Provider（`Provider.make()`）和 Model 工厂函数
3. 如果使用新协议，在 `packages/llm/src/protocols/` 下创建适配器
4. 在 `packages/llm/src/index.ts` 中导出
5. 在 `packages/opencode/src/provider/provider.ts` 中注册

### Q: 如何添加一个新工具？

1. 在 `packages/opencode/src/tool/` 下创建新文件
2. 使用 `Tool.make()` 定义工具（Schema + execute）
3. 在 `tool/registry.ts` 中注册
4. 在 `cli/cmd/run/tool.ts` 的 `TOOL_RULES` 中添加 UI 渲染规则

### Q: 如何添加一个新的 CLI 命令？

1. 在 `packages/opencode/src/cli/cmd/` 下创建新文件
2. 使用 `effectCmd()` 或 `cmd()` 定义命令
3. 在上级命令的 `builder` 中注册

### Q: 如何修改 System Prompt？

- 修改内置 Agent 的 System Prompt：编辑 `packages/opencode/src/agent/` 下的 Agent 定义
- 添加项目级指令：编辑 `.opencode/AGENTS.md` 或 `.opencode/agent/` 下的 Agent 定义
- 添加全局指令：编辑 `~/.claude/CLAUDE.md`

### Q: SDK 代码变更后如何同步？

运行 `./script/generate.ts` 重新生成 SDK 客户端代码。

### Q: 测试中如何避免真实 API 调用？

使用 `http-recorder` 包录制和回放 HTTP 交互。录制一次真实响应，后续测试使用回放。

### Q: 如何调试流式事件顺序问题？

启用 Trace：`OPENCODE_DIRECT_TRACE=1 bun opencode run "test"`，查看生成的 JSONL 文件中的事件时间线。

---

## 附录小结

本附录提供了关键文件索引（按修改频率分类）、常用命令速查（开发/调试/CLI）和常见问题解答。在日常开发中，文件索引帮助快速定位需要修改的代码，命令速查帮助快速执行常见操作。
