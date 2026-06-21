# @opencode/MCP — MCP 协议客户端管理
> 婧愭枃浠? `opencode/packages/opencode/src/mcp/index.ts`

## 概述

`@opencode/MCP` 是 OpenCode 的 **MCP (Model Context Protocol) 客户端管理服务**，负责管理所有 MCP 服务器的连接生命周期。它支持三种传输方式（Stdio 本地进程、StreamableHTTP 远程、SSE 远程），提供 OAuth 认证流程，监听工具列表变更通知，并将 MCP 工具转换为 AI SDK 兼容的 Tool 类型。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 读取 MCP 服务器配置 |
| `McpAuth` | `@opencode/McpAuth` | MCP OAuth token 持久化 |
| `Bus` | `@opencode/Bus` | 事件总线（工具变更通知、Toast 提示、浏览器打开失败） |
| `ChildProcessSpawner` | `effect/unstable/process` | 子进程管理（本地 MCP 的 pgrep 清理） |
| `CrossSpawnSpawner` | `@opencode-ai/core/cross-spawn-spawner` | 跨平台进程生成 |
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统（间接依赖） |

```typescript
// index.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const auth = yield* McpAuth.Service
  const bus = yield* Bus.Service
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly status: () => Effect.Effect<Record<string, Status>>                          // 所有服务器状态
  readonly clients: () => Effect.Effect<Record<string, MCPClient>>                      // 所有客户端实例
  readonly tools: () => Effect.Effect<Record<string, Tool>>                             // 所有 MCP 工具（AI SDK 格式）
  readonly prompts: () => Effect.Effect<Record<string, PromptInfo & { client: string }>>
  readonly resources: () => Effect.Effect<Record<string, ResourceInfo & { client: string }>>
  readonly add: (name: string, mcp: ConfigMCP.Info) => Effect.Effect<{ status: ... }>   // 动态添加
  readonly connect: (name: string) => Effect.Effect<void>                               // 连接
  readonly disconnect: (name: string) => Effect.Effect<void>                            // 断开
  readonly getPrompt: (clientName: string, name: string, args?: Record<string, string>) =>
    Effect.Effect<...>                                                                   // 获取 Prompt
  readonly readResource: (clientName: string, resourceUri: string) => Effect.Effect<...> // 读取资源
  readonly startAuth: (mcpName: string) => Effect.Effect<{ authorizationUrl, oauthState }>
  readonly authenticate: (mcpName: string) => Effect.Effect<Status>                     // 完整认证流程
  readonly finishAuth: (mcpName: string, authorizationCode: string) => Effect.Effect<Status>
  readonly removeAuth: (mcpName: string) => Effect.Effect<void>                         // 移除认证
  readonly supportsOAuth: (mcpName: string) => Effect.Effect<boolean>
  readonly hasStoredTokens: (mcpName: string) => Effect.Effect<boolean>
  readonly getAuthStatus: (mcpName: string) => Effect.Effect<AuthStatus>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/MCP") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取所有 MCP 工具
yield* MCP.Service.tools()

// 连接 MCP 服务器
yield* MCP.Service.connect("my-server")

// 启动 OAuth 认证
yield* MCP.Service.authenticate("my-server")
```

## 连接状态

```typescript
export const Status = Schema.Union([
  StatusConnected,              // { status: "connected" }
  StatusDisabled,               // { status: "disabled" }
  StatusFailed,                 // { status: "failed", error: string }
  StatusNeedsAuth,              // { status: "needs_auth" }
  StatusNeedsClientRegistration, // { status: "needs_client_registration", error: string }
])
```

## 传输方式

### 1. 本地传输 (Stdio)

通过 `StdioClientTransport` 启动本地进程作为 MCP 服务器：

```typescript
const connectLocal = Effect.fn("MCP.connectLocal")(function* (key, mcp) {
  const [cmd, ...args] = mcp.command
  const cwd = yield* InstanceState.directory
  const transport = new StdioClientTransport({
    stderr: "pipe",
    command: cmd,
    args,
    cwd,
    env: {
      ...process.env,
      ...(cmd === "opencode" ? { BUN_BE_BUN: "1" } : {}),
      ...mcp.environment,
    },
  })
  // stderr 日志记录
  transport.stderr?.on("data", (chunk: Buffer) => {
    log.info(`mcp stderr: ${chunk.toString()}`, { key })
  })
})
```

### 2. 远程传输 (StreamableHTTP / SSE)

远程服务器按顺序尝试两种传输方式：

```typescript
const transports: Array<{ name: string; transport: TransportWithAuth }> = [
  { name: "StreamableHTTP", transport: new StreamableHTTPClientTransport(url, { ... }) },
  { name: "SSE", transport: new SSEClientTransport(url, { ... }) },
]
```

先尝试 StreamableHTTP，失败后 fallback 到 SSE。如果是认证错误（UnauthorizedError），停止尝试并返回 `needs_auth` 状态。

## 连接管理

### 资源安全连接

使用 Effect 的 `acquireUseRelease` 模式确保失败时关闭 transport：

```typescript
const connectTransport = (transport, timeout) =>
  Effect.acquireUseRelease(
    Effect.succeed(transport),           // acquire
    (t) => /* 连接客户端 */,              // use
    (t, exit) =>                         // release
      Exit.isFailure(exit) ? Effect.tryPromise(() => t.close()).pipe(Effect.ignore) : Effect.void,
  )
```

### 子进程清理

断开连接时，对于 Stdio 传输，递归查找并 SIGTERM 所有子进程（非 Windows）：

```typescript
const descendants = Effect.fnUntraced(function* (pid: number) {
  if (process.platform === "win32") return []
  const pids: number[] = []
  const queue = [pid]
  while (queue.length > 0) {
    const current = queue.shift()!
    const handle = yield* spawner.spawn(ChildProcess.make("pgrep", ["-P", String(current)]))
    // 递归收集所有子进程 PID
  }
  return pids
})
```

### Finalizer 清理

状态初始化时注册 finalizer，确保作用域退出时关闭所有客户端并清理子进程：

```typescript
yield* Effect.addFinalizer(() =>
  Effect.gen(function* () {
    for (const client of Object.values(s.clients)) {
      const pid = client.transport instanceof StdioClientTransport ? client.transport.pid : null
      if (typeof pid === "number") {
        const pids = yield* descendants(pid)
        for (const dpid of pids) { try { process.kill(dpid, "SIGTERM") } catch {} }
      }
      yield* Effect.tryPromise(() => client.close()).pipe(Effect.ignore)
    }
    pendingOAuthTransports.clear()
  }),
)
```

## 工具列表变更监听

每个已连接的客户端注册 `ToolListChangedNotificationSchema` 通知处理器：

```typescript
function watch(s: State, name: string, client: MCPClient, bridge: EffectBridge.Shape, timeout?: number) {
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    const listed = await bridge.promise(defs(name, client, timeout))
    if (!listed) return
    if (s.clients[name] !== client || s.status[name]?.status !== "connected") return
    s.defs[name] = listed
    await bridge.promise(bus.publish(ToolsChanged, { server: name }).pipe(Effect.ignore))
  })
}
```

## Schema 容错

当 MCP 服务器的 outputSchema 包含无法解析的 JSON Schema 引用时，自动降级为宽松模式（不使用 outputSchema 验证）：

```typescript
const TolerantListToolsResultSchema = ListToolsResultSchema.extend({
  tools: ToolSchema.omit({ outputSchema: true }).array(),
})

function listTools(key, client, timeout) {
  return Effect.tryPromise({ try: () => client.listTools(...) }).pipe(
    Effect.catch((error) => {
      if (!isOutputSchemaValidationError(error)) return Effect.fail(error)
      // 降级：不使用 outputSchema 验证
      return Effect.tryPromise({
        try: () => client.request({ method: "tools/list" }, TolerantListToolsResultSchema, { timeout }),
      })
    }),
  )
}
```

## MCP 工具转换

`convertMcpTool()` 将 MCP 工具定义转换为 AI SDK `Tool` 类型：

```typescript
function convertMcpTool(mcpTool: MCPToolDef, client: MCPClient, timeout?: number): Tool {
  const schema: JSONSchema7 = {
    ...(inputSchema as JSONSchema7),
    type: "object",
    properties: (inputSchema.properties ?? {}) as JSONSchema7["properties"],
    additionalProperties: false,
  }

  return dynamicTool({
    description: mcpTool.description ?? "",
    inputSchema: jsonSchema(schema),
    execute: async (args) => client.callTool({
      name: mcpTool.name,
      arguments: (args || {}) as Record<string, unknown>,
    }, CallToolResultSchema, { resetTimeoutOnProgress: true, timeout }),
  })
}
```

工具命名规则：`{sanitize(clientName)}_{sanitize(toolName)}`，其中 `sanitize` 将非字母数字字符替换为 `_`。

## OAuth 认证流程

### 1. startAuth

启动 OAuth 授权流程，返回授权 URL 和 state：

```typescript
const startAuth = Effect.fn("MCP.startAuth")(function* (mcpName) {
  // 启动回调服务器
  yield* Effect.promise(() => McpOAuthCallback.ensureRunning(oauthConfig?.redirectUri))
  // 生成 OAuth state（防 CSRF）
  const oauthState = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0")).join("")
  yield* auth.updateOAuthState(mcpName, oauthState)
  // 创建 authProvider 并连接
  const transport = new StreamableHTTPClientTransport(url, { authProvider })
  // 连接失败且捕获到 redirect URL → 返回授权 URL
})
```

### 2. authenticate

完整认证流程：startAuth + 打开浏览器 + 等待回调 + finishAuth：

```typescript
const authenticate = Effect.fn("MCP.authenticate")(function* (mcpName) {
  const result = yield* startAuth(mcpName)
  if (!result.authorizationUrl) {
    // 无需浏览器授权，直接完成
    return yield* storeClient(...)
  }
  // 打开浏览器
  yield* Effect.tryPromise(() => open(result.authorizationUrl)).pipe(
    Effect.catch(() => bus.publish(BrowserOpenFailed, { mcpName, url }))
  )
  // 等待回调
  const code = yield* Effect.promise(() => McpOAuthCallback.waitForCallback(oauthState, mcpName))
  // 验证 state（防 CSRF）
  if (storedState !== result.oauthState) throw new Error("OAuth state mismatch")
  return yield* finishAuth(mcpName, code)
})
```

### 3. finishAuth

使用授权码完成 OAuth 流程并建立连接：

```typescript
const finishAuth = Effect.fn("MCP.finishAuth")(function* (mcpName, authorizationCode) {
  const transport = pendingOAuthTransports.get(mcpName)
  yield* Effect.tryPromise({ try: () => transport.finishAuth(authorizationCode) })
  yield* auth.clearCodeVerifier(mcpName)
  pendingOAuthTransports.delete(mcpName)
  return yield* createAndStore(mcpName, mcpConfig)
})
```

## 状态管理

```typescript
interface State {
  status: Record<string, Status>         // 服务器 → 状态
  clients: Record<string, MCPClient>     // 服务器 → 客户端实例
  defs: Record<string, MCPToolDef[]>     // 服务器 → 工具定义
}
```

状态通过 `InstanceState` 管理，与项目目录绑定。

## 辅助功能

### Prompts 和 Resources

通过 `collectFromConnected` 工具函数从所有已连接客户端收集：

```typescript
const prompts = Effect.fn("MCP.prompts")(function* () {
  return yield* collectFromConnected(s, (c) => c.listPrompts().then((r) => r.prompts), "prompts")
})

const resources = Effect.fn("MCP.resources")(function* () {
  return yield* collectFromConnected(s, (c) => c.listResources().then((r) => r.resources), "resources")
})
```

命名规则：`{sanitize(clientName)}:{sanitize(name)}`。

### getPrompt / readResource

单个客户端的 prompt 和 resource 访问：

```typescript
const getPrompt = Effect.fn("MCP.getPrompt")(function* (clientName, name, args) {
  return yield* withClient(clientName, (client) => client.getPrompt({ name, arguments: args }), "getPrompt")
})

const readResource = Effect.fn("MCP.readResource")(function* (clientName, resourceUri) {
  return yield* withClient(clientName, (client) => client.readResource({ uri: resourceUri }), "readResource")
})
```

## 错误处理

| 错误类 | 说明 |
|--------|------|
| `Failed` | 通用 MCP 失败（NamedError，携带 name 字段） |

连接失败时返回 `{ status: "failed", error: message }` 状态而非抛出异常。

## 关键设计决策

1. **三传输方式支持**：Stdio（本地进程）、StreamableHTTP（远程优先）、SSE（远程 fallback），覆盖所有 MCP 服务器部署场景

2. **资源安全连接**：使用 `acquireUseRelease` 确保连接失败时自动关闭 transport，避免资源泄漏

3. **Schema 容错降级**：遇到无法解析的 outputSchema JSON 引用时，自动降级为宽松模式，不阻塞工具加载

4. **工具列表变更实时监听**：注册 `ToolListChangedNotificationSchema` 通知处理器，MCP 服务器工具变更时自动更新本地缓存并发布事件

5. **子进程递归清理**：断开 Stdio 连接时使用 `pgrep -P` 递归查找并终止所有子进程，防止僵尸进程

6. **OAuth CSRF 防护**：使用 `crypto.getRandomValues` 生成 32 字节随机 state，回调时验证 state 一致性

7. **双远程传输 fallback**：先尝试 StreamableHTTP，失败后尝试 SSE；认证错误（UnauthorizedError）立即停止尝试

8. **concurrency: unbounded 初始化**：所有 MCP 服务器并发初始化，互不阻塞

9. **pendingOAuthTransports 独立管理**：OAuth 流程中的 transport 存储在模块级 Map 中，不进入 State，避免状态污染

10. **浏览器打开容错**：`open()` 失败时不阻塞流程，通过 Bus 发布 `BrowserOpenFailed` 事件，用户可手动打开 URL
