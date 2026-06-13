# 模块 1 · monorepo 结构与构建体系

## 1.1 包总览

opencode 采用 Bun workspaces 管理的 monorepo，共 14 个包：

| 包名 | 路径 | 定位 | 主要用途 |
|------|------|------|---------|
| **opencode** | `packages/opencode` | 核心框架 | CLI、TUI、Session、Agent、Tool、Server、ACP |
| **llm** | `packages/llm` | LLM 抽象层 | Provider 路由、Tool 定义、协议适配、流式解析 |
| **core** | `packages/core` | 共享基础 | 事件类型、消息 Schema、日志、文件系统抽象 |
| **app** | `packages/app` | Web 应用 | SolidJS 前端，会话界面、文件树、设置 |
| **sdk/js** | `packages/sdk/js` | SDK 客户端 | HTTP API 封装，供外部集成使用 |
| **desktop** | `packages/desktop` | 桌面应用 | Electron 壳，内嵌 Web 应用 |
| **enterprise** | `packages/enterprise` | 企业版 | 共享会话、团队管理、认证集成 |
| **console** | `packages/console` | 管理控制台 | Workspace 管理、Provider 配置、用量统计 |
| **ui** | `packages/ui` | UI 组件库 | 共享 UI 组件（Button、Tooltip、Dialog 等） |
| **plugin** | `packages/plugin` | 插件 SDK | 供外部插件开发者使用的类型定义和工具函数 |
| **function** | `packages/function` | 函数运行时 | 沙箱化代码执行环境 |
| **http-recorder** | `packages/http-recorder` | 测试工具 | HTTP 交互录制/回放，用于测试 mock |
| **script** | `packages/script` | 构建脚本 | 跨包共享的构建和发布脚本 |
| **slack** | `packages/slack` | Slack 集成 | Slack Bot 相关功能 |
| **storybook** | `packages/storybook` | 组件文档 | UI 组件库的 Storybook 展示 |
| **web** | `packages/web` | 网站/文档 | 官网和文档站点 |

## 1.2 包依赖关系

```text
opencode ──→ llm ──→ core
    │          │
    ├──→ app ──→ ui ──→ core
    │          │
    ├──→ sdk/js (自动生成)
    │          │
    ├──→ plugin ──→ core
    │          │
    ├──→ function
    │          │
    ├──→ http-recorder (测试)
    │
    desktop ──→ app
    enterprise ──→ opencode
    console ──→ opencode + ui
    slack ──→ opencode
```

核心依赖链：`core ← llm ← opencode`。core 是最底层，不依赖任何其他包。llm 依赖 core 的类型定义。opencode 依赖 llm 和 core，是最高层。

## 1.3 Bun Workspaces 配置

`package.json` 根文件中的 `workspaces` 字段定义了 monorepo 的包范围：

```json
{
  "workspaces": [
    "packages/*",
    "packages/sdk/js",
    "packages/console/app",
    "packages/console/core",
    "packages/console/resource"
  ]
}
```

Bun 通过 workspaces 自动解析包间依赖。`bun install` 在根目录执行时，会为所有包安装依赖，并创建跨包的符号链接。

## 1.4 构建脚本体系

### 核心构建脚本

| 脚本 | 位置 | 功能 |
|------|------|------|
| `build.ts` | `packages/opencode/script/` | opencode 核心包构建：TypeScript 编译 + 二进制打包 |
| `generate.ts` | `script/` | SDK 代码生成：从 OpenAPI 规范生成 TypeScript 客户端 |
| `publish.ts` | `script/` | 发布流程：版本号更新、构建、npm 发布 |
| `format.ts` | `script/` | 代码格式化（Biome） |
| `version.ts` | `script/` | 版本号管理 |
| `changelog.ts` | `script/` | 变更日志生成 |
| `stats.ts` | `script/` | 项目统计信息 |
| `beta.ts` | `script/` | Beta 分支自动合并流程 |

### 常用构建命令

```bash
# 全项目类型检查
bun typecheck

# 构建 opencode 核心包（单包模式）
cd packages/opencode && ./script/build.ts --single

# 构建所有包
cd packages/opencode && ./script/build.ts

# 生成 SDK 客户端代码
./script/generate.ts

# 代码格式化
./script/format.ts

# 运行单个包的测试
cd packages/opencode && bun test

# 运行全项目测试
bun test
```

## 1.5 版本管理

项目使用统一的版本号（当前为 v1.15.x）。版本号存储在根 `package.json` 和各子包的 `package.json` 中。`script/version.ts` 负责在发布时同步更新所有包的版本号。

## 1.6 包内部结构约定

大多数包遵循以下内部结构：

```text
packages/<name>/
├── package.json          # 包元数据、依赖、脚本
├── tsconfig.json         # TypeScript 配置
├── src/                  # 源代码
│   ├── index.ts          # 包入口（导出公共 API）
│   └── ...               # 按功能组织的子目录
├── script/               # 包专属构建脚本
│   └── build.ts
├── test/                 # 测试文件
│   └── ...
└── README.md             # 包级别文档
```

---

## 本章小结

opencode 的 monorepo 包含 14 个包，以 `core → llm → opencode` 为核心依赖链。Bun workspaces 管理包间依赖，构建脚本体系覆盖编译、测试、代码生成和发布。理解包之间的依赖关系是理解项目架构的第一步。
