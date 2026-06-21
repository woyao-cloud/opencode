# @opencode/Installation — 安装方式服务
> 婧愭枃浠? `opencode/packages/opencode/src/installation/index.ts`

## 概述

`@opencode/Installation` 是 OpenCode 的**安装方式检测与升级管理服务**，负责识别当前 OpenCode 的安装方法（npm、brew、curl 等），查询各包管理器的最新版本，以及执行升级操作。它支持 7 种安装方式的检测和升级，是自动更新功能的核心支撑。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `HttpClient` | `effect/unstable/http` | HTTP 客户端，查询各包管理器和 GitHub 的版本 API |
| `AppProcess` | `@opencode-ai/core/process` | 进程管理，执行子进程（npm、brew、git 等命令） |

```typescript
// index.ts layer 定义
export const layer: Layer.Layer<Service, never, HttpClient.HttpClient | AppProcess.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient       // HTTP 请求
    const appProcess = yield* AppProcess.Service     // 子进程执行
    // ...
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(FetchHttpClient.layer), Layer.provide(AppProcess.defaultLayer))
```

## 核心接口

```typescript
export type Method = "curl" | "npm" | "yarn" | "pnpm" | "bun" | "brew" | "scoop" | "choco" | "unknown"

export type ReleaseType = "patch" | "minor" | "major"

export interface Interface {
  readonly info: () => Effect.Effect<Info>
  readonly method: () => Effect.Effect<Method>
  readonly latest: (method?: Method) => Effect.Effect<string>
  readonly upgrade: (method: Method, target: string) => Effect.Effect<void, UpgradeFailedError>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Installation") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取安装信息
const info = yield* Installation.Service.info()

// 检测安装方式
const method = yield* Installation.Service.method()

// 查询最新版本
const latest = yield* Installation.Service.latest()

// 执行升级
yield* Installation.Service.upgrade("npm", "2.0.0")
```

### 便捷函数（非 Effect 上下文）

模块还导出了可以直接在非 Effect 上下文中调用的便捷函数：

```typescript
export const latest = (...args: Parameters<Interface["latest"]>) => runPromise((s) => s.latest(...args))
export const method = () => runPromise((s) => s.method())
export const upgrade = (...args: Parameters<Interface["upgrade"]>) => runPromise((s) => s.upgrade(...args))
```

这些函数内部通过 `makeRuntime` 创建独立 Effect 运行时并执行。

## 数据结构

### Info

```typescript
export const Info = Schema.Struct({
  version: Schema.String,  // 当前版本
  latest: Schema.String,   // 最新版本
}).annotate({ identifier: "InstallationInfo" })
```

### 事件

```typescript
export const Event = {
  Updated: BusEvent.define("installation.updated", Schema.Struct({ version: Schema.String })),
  UpdateAvailable: BusEvent.define("installation.update-available", Schema.Struct({ version: Schema.String })),
}
```

### 错误类型

```typescript
export class UpgradeFailedError extends Schema.TaggedErrorClass<UpgradeFailedError>()("UpgradeFailedError", {
  stderr: Schema.String,
}) {}
```

### 版本比较

```typescript
export function getReleaseType(current: string, latest: string): ReleaseType {
  const currMajor = semver.major(current)
  const currMinor = semver.minor(current)
  const newMajor = semver.major(latest)
  const newMinor = semver.minor(latest)
  if (newMajor > currMajor) return "major"
  if (newMinor > currMinor) return "minor"
  return "patch"
}
```

### User Agent

```typescript
export function userAgent(client = "cli") {
  return `opencode/${InstallationChannel}/${InstallationVersion}/${client}`
}
export const USER_AGENT = userAgent()
```

### Channel 判断

```typescript
export function isPreview() {
  return InstallationChannel !== "latest"
}

export function isLocal() {
  return InstallationChannel === "local"
}
```

## 关键实现细节

### 安装方式检测

`method()` 通过以下步骤检测安装方式：

1. **路径特征检测**：检查 `process.execPath` 是否包含 `.opencode/bin` 或 `.local/bin`（curl 安装的特征）
2. **包管理器检测**：遍历 7 种包管理器，用 `process.execPath` 优化排序（execPath 中包含包管理器名称的优先检测），依次运行包管理器的 list 命令，检查输出中是否包含 `opencode` 或 `opencode-ai`
3. **兜底**：未匹配到任何已知方式时返回 `"unknown"`

```typescript
const checks: Array<{ name: Method; command: () => Effect.Effect<string> }> = [
  { name: "npm", command: () => text(["npm", "list", "-g", "--depth=0"]) },
  { name: "yarn", command: () => text(["yarn", "global", "list"]) },
  { name: "pnpm", command: () => text(["pnpm", "list", "-g", "--depth=0"]) },
  { name: "bun", command: () => text(["bun", "pm", "ls", "-g"]) },
  { name: "brew", command: () => text(["brew", "list", "--formula", "opencode"]) },
  { name: "scoop", command: () => text(["scoop", "list", "opencode"]) },
  { name: "choco", command: () => text(["choco", "list", "--limit-output", "opencode"]) },
]
```

### 版本查询

`latest()` 按安装方式查询对应源的最新版本：

| 安装方式 | 查询源 | API |
|----------|--------|-----|
| `brew` | Homebrew API 或本地 `brew info --json` | `https://formulae.brew.sh/api/formula/opencode.json` |
| `npm` / `bun` / `pnpm` | npm registry | `<registry>/opencode-ai/<channel>` |
| `choco` | Chocolatey OData API | `community.chocolatey.org/api/v2/Packages` |
| `scoop` | Scoop Main bucket manifest | `raw.githubusercontent.com/ScoopInstaller/Main/master/bucket/opencode.json` |
| 其他（curl 等） | GitHub Releases API | `api.github.com/repos/anomalyco/opencode/releases/latest` |

### 升级执行

`upgrade()` 按安装方式执行对应的升级命令：

| 安装方式 | 升级命令 |
|----------|----------|
| `curl` | 下载 `https://opencode.ai/install` 脚本，通过 bash 执行（传入 `VERSION` 环境变量） |
| `npm` | `npm install -g opencode-ai@<version>` |
| `pnpm` | `pnpm install -g opencode-ai@<version>` |
| `bun` | `bun install -g opencode-ai@<version>` |
| `brew` | 先 `brew tap anomalco/tap`（如需要），再 `git pull` 更新 tap，最后 `brew upgrade` |
| `choco` | `choco upgrade opencode --version=<version> -y` |
| `scoop` | `scoop install opencode@<version>` |

### 子进程执行

提供两个子进程执行辅助函数：

- **`text`**：执行命令并返回 stdout 字符串，失败时返回空字符串
- **`run`**：执行命令并返回 `{ code, stdout, stderr }`，失败时返回 `{ code: 1, stdout: "", stderr: errorMessage }`

### Brew Tap 处理

`getBrewFormula()` 检测是使用 `anomalyco/tap/opencode`（第三方 tap）还是 `opencode`（core formula），升级时分别处理：

```typescript
const getBrewFormula = Effect.fnUntraced(function* () {
  const tapFormula = yield* text(["brew", "list", "--formula", "anomalyco/tap/opencode"])
  if (tapFormula.includes("opencode")) return "anomalyco/tap/opencode"
  const coreFormula = yield* text(["brew", "list", "--formula", "opencode"])
  if (coreFormula.includes("opencode")) return "opencode"
  return "opencode"
})
```

### HTTP 重试

所有 HTTP 请求使用 `withTransientReadRetry` 包装，自动重试瞬时网络错误。

## 关键设计决策

1. **多源版本查询**：根据安装方式选择不同的版本查询源（npm registry、Homebrew API、GitHub Releases 等），确保查询的是用户实际安装渠道的版本

2. **安装方式自动检测**：通过 `process.execPath` 特征和包管理器 list 命令双重检测，`execPath` 匹配优先排序减少不必要的命令执行

3. **brew 双轨支持**：同时支持 Homebrew core formula 和第三方 tap（`anomalyco/tap`），升级时自动识别并走对应路径

4. **curl 升级的脚本模式**：从 `opencode.ai/install` 下载安装脚本并通过 bash 执行，与初始安装流程一致

5. **容错子进程**：`text` 和 `run` 函数内置错误捕获，失败时返回安全默认值而非抛出异常，避免安装方式检测因单个包管理器不可用而整体失败

6. **便捷函数导出**：通过 `makeRuntime` 创建独立 Effect 运行时，导出 `latest()`、`method()`、`upgrade()` 便捷函数，允许在非 Effect 上下文中直接调用

7. **GitHub Releases 作为兜底**：未匹配到具体包管理器时使用 GitHub Releases API 查询版本，确保总能获取到最新版本信息
