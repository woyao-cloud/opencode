# ch19-opencode-cases — OpenCode 实战案例剖析

本章通过五个简化但真实的案例，展示 Effect-TS 在 OpenCode 项目中的实际应用模式：

- **Runtime 架构** — 使用 `ManagedRuntime` + `Layer.mergeAll` 构建应用依赖图
- **工具系统** — 使用 `Context.Service` + `Layer.effect` 实现可插拔工具注册
- **MCP 客户端** — 使用 `Stream` + `Queue` 处理 MCP 协议消息流
- **文件监听器** — 使用 `Fiber` + `Scope` 管理文件系统监听生命周期
- **权限系统** — 使用 `Schema` + `Deferred` 实现异步审批流程

## 安装

```bash
cd docs/Effect-ts/demos/ch19-opencode-cases
bun install
```

## 运行

```bash
# 场景 1: Runtime 架构
bun run demo:runtime

# 场景 2: 工具系统
bun run demo:tool

# 场景 3: MCP 客户端
bun run demo:mcp

# 场景 4: 文件监听器
bun run demo:watcher

# 场景 5: 权限系统
bun run demo:permission
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/01-runtime-arch.ts` | ManagedRuntime + Layer.mergeAll 构建应用依赖图 |
| `src/02-tool-system.ts` | Context.Service + Layer.effect 实现工具注册 |
| `src/03-mcp-client.ts` | Stream + Queue 处理 MCP 协议消息流 |
| `src/04-file-watcher.ts` | Fiber + Scope 管理文件监听生命周期 |
| `src/05-permission-system.ts` | Schema + Deferred 实现异步审批流程 |
