# 模块 8 · 配置体系与 .opencode 目录

opencode 的配置体系采用多层叠加模式，从全局到项目到会话，每层可以覆盖上层的设置。`.opencode/` 目录是项目级配置的载体。

## 8.1 配置层级

配置按优先级从低到高：

```text
全局配置 (~/.config/opencode/config.json)
    ↓ 覆盖
项目配置 (.opencode/opencode.jsonc)
    ↓ 覆盖
环境变量 (OPENCODE_*)
    ↓ 覆盖
命令行参数 (--model, --agent, etc.)
    ↓ 覆盖
Session 级别设置
```

高优先级设置覆盖低优先级设置。未设置的字段继承下层值。

## 8.2 .opencode 目录结构

```text
.opencode/
├── opencode.jsonc        # 项目配置文件（JSONC 格式，支持注释）
├── env.d.ts              # 环境变量类型声明
├── tui.json              # TUI 终端界面配置
├── .gitignore            # opencode 自身的 gitignore
├── agent/                # 项目自定义 Agent 定义
│   ├── duplicate-pr.md   # 重复 PR 检测 Agent
│   └── triage.md         # Issue 分类 Agent
├── command/              # 项目自定义斜杠命令
│   ├── ai-deps.md        # AI 依赖分析命令
│   ├── changelog.md      # 变更日志生成命令
│   ├── commit.md         # 智能提交命令
│   ├── issues.md         # Issue 管理命令
│   ├── learn.md          # 学习命令
│   ├── rmslop.md         # 清理 AI 冗余内容命令
│   ├── spellcheck.md     # 拼写检查命令
│   └── translate.md      # 翻译命令
├── skill/                # 项目自定义 Skill
│   ├── effect/           # Effect-TS 相关 Skill
│   └── improve-codebase-architecture/  # 架构改进 Skill
├── tool/                 # 项目自定义工具
│   ├── github-pr-search.ts  # GitHub PR 搜索工具
│   └── github-triage.ts     # GitHub Issue 分类工具
├── plugin/               # 项目插件
│   ├── smoke-theme.json  # 主题插件
│   └── tui-smoke.tsx     # TUI 测试插件
├── themes/               # 自定义主题
│   ├── .gitignore
│   └── mytheme.json
└── glossary/             # 术语表（多语言）
    ├── README.md
    ├── de.md, es.md, fr.md, ja.md, ko.md, zh-cn.md ...
    └── ... (15 种语言)
```

## 8.3 配置文件详解

### opencode.jsonc（项目配置）

JSONC 格式（支持注释和尾部逗号）。关键字段：

| 字段 | 说明 |
|------|------|
| `model` | 默认模型（providerID/modelID 格式） |
| `instructions` | 远程指令 URL 列表 |
| `share` | 共享设置（`"auto"` / `"manual"` / `"disabled"`） |
| `permission` | 默认权限规则 |
| `theme` | TUI 主题配置 |
| `plugins` | 启用的插件列表 |
| `env` | 环境变量覆盖 |

### tui.json（TUI 配置）

终端界面的外观和行为配置：主题、字体、快捷键、布局等。

### Agent 定义文件

YAML/Markdown 格式，包含：
- `description`：Agent 描述
- `mode`：`primary` / `subagent` / `all`
- `permission`：权限配置
- `model`：推荐模型
- `systemPrompt`：System Prompt 模板

### Command 定义文件

Markdown 格式，包含命令的描述和执行指令。当用户输入 `/command-name` 时，对应的 Markdown 内容被注入 AI 上下文。

### Skill 定义文件

Markdown 格式，包含 Skill 的元数据（名称、描述、触发条件）和详细操作指南。

### Tool 定义文件

TypeScript 文件，导出一个符合 `ToolDefinition` 接口的对象。

## 8.4 配置加载流程

1. **启动时**：加载全局配置（`~/.config/opencode/config.json`）
2. **进入项目时**：加载项目配置（`.opencode/opencode.jsonc`），合并到全局配置之上
3. **创建 Session 时**：应用命令行参数覆盖
4. **运行时**：Session 级别的设置（模型切换、权限变更）在内存中生效

## 8.5 添加新配置项

1. 在 `packages/opencode/src/config/config.ts` 的 Config Schema 中添加字段
2. 在配置加载逻辑中处理新字段的合并
3. 在 `.opencode/opencode.jsonc` 中添加示例
4. 更新 SDK 的 Config 类型（重新生成 `sdk.gen.ts`）

---

## 本章小结

opencode 的配置体系通过多层叠加（全局 → 项目 → 环境变量 → 命令行 → Session）实现灵活的设置管理。`.opencode/` 目录是项目级配置的载体，包含 Agent、Command、Skill、Tool、Plugin、Theme、Glossary 等子目录。理解配置层级和 `.opencode/` 目录结构是理解 opencode 可定制性的关键。
