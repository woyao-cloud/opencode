# @opencode/Config — 配置服务
> 婧愭枃浠? `opencode/packages/opencode/src/config/config.ts`

## 概述

`@opencode/Config` 是 OpenCode 的**统一配置管理中心**，负责从多个来源加载、合并、解析并缓存运行时配置。它基于 Effect 框架实现，对外暴露为 Effect Service，被项目中几乎所有模块依赖。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统抽象，读取/写入配置文件、创建 `.gitignore` |
| `Auth` | `@opencode/Auth` | 认证服务，获取 well-known 远程配置、解析 OAuth token |
| `Account` | `@opencode/Account` | 账户服务，获取 Console 组织级远程配置和 token |
| `Env` | `@opencode/Env` | 环境变量管理，注入 `OPENCODE_CONSOLE_TOKEN` |
| `Npm` | `@opencode-ai/core/npm` | npm 包管理，后台安装 `.opencode/` 目录下的 `@opencode-ai/plugin` 依赖 |
| `EffectFlock` | `@opencode-ai/core/util/effect-flock` | 文件锁，防止并发写入配置时产生竞态 |

```typescript
// config.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service      // 文件读写
  const authSvc = yield* Auth.Service           // 认证信息
  const accountSvc = yield* Account.Service     // 账户/组织配置
  const env = yield* Env.Service                // 环境变量
  const npmSvc = yield* Npm.Service             // 依赖安装
  // ...
}))

export const defaultLayer = layer.pipe(
  Layer.provide(EffectFlock.defaultLayer),      // 文件锁
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(Env.defaultLayer),
  Layer.provide(Auth.defaultLayer),
  Layer.provide(Account.defaultLayer),
  Layer.provide(Npm.defaultLayer),
)
```

配置来源按优先级从低到高依次为：

1. 全局配置（`~/.local/share/opencode/config.json`、`opencode.json`、`opencode.jsonc`）
2. Well-known 远程配置（通过 `openauth` 认证后的 `/.well-known/opencode` 端点）
3. `OPENCODE_CONFIG` 标志指定的自定义配置文件
4. 项目级配置文件（从项目目录向上查找 `opencode.jsonc` / `opencode.json`）
5. `.opencode/` 目录下的配置文件和插件
6. `OPENCODE_CONFIG_CONTENT` 环境变量
7. Console/组织级远程配置
8. Managed 配置目录
9. **macOS 托管偏好设置（mobileconfig / MDM，最高优先级）**

## 核心接口

```typescript
export interface Interface {
  readonly get: () => Effect.Effect<Info>              // 获取当前实例的合并后配置
  readonly getGlobal: () => Effect.Effect<Info>        // 获取全局配置
  readonly getConsoleState: () => Effect.Effect<ConsoleState>
  readonly update: (config: Info) => Effect.Effect<void>   // 更新项目级配置
  readonly updateGlobal: (config: Info) => Effect.Effect<{ info: Info; changed: boolean }>
  readonly invalidate: () => Effect.Effect<void>       // 失效配置缓存
  readonly directories: () => Effect.Effect<string[]>  // 获取所有配置目录
  readonly waitForDependencies: () => Effect.Effect<void>  // 等待后台依赖安装完成
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Config") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取配置
yield* Config.Service.get()

// 更新配置
yield* Config.Service.update({ shell: "bash" })
```

## 配置数据结构 (Info)

`Info` 类型由 Effect Schema 定义，通过 `DeepMutable` 包装为可变类型。主要字段如下：

| 字段 | 类型 | 说明 |
|------|------|------|
| `$schema` | `string?` | JSON Schema 引用（自动写入 `https://opencode.ai/config.json`） |
| `shell` | `string?` | 默认 shell |
| `logLevel` | `"DEBUG" \| "INFO" \| "WARN" \| "ERROR"` | 日志级别 |
| `model` | `ConfigModelID?` | 默认模型，格式 `provider/model` |
| `small_model` | `ConfigModelID?` | 轻量模型（标题生成等） |
| `default_agent` | `string?` | 默认 agent |
| `username` | `string?` | 自定义用户名 |
| `server` | `ConfigServer.Server?` | HTTP 服务器配置 |
| `command` | `Record<string, ConfigCommand.Info>?` | 自定义命令 |
| `skills` | `ConfigSkills.Info?` | 额外技能目录 |
| `reference` | `ConfigReference.Info?` | 命名引用（`@alias`） |
| `agent` | `Record<string, ConfigAgent.Info>?` | Agent 配置 |
| `mode` | `Record<string, ConfigAgent.Info>?` | **已弃用**，自动合并到 `agent` |
| `provider` | `Record<string, ConfigProvider.Info>?` | 自定义 Provider 配置 |
| `mcp` | `Record<string, ConfigMCP.Info>?` | MCP 服务器配置 |
| `formatter` | `ConfigFormatter.Info?` | 代码格式化配置 |
| `lsp` | `ConfigLSP.Info?` | LSP 服务器配置 |
| `instructions` | `string[]?` | 额外指令文件/模式 |
| `permission` | `ConfigPermission.Info?` | 权限配置 |
| `tools` | `Record<string, boolean>?` | 工具启用/禁用（自动转为 permission） |
| `attachment` | `ConfigAttachment.Info?` | 附件处理配置 |
| `enterprise` | `{ url?: string }?` | 企业版配置 |
| `plugin` | `ConfigPlugin.Spec[]?` | 插件声明 |
| `plugin_origins` | `ConfigPlugin.Origin[]?` | 插件来源追踪（运行时派生，不持久化） |
| `compaction` | `object?` | 上下文压缩配置（auto/prune/tail_turns 等） |
| `tool_output` | `object?` | 工具输出截断阈值（max_lines/max_bytes） |
| `share` | `"manual" \| "auto" \| "disabled"` | 分享行为控制 |
| `autoshare` | `boolean?` | **已弃用**，自动转为 `share: "auto"` |
| `autoupdate` | `boolean \| "notify"` | 自动更新策略 |
| `disabled_providers` | `string[]?` | 禁用的 Provider |
| `enabled_providers` | `string[]?` | 白名单启用的 Provider |
| `watcher` | `{ ignore?: string[] }?` | 文件监控忽略规则 |
| `snapshot` | `boolean?` | 是否启用快照追踪 |
| `experimental` | `object?` | 实验性功能开关 |
| `layout` | `ConfigLayout.Layout?` | **已弃用** |

## 配置加载流程

配置加载通过 `loadInstanceState` 函数实现，核心流程如下：

```
loadInstanceState(ctx)
  ├── 1. 获取认证信息 (authSvc.all)
  ├── 2. Well-known 远程配置
  │     └── 遍历 auth 中的 wellknown 类型，请求 /.well-known/opencode
  │     └── 解析 remote_config，通过 {env:} / {file:} 变量替换
  ├── 3. 全局配置 (getGlobal)
  │     ├── config.json → opencode.json → opencode.jsonc
  │     └── 遗留 TOML 格式自动迁移
  ├── 4. OPENCODE_CONFIG 标志文件
  ├── 5. 项目级配置（向上遍历目录树）
  │     └── opencode.jsonc / opencode.json
  ├── 6. .opencode/ 目录遍历
  │     ├── 配置文件加载
  │     ├── 插件自动发现与依赖安装
  │     ├── 命令加载 (ConfigCommand.load)
  │     └── Agent 配置加载 (ConfigAgent.load)
  ├── 7. OPENCODE_CONFIG_CONTENT 环境变量
  ├── 8. Console 组织配置（远程）
  ├── 9. Managed 配置目录
  └── 10. macOS 托管偏好设置 (MDM) —— 最高优先级
```

### 合并策略

配置合并采用 `mergeDeep`（remeda）深度合并，**数组字段（如 instructions）使用 Set 去重拼接**而非直接覆盖。这使得多层配置可以叠加生效。

```typescript
function mergeConfigConcatArrays(target: Info, source: Info): Info {
  const merged = mergeConfig(target, source)
  if (target.instructions && source.instructions) {
    merged.instructions = Array.from(new Set([...target.instructions, ...source.instructions]))
  }
  return merged
}
```

### 变量替换 (ConfigVariable)

配置文本支持两种变量语法，在 `loadConfig` 阶段自动替换：

| 语法 | 说明 | 示例 |
|------|------|------|
| `{env:VAR_NAME}` | 读取环境变量 | `{env:HOME}/.ssh` |
| `{file:path}` | 读取文件内容（JSON 序列化转义） | `{file:~/token.txt}` |

`{file:}` 支持 `~/` 路径展开和相对路径解析（相对于配置文件所在目录）。

### 插件来源追踪 (ConfigPlugin)

每个插件声明都附带了**来源元数据**（`Origin`），记录：
- `spec`：插件标识符（npm 包名或 `file://` URL）
- `source`：声明该插件的配置文件路径
- `scope`：`"global"` 或 `"local"`

这确保了后续运行时能根据插件的来源做出正确的路径决策（例如 `./plugin.ts` 是相对于哪个配置文件解析的）。

去重策略：同名的 npm 包或同 URL 的本地文件只保留**最后一次出现的声明**（高优先级覆盖低优先级）。

## 配置写入

### update（项目级）

```typescript
update(config: Info): Effect.Effect<void>
```

将配置增量合并写入项目目录的 `config.json` 文件。使用 `writable()` 过滤掉运行时派生的字段（如 `plugin_origins`）。

### updateGlobal（全局）

```typescript
updateGlobal(config: Info): Effect.Effect<{ info: Info; changed: boolean }>
```

写入全局配置文件：
- `.json` 文件：JSON 深合并后序列化
- `.jsonc` 文件：使用 `jsonc-parser` 的 `modify` API 进行精确 patch，**保留用户原有的注释和格式**

## 配置解析 (ConfigParse)

### JSONC 解析

使用 `jsonc-parser` 库，支持：
- 尾随逗号
- 注释（`//` 和 `/* */`）

解析失败时提供精确的行号和列号。

### Schema 校验

使用 Effect Schema 进行类型校验：
- **顶层未知 key 检测**：通过 `topLevelExtraKeys` 对比 Schema AST 中的属性签名，发现未识别的配置键时抛出 `InvalidError`
- Schema 验证失败时生成详细的 issue 报告

## 缓存与失效

- **全局配置**：使用 `Effect.cachedInvalidateWithTTL` 缓存，TTL 为 `Duration.infinity`（手动失效前永久缓存）
- **实例配置**：通过 `InstanceState` 管理，与项目目录绑定，切换目录时自动重建
- **失效**：`invalidate()` 方法清除全局配置缓存，`updateGlobal` 写入变更后自动调用

## 依赖管理

配置加载过程中会自动在 `.opencode/` 目录安装 `@opencode-ai/plugin` 依赖：

```typescript
const dep = yield* npmSvc.install(dir, {
  add: [{ name: "@opencode-ai/plugin", version: InstallationLocal ? undefined : InstallationVersion }],
})
```

这些安装任务以 `forkDetach` 方式在后台运行，可通过 `waitForDependencies()` 等待完成。

## 遗留兼容

| 遗留项 | 处理方式 |
|--------|----------|
| TOML 格式全局配置 (`~/.local/share/opencode/config`) | 自动解析并迁移到 `config.json` |
| `theme` / `keybinds` / `tui` 字段 | 警告并删除，提示迁移到 `tui.json` |
| `mode` 字段 | 自动合并到 `agent` 字段 |
| `tools` 字段 | 自动转换为 `permission` 配置 |
| `autoshare` 字段 | 自动转为 `share: "auto"` |
| `layout` 字段 | 已弃用，始终使用 stretch 布局 |
| MCP 的 `{ enabled: false }` 形式 | 作为 `ConfigMCP.Info` 的联合类型兼容 |

## 子模块概览

| 模块 | 文件 | 功能 |
|------|------|------|
| `ConfigAgent` | `agent.ts` | Agent 配置的加载与合并 |
| `ConfigAttachment` | `attachment.ts` | 附件处理配置（图片大小限制等） |
| `ConfigCommand` | `command.ts` | 自定义命令的发现与加载 |
| `ConfigError` | `error.ts` | 配置错误类型（`JsonError`、`InvalidError`） |
| `ConfigFormatter` | `formatter.ts` | 代码格式化配置 |
| `ConfigLayout` | `layout.ts` | 布局配置（已弃用） |
| `ConfigLSP` | `lsp.ts` | LSP 服务器配置 |
| `ConfigManaged` | `managed.ts` | macOS MDM 托管配置读取 |
| `ConfigMarkdown` | `markdown.ts` | Markdown 文件解析（YAML frontmatter） |
| `ConfigMCP` | `mcp.ts` | MCP 服务器配置 |
| `ConfigModelID` | `model-id.ts` | 模型 ID 格式 `provider/model` |
| `ConfigParse` | `parse.ts` | JSONC 解析与 Schema 校验 |
| `ConfigPaths` | `paths.ts` | 配置文件和目录的发现 |
| `ConfigPermission` | `permission.ts` | 权限控制配置 |
| `ConfigPlugin` | `plugin.ts` | 插件声明、发现与去重 |
| `ConfigProvider` | `provider.ts` | AI Provider 配置 |
| `ConfigReference` | `reference.ts` | 命名引用配置 |
| `ConfigServer` | `server.ts` | HTTP 服务器配置 |
| `ConfigSkills` | `skills.ts` | 技能目录配置 |
| `ConfigVariable` | `variable.ts` | `{env:}` / `{file:}` 变量替换 |
| `ConfigPaths` | `paths.ts` | 配置文件/目录发现 |
| `ConsoleState` | `console-state.ts` | Console 状态数据结构 |

## 关键设计决策

1. **Effect Service 模式**：使用 Effect 的 `Context.Service` 实现依赖注入，所有配置访问都通过 Effect 生成器，天然支持并发、错误处理和资源管理

2. **多层合并 + 数组拼接**：配置不是简单覆盖，而是深度合并；数组字段使用 Set 去重拼接，使得全局配置和项目配置可以叠加生效

3. **插件来源追踪**：`plugin_origins` 运行时派生字段记录每个插件的来源文件和 scope，确保路径解析的准确性

4. **JSONC patch 写入**：更新 `.jsonc` 文件时使用 AST 级别的 modify API，保留用户原有的注释和格式

5. **后台依赖安装**：插件依赖以 `forkDetach` 异步安装，不阻塞配置加载流程，同时提供 `waitForDependencies` 用于需要等待完成时

6. **macOS MDM 支持**：支持读取 macOS 托管偏好设置（mobileconfig），优先级最高，适用于企业批量管理
