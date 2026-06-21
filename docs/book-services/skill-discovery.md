# @opencode/SkillDiscovery — 远程技能发现服务

## 概述

`@opencode/SkillDiscovery` 是 OpenCode 的**远程技能仓库拉取服务**，负责从远程 URL 下载技能包（skill pack）。它通过 HTTP 获取技能仓库的索引文件（`index.json`），然后并发下载每个技能的文件到本地缓存目录。

该服务被 `@opencode/Skill` 调用，用于处理配置中 `skills.urls` 指定的远程技能源。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统操作（创建目录、写入文件、检查存在） |
| `Path` | `@effect/platform-node` | 路径拼接与解析 |
| `HttpClient` | `effect/unstable/http` | HTTP 请求（获取索引和下载技能文件） |

```typescript
export const defaultLayer: Layer.Layer<Service> = layer.pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(NodePath.layer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly pull: (url: string) => Effect.Effect<string[]>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/SkillDiscovery") {}
```

### 使用示例

```typescript
// 从远程技能仓库拉取技能
const dirs = yield* Discovery.Service.pull("https://example.com/skills")
// 返回: ["/path/to/cache/skills/skill-a", "/path/to/cache/skills/skill-b"]
```

## 数据结构

| 类型 | 字段 | 说明 |
|------|------|------|
| `IndexSkill` | `name: string` | 技能名称 |
| | `files: string[]` | 技能包含的文件列表（如 `["SKILL.md", "helper.js"]`） |
| `Index` | `skills: IndexSkill[]` | 远程仓库的索引结构 |

### 缓存目录

所有下载的技能文件存储在 `Global.Path.cache/skills/` 下，按技能名称分子目录。

## 关键实现细节

### pull 流程

```
Discovery.pull(url)
  ├── 1. 构建索引 URL: {url}/index.json
  ├── 2. HTTP GET 获取索引，解析为 Index schema
  ├── 3. 过滤：只保留 files 中包含 "SKILL.md" 的技能条目
  ├── 4. 并发下载每个技能的文件（并发度 4 个技能）
  │     └── 每个技能内并发下载文件（并发度 8 个文件）
  │     └── 下载目标: {cache}/skills/{skillName}/{fileName}
  ├── 5. 验证：只返回 SKILL.md 成功下载且存在的目录
  └── 6. 返回有效的技能目录列表
```

### 下载缓存策略

```typescript
const download = Effect.fn("Discovery.download")(function* (url: string, dest: string) {
  if (yield* fs.exists(dest).pipe(Effect.orDie)) return true  // 已缓存则跳过
  // ... HTTP 下载逻辑
})
```

下载前先检查本地文件是否已存在，已存在则跳过下载，实现简单的文件级缓存。

### 并发控制

- **技能级并发**：`skillConcurrency = 4`，同时处理 4 个技能
- **文件级并发**：`fileConcurrency = 8`，每个技能内同时下载 8 个文件

### 错误处理

- 索引获取失败 → 返回空数组（记录错误日志）
- 单个文件下载失败 → 跳过该文件（记录错误日志），不影响其他文件
- 技能缺少 SKILL.md → 警告日志，过滤掉该技能条目

## 关键设计决策

1. **索引驱动的批量下载**：使用 `index.json` 作为技能清单，一次性获取所有技能信息后再批量下载，避免逐个探测

2. **两级并发控制**：技能级和文件级分别设置并发上限，平衡下载速度与资源消耗

3. **基于文件存在的简单缓存**：不维护缓存元数据或 TTL，仅通过文件存在性判断是否需要重新下载。如需更新，用户需手动清理缓存目录

4. **SKILL.md 强制要求**：只处理包含 `SKILL.md` 的技能条目，没有 SKILL.md 的技能被视为无效并被过滤

5. **独立服务拆分**：将远程拉取逻辑从 Skill 主服务中拆分为独立的 `Discovery` 服务，职责单一，便于测试和维护
