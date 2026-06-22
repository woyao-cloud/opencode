# minicode 规划方案

> 目标：参照 opencode 整体架构，生成一个用于学习架构的简版实现。初始版本注重结构清晰、可读性高，不追求健壮性。工程化保持原风格：Bun + Effect-TS + TypeScript。

---

## 1. 顶层结构

monorepo 使用单 worktree（简化版，不引入根级 Bun workspace catalog，仅本地 `packages/*`）。后续可迭代为 workspace。

```
minicode/
├── package.json                # 根包，scripts 聚合
├── tsconfig.json               # 引用 @tsconfig/bun
├── README.md                   # 使用说明 + 架构导览
├── PLAN.md                     # 本文件
└── packages/
    ├── core/                   # @minicode/core    —— 基础类型、Schema、日志、全局路径
    ├── llm/                    # @minicode/llm     —— Provider 抽象与单协议适配
    └── opencode/               # @minicode/opencode —— 主程序（CLI/Agent/Session/Server/...）
```

每个 package 沿用 opencode 风格：
- `"type": "module"`
- `"exports": { "./*": "./src/*.ts" }`
- `package.json` 的 `scripts` 包含 `typecheck`（tsgo --noEmit）与 `test`（bun test）
- 依赖只保留最小集：`effect`、`@effect/platform-node`、`ai`（仅 opencode 包）、`zod`（如需）、`yargs`

---

## 2. 模块设计

### 2.1 `packages/core`（@minicode/core）

保留 opencode/core 中最核心的通用能力：

```
src/
├── global.ts           # Global.Path (share/state/tmp) —— 简化版，固定 ~/.minicode
├── installation/
│   └── version.ts      # 版本号常量 "0.0.1"
├── schema.ts           # 通用 Schema（NonNegativeInt、optionalOmitUndefined 等小工具）
└── util/
    ├── log.ts          # Log.create({ service }) —— 简化实现，输出到 stderr + 文件
    ├── error.ts        # NamedError 基类
    ├── slug.ts         # Slug.create
    └── opencode-process.ts # 极简 ensureProcessMetadata
```

**设计取舍**：剔除 npm、ai-sdk catalog、github-copilot、plugin loader、cross-spawn spawner、location layer、models-snapshot（2.5MB 快照）—— 这些属于 opencode 的生产化能力，对学习架构无价值。

### 2.2 `packages/llm`（@minicode/llm）

保留 LLM 抽象与**单一**协议（openai-chat）作为可运行示例：

```
src/
├── index.ts                    # 导出 Llm、Provider 接口
├── llm.ts                      # Llm.stream / Llm.generate —— Effect 包装的 AI SDK 调用
├── provider.ts                 # ProviderID / ModelID Schema brand
├── tool.ts                     # Tool 定义 schema（简化版，仅 name/description/parameters）
├── tool-runtime.ts             # 工具调用运行时（简化版）
├── cache-policy.ts             # 简化缓存策略（可选，初版可空实现）
├── schema/
│   └── index.ts                # 消息 schema（user/assistant/tool/tool_result part）
├── protocols/
│   └── openai-chat.ts          # 仅保留 OpenAI Chat 协议
├── providers/
    ├── openai.ts               # OpenAI provider
│   └── openai-compatible.ts    # OpenAI 兼容 provider（Ollama 等）
```

**设计取舍**：剔除 anthropic-messages、bedrock-converse、gemini、openai-responses、openai-compatible-chat 等协议；剔除 route 子目录（路由层在 opencode 中复杂度高，初版用静态映射）。

### 2.3 `packages/opencode`（@minicode/opencode）

主程序。按用户要求保留 17 个子模块，其他按需精简：

#### 保留的子模块（17 个）

| 模块 | 职责 | 简化策略 |
|---|---|---|
| `agent` | Agent 定义与服务 | 保留 Service/Info schema，内置 1 个默认 agent "build" |
| `bus` | 事件总线（PubSub） | 保留 InstanceState + PubSub，剔除 GlobalBus 跨进程转发 |
| `cli` | CLI 入口 | yargs 单命令 `run` + `serve`，剔除 TUI |
| `command` | 命令模板 | 保留极简 index.ts |
| `config` | 配置加载 | 保留 config.ts + agent.ts + provider.ts，剔除 mcp/lsp/plugin/markdown 等细分 |
| `effect` | Effect 运行时工具 | 保留 instance-state.ts、run-service.ts、bridge.ts、app-runtime.ts |
| `env` | 环境变量 | 保留 index.ts |
| `file` | 文件操作 | 保留 index.ts（读写）+ glob.ts，剔除 ripgrep/watcher/ignore |
| `git` | Git 操作 | 保留 index.ts 极简版（分支/状态） |
| `permission` | 权限规则 | 保留 index.ts + schema.ts，剔除 arity 复杂评估 |
| `plugin` | 插件加载 | 保留 index.ts 框架，loader 返回空数组 |
| `project` | 项目实例 | 保留 project.ts + instance-context.ts + bootstrap.ts，剔除 vcs/store |
| `server` | HTTP Server | 保留 server.ts + 单个 session 路由，剔除 mdns/auth/cors |
| `session` | 会话管理 | 保留 session.ts + message.ts + schema.ts + session.sql.ts，剔除 compaction/retry/revert/processor |
| `tool` | 工具注册 | 保留 registry.ts + tool.ts + 3 个基础工具：read.ts、write.ts、bash.ts（用 cross-spawn 或 Bun.spawn） |
| `skill` | Skill 发现 | 保留 index.ts 骨架，discovery 返回空 |
| `worktree` | Git worktree | 保留 index.ts 极简版（仅 create/list） |

#### 剔除的子模块

`account`、`acp`、`auth`（合并到 config）、`background`、`control-plane`、`format`、`id`（内联到 core）、`ide`、`image`、`installation`（合并到 core）、`lsp`、`mcp`、`patch`、`pty`、`question`、`reference`、`share`、`shell`（合并到 tool）、`snapshot`、`storage`（用 Bun.file 直接 JSON）、`sync`、`util`、`v2`、`provider`（合并到 llm 包的 provider 接口）

> **注**：`provider` 在原 opencode 中是独立子模块，但本质是 llm provider 的本地配置层。minicode 中将其合并到 `@minicode/llm` 包，opencode 子模块仅保留对 llm 包的引用，避免循环依赖。

#### 目录结构

```
packages/opencode/src/
├── index.ts              # CLI 入口（yargs）
├── agent/
│   ├── agent.ts          # Service + Info schema + 默认 agent
│   └── prompt/
│       └── build.txt     # 默认 agent 的 system prompt
├── bus/
│   ├── index.ts          # Service + PubSub layer
│   ├── bus-event.ts      # BusEvent.define
│   └── global.ts         # 极简 GlobalBus（可选）
├── cli/
│   ├── bootstrap.ts      # CLI 启动
│   ├── ui.ts             # logo + 基础样式
│   └── cmd/
│       ├── run.ts        # minicode run —— 交互式 prompt
│       └── serve.ts      # minicode serve —— HTTP server
├── command/
│   └── index.ts          # 命令模板骨架
├── config/
│   ├── config.ts         # Config Service + 加载
│   ├── agent.ts          # agent 配置 schema
│   └── provider.ts       # provider 配置 schema
├── effect/
│   ├── app-runtime.ts    # 顶层 Runtime
│   ├── instance-state.ts # ScopedCache per-directory
│   ├── run-service.ts    # makeRuntime
│   └── bridge.ts         # EffectBridge for native callbacks
├── env/
│   └── index.ts          # env 常量
├── file/
│   └── index.ts          # read/write/glob
├── git/
│   └── index.ts          # branch/status
├── permission/
│   ├── index.ts          # Service + 评估
│   └── schema.ts         # Ruleset schema
├── plugin/
│   └── index.ts          # Service 骨架，loader 返回空
├── project/
│   ├── project.ts        # Service + instance
│   ├── instance-context.ts
│   └── bootstrap.ts      # 启动所有 Service layer
├── server/
│   ├── server.ts         # listen() + HttpServer
│   └── routes/
│       └── session.ts    # 单路由：POST /session 建会话
├── session/
│   ├── session.ts        # Service（create/list/get）
│   ├── message.ts        # 消息追加
│   ├── schema.ts         # SessionID/MessageID
│   └── session.sql.ts    # Drizzle schema（可选，初版用 JSON 文件）
├── tool/
│   ├── registry.ts       # 工具注册表
│   ├── tool.ts           # Tool 接口
│   ├── read.ts           # read 工具
│   ├── write.ts          # write 工具
│   └── bash.ts           # bash 工具（Bun.spawn）
├── skill/
│   └── index.ts          # Service 骨架
└── worktree/
    └── index.ts          # 极简 worktree
```

---

## 3. 依赖关系

```
@minicode/opencode ──→ @minicode/llm ──→ @minicode/core
                  └────────────────────→ @minicode/core
```

- `core`：无外部依赖（仅 effect）
- `llm`：依赖 core + `ai`（ai-sdk）
- `opencode`：依赖 core + llm + `effect`、`@effect/platform-node`、`yargs`、`drizzle-orm`（可选）

---

## 4. Effect 使用规范（遵循原 opencode AGENTS.md）

- `Context.Service` + `Layer.effect` 模式
- `Effect.fn("Domain.method")` 用于命名追踪
- `InstanceState` 用于 per-directory 状态
- `makeRuntime` 返回 `{ runPromise, runFork, runCallback }`
- 文件底部 `export * as Foo from "."` 自导出
- 禁止 `export namespace`、禁止 `as any`、禁止 `try/catch` 空块

---

## 5. 日志策略

- `core/util/log.ts` 提供 `Log.create({ service })` 返回 `{ info, warn, error, debug }`
- 输出到 stderr（不干扰 stdout 的 TUI/JSON 输出）
- 同时写入 `~/.minicode/log/minicode.log`（按日切割，简化实现）
- 每个模块顶层 `const log = Log.create({ service: "xxx" })`
- 关键节点打日志：Service init、Bus publish/subscribe、Session create/message、Tool execute、LLM stream start/complete

---

## 6. 功能范围（初始版本）

### 6.1 可运行功能

1. `minicode run` —— 启动一次会话，读取 stdin prompt，调用 LLM，输出响应
2. `minicode run --interactive` —— 简易 REPL（按行读取）
3. `minicode serve` —— 启动 HTTP server，提供 `POST /session` 建会话、`POST /session/:id/message` 发消息、`GET /session/:id` 获取消息
4. 工具调用：`read`、`write`、`bash` 三个基础工具
5. 事件总线：会话内事件 publish/subscribe

### 6.2 暂不实现

- TUI（opencode 的 TUI 极复杂，232 文件）
- MCP 协议
- ACP（Agent Client Protocol）
- Share/Sync/Cloud
- Compaction/Retry/Revert
- Snapshot
- 多 Provider 路由
- Plugin 动态加载

---

## 7. 工程化

### 7.1 根 package.json

```json
{
  "name": "minicode",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run packages/opencode/src/index.ts",
    "typecheck": "bun run --filter '*' typecheck",
    "test": "bun run --filter '*' test"
  }
}
```

### 7.2 各包 package.json

- `@minicode/core`：依赖 `effect`
- `@minicode/llm`：依赖 `effect`、`@minicode/core`、`ai`
- `@minicode/opencode`：依赖 `effect`、`@effect/platform-node`、`@minicode/core`、`@minicode/llm`、`yargs`

### 7.3 tsconfig

继承 `@tsconfig/bun`，各包独立 `tsgo --noEmit`。

### 7.4 bin

`packages/opencode/package.json`:
```json
"bin": { "minicode": "./bin/minicode" }
```
`bin/minicode`:
```sh
#!/usr/bin/env bun
import "../src/index.ts"
```

---

## 8. 验证计划

1. `bun install` 成功
2. `bun typecheck` 三个包均 0 error
3. `minicode --help` 输出帮助
4. `minicode run -p "hello"` 能调用 OpenAI 并返回（需 OPENAI_API_KEY）
5. `minicode serve` 启动后 `curl POST /session` 返回 session id
6. 日志文件 `~/.minicode/log/minicode.log` 有内容

---

## 9. 实施步骤（待确认后执行）

1. **阶段 1：脚手架**（单次执行）
   - 创建 minicode/ 目录结构
   - 根 package.json + tsconfig
   - 三个 packages 的 package.json + tsconfig

2. **阶段 2：core 包**（单次执行）
   - global.ts、schema.ts、util/log.ts、util/error.ts、util/slug.ts、installation/version.ts

3. **阶段 3：llm 包**（单次执行）
   - provider.ts、schema/index.ts、tool.ts、tool-runtime.ts
   - protocols/openai-chat.ts、providers/openai.ts
   - llm.ts、index.ts

4. **阶段 4：opencode 基础层**（单次执行）
   - env、effect、config、permission、plugin、skill 骨架
   - bus、file、git、worktree

5. **阶段 5：opencode 核心层**（单次执行）
   - agent、session、tool（registry + 3 工具）、project、command

6. **阶段 6：opencode 入口层**（单次执行）
   - cli（bootstrap + run + serve）、server、index.ts

7. **阶段 7：验证**
   - typecheck、运行测试、日志检查

---

## 10. 已确认决策

1. **Provider**：OpenAI + OpenAI-Compatible（支持本地 Ollama 等）
2. **存储**：SQLite + Drizzle（贴近原架构）
3. **bin**：`minicode`
4. **TUI**：完全剔除
5. **测试**：包含核心模块测试（core/llm/bus/session 关键路径）