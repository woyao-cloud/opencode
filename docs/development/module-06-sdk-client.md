# 模块 6 · SDK 客户端库

`packages/sdk/js` 是 opencode 的 JavaScript/TypeScript SDK，提供与 opencode 服务端通信的完整 API 封装。

## 6.1 目录结构

```text
packages/sdk/js/src/
├── index.ts            # 包入口
├── client.ts           # 客户端创建与配置
├── v2/
│   ├── gen/
│   │   └── sdk.gen.ts  # 自动生成的 API 客户端（核心文件）
│   └── client.ts       # V2 客户端类型
├── gen/
│   └── sdk.gen.ts      # V1 API 客户端（旧版）
├── error-interceptor.ts # 错误拦截器
└── ...
```

## 6.2 自动生成的 API 客户端

`sdk.gen.ts` 是从 OpenAPI 规范自动生成的 TypeScript 客户端。它是 SDK 最核心的文件。

### 生成方式

运行 `./script/generate.ts` 从 opencode 服务端的 OpenAPI 规范重新生成 SDK 代码。

### API 资源组织

SDK 将 API 按资源组织为类：

| 类 | 资源 | 主要方法 |
|------|------|---------|
| `Session2` | 会话 | `list()`、`create()`、`get()`、`update()`、`delete()`、`prompt()`、`fork()`、`summarize()`、`messages()`、`diff()` |
| `Model` | 模型 | `list()` |
| `Provider2` | 提供商 | `list()` |
| `File` | 文件 | `read()`、`write()`、`list()`、`search()` |
| `Permission` | 权限 | `reply()` |
| `Config` | 配置 | `get()`、`update()` |
| `Command` | 命令 | `list()` |
| `Agent` | Agent | `list()` |
| `Instance` | 实例 | `info()` |
| `Project` | 项目 | `info()` |
| `Tui` | TUI 控制 | `response()` |
| `Experimental` | 实验性 API | `session`、`resource`、`workspace` |

### 顶层客户端

`OpencodeClient` 是顶层客户端，聚合所有资源类：

```typescript
const client = createOpencodeClient({ baseUrl, fetch, directory })
// 使用:
client.session.prompt({ sessionID, parts, ... })
client.file.read({ path, ... })
client.config.get()
```

## 6.3 错误拦截器（`error-interceptor.ts`）

统一的错误处理层，将 HTTP 错误转换为类型化的错误对象。

## 6.4 使用 SDK 的场景

- **Web 应用**（`packages/app`）：通过 SDK 与后端通信
- **CLI**（`packages/opencode/src/cli/`）：通过 SDK 管理会话
- **外部集成**：第三方工具通过 SDK 调用 opencode API
- **GitHub Action**：`github/index.ts` 使用 SDK 进行自动化操作

## 6.5 修改 SDK 的注意事项

- **不要手动编辑 `sdk.gen.ts`**：它是自动生成的。修改 API 后应重新运行 `./script/generate.ts`
- **API 变更流程**：修改服务端路由 → 更新 OpenAPI 规范 → 运行代码生成 → 更新 SDK 消费者代码
- **错误类型**：SDK 的泛型参数 `ThrowOnError` 控制是否抛出类型化错误

---

## 本章小结

`packages/sdk/js` 是从 OpenAPI 规范自动生成的 TypeScript 客户端库。它将 opencode 的 REST API 按资源组织为类，提供类型安全的 API 调用。修改 API 时，应先改服务端，再重新生成 SDK，最后更新消费者代码。
