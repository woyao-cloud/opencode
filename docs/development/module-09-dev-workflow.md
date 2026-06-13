# 模块 9 · 开发工作流

本章覆盖日常开发中的构建、测试、调试和发布流程。

## 9.1 环境准备

### 必需工具

| 工具 | 版本要求 | 用途 |
|------|---------|------|
| **Bun** | ≥ 1.x | 运行时、包管理、构建 |
| **Git** | ≥ 2.x | 版本控制 |
| **TypeScript** | 5.x | 类型检查（通过 Bun 内置） |

### 可选工具

| 工具 | 用途 |
|------|------|
| **Biome** | 代码格式化（替代 Prettier） |
| **Ripgrep (rg)** | Grep 工具的后端 |
| **GitHub CLI (gh)** | Beta 分支管理、PR 操作 |

### 初始设置

```bash
# 克隆仓库
git clone <repo-url>
cd opencode

# 安装所有依赖
bun install

# 验证环境
bun typecheck
bun test
```

## 9.2 日常开发循环

### 修改代码后的验证步骤

```bash
# 1. 类型检查（最快，先做）
bun typecheck

# 2. 相关包的单元测试
cd packages/opencode && bun test

# 3. 构建验证
cd packages/opencode && ./script/build.ts --single

# 4. 手动测试
bun opencode run "test the new feature"
```

### 类型检查

```bash
# 全项目类型检查
bun typecheck

# 单包类型检查
cd packages/opencode && bun run tsc --noEmit
```

类型检查是最快的验证手段，应在每次修改后首先运行。

### 运行测试

```bash
# 运行所有测试
bun test

# 运行特定包的测试
cd packages/opencode && bun test

# 运行特定测试文件
cd packages/opencode && bun test test/session/prompt.test.ts

# 运行匹配模式的测试
cd packages/opencode && bun test --test-name-pattern="compaction"
```

### 构建

```bash
# 构建 opencode 核心包（单包，开发时使用）
cd packages/opencode && ./script/build.ts --single

# 构建所有包（发布前使用）
cd packages/opencode && ./script/build.ts

# 生成 SDK 客户端代码（API 变更后）
./script/generate.ts
```

## 9.3 调试技巧

### 日志调试

```bash
# 启用 DEBUG 级别日志
OPENCODE_LOG_LEVEL=DEBUG bun opencode run "test"

# 查看最近的日志文件
ls -t ~/.local/share/opencode/log/*.log | head -1
cat $(ls -t ~/.local/share/opencode/log/*.log | head -1)
```

### Trace 调试

```bash
# 启用 JSONL 事件追踪
OPENCODE_DIRECT_TRACE=1 bun opencode run "test"

# 查看最近的 Trace
cat ~/.local/share/opencode/log/direct/latest.json
```

### Heap 调试

```bash
# 自动 Heap 快照（内存 > 2GB 时触发）
OPENCODE_AUTO_HEAP_SNAPSHOT=1 bun opencode run "test"

# 查看 Heap 快照
ls ~/.local/share/opencode/log/heap-*
```

### 开发模式

```bash
# 使用开发配置文件
OPENCODE_DEV=1 bun opencode run "test"
```

## 9.4 测试编写指南

### 测试框架

opencode 使用 Bun 内置的测试框架（`bun:test`）。

### 测试文件位置

测试文件放在对应包的 `test/` 目录下，文件名格式为 `<feature>.test.ts`。

### 测试结构

```typescript
import { describe, it, expect } from "bun:test"

describe("Feature name", () => {
  it("should do something", () => {
    expect(result).toBe(expected)
  })
})
```

### HTTP 录制/回放

对于涉及外部 API 调用的测试，使用 `http-recorder` 包录制和回放 HTTP 交互：

```typescript
import { Cassette } from "@opencode-ai/http-recorder"

// 录制模式：记录真实 API 响应
// 回放模式：使用录制的响应
```

## 9.5 代码生成

### SDK 客户端生成

当修改了服务端 API 后，需要重新生成 SDK：

```bash
./script/generate.ts
```

这会更新 `packages/sdk/js/src/v2/gen/sdk.gen.ts`。

### 生成流程

1. 修改服务端路由（`packages/opencode/src/server/`）
2. 更新 OpenAPI 规范
3. 运行 `./script/generate.ts`
4. 检查生成的 SDK 代码
5. 更新 SDK 消费者代码（Web 应用、CLI 等）

## 9.6 发布流程

### 版本号更新

```bash
./script/version.ts <new-version>
```

### 构建与发布

```bash
# 1. 确保所有测试通过
bun test

# 2. 确保类型检查通过
bun typecheck

# 3. 构建所有包
cd packages/opencode && ./script/build.ts

# 4. 生成变更日志
./script/changelog.ts

# 5. 发布
./script/publish.ts
```

### Beta 分支管理

```bash
# Beta 分支自动合并（CI 中使用）
./script/beta.ts
```

## 9.7 常见问题

### 依赖安装问题

```bash
# 清理并重新安装
rm -rf node_modules bun.lock
bun install
```

### 类型检查失败

```bash
# 检查是否是生成的 SDK 文件过期
./script/generate.ts
bun typecheck
```

### 构建失败

```bash
# 检查是否是 Bun 版本问题
bun --version

# 清理构建产物
rm -rf packages/opencode/dist
cd packages/opencode && ./script/build.ts --single
```

---

## 本章小结

日常开发循环：修改代码 → `bun typecheck` → `bun test` → `./script/build.ts --single` → 手动测试。调试工具包括日志（`OPENCODE_LOG_LEVEL=DEBUG`）、Trace（`OPENCODE_DIRECT_TRACE=1`）和 Heap 快照。API 变更后需重新生成 SDK。发布前需通过全项目测试和类型检查。
