/**
 * 案例 3: MCP 客户端 — Stream + Queue 模式
 *
 * 本 demo 模拟 OpenCode 中 mcp/index.ts 的核心模式：
 * 使用 Stream 处理 MCP 工具列表变更通知，使用 Queue 实现
 * 客户端连接状态管理，使用 Effect.acquireUseRelease 管理资源生命周期。
 *
 * 关键 API:
 * - Stream.fromQueue — 从 Queue 创建流
 * - Queue.bounded / Queue.unbounded — 创建有界/无界队列
 * - Stream.runForEach — 消费流中的每个元素
 * - Effect.acquireUseRelease — 资源安全获取/使用/释放
 * - Effect.forkScoped — 在 Scope 中派生 Fiber
 */

import {
  Context,
  Deferred,
  Duration,
  Effect,
  Fiber,
  Layer,
  Queue,
  Scope,
  Stream,
  Console,
  Schedule,
} from "effect"

// ============================================================
// 1. 定义 MCP 消息类型
// ============================================================

// MCP 工具定义
export interface MCPToolDef {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
}

// MCP 连接状态 — 类似 OpenCode 的 Status Schema
export type MCPStatus =
  | { readonly status: "connected" }
  | { readonly status: "disconnected" }
  | { readonly status: "failed"; readonly error: string }

// MCP 工具变更事件 — 类似 OpenCode 的 ToolsChanged
export interface ToolsChangedEvent {
  readonly server: string
}

// ============================================================
// 2. 定义服务接口
// ============================================================

export interface MCPInterface {
  readonly connect: (name: string, url: string) => Effect.Effect<MCPStatus>
  readonly disconnect: (name: string) => Effect.Effect<void>
  readonly tools: (name: string) => Effect.Effect<MCPToolDef[]>
  readonly callTool: (name: string, toolName: string, args: Record<string, unknown>) => Effect.Effect<string>
  readonly toolChanges: () => Stream.Stream<ToolsChangedEvent>
}

export class MCPService extends Context.Service<MCPService, MCPInterface>()(
  "@demo/MCP",
) {}

// ============================================================
// 3. 模拟 MCP 客户端实现
// ============================================================

// 模拟远程 MCP 服务器
const mockRemoteTools: Record<string, MCPToolDef[]> = {
  "filesystem": [
    { name: "read_file", description: "读取文件", inputSchema: { type: "object" } },
    { name: "write_file", description: "写入文件", inputSchema: { type: "object" } },
    { name: "list_dir", description: "列出目录", inputSchema: { type: "object" } },
  ],
  "github": [
    { name: "create_pr", description: "创建 PR", inputSchema: { type: "object" } },
    { name: "list_issues", description: "列出 Issue", inputSchema: { type: "object" } },
  ],
}

// ============================================================
// 4. 实现 MCP 服务层
// ============================================================

export const MCPLayer = Layer.effect(
  MCPService,
  Effect.gen(function* () {
    // 客户端连接状态 — 类似 OpenCode 的 Record<string, Status>
    const connections = new Map<string, MCPStatus>()
    // 缓存的工具列表 — 类似 OpenCode 的 Record<string, MCPToolDef[]>
    const toolCache = new Map<string, MCPToolDef[]>()

    // 工具变更通知队列 — 类似 OpenCode 的 Bus
    const changeQueue = yield* Queue.unbounded<ToolsChangedEvent>()

    // 从 Queue 创建 Stream — 类似 OpenCode 的 Stream.fromQueue
    const toolChanges: Stream.Stream<ToolsChangedEvent> = Stream.fromQueue(changeQueue)

    return MCPService.of({
      connect: (name, url) =>
        Effect.gen(function* () {
          yield* Console.log(`[MCP] 正在连接 ${name} (${url})...`)

          // 模拟连接延迟
          yield* Effect.sleep(Duration.millis(100))

          // 模拟获取工具列表 — 类似 OpenCode 的 listTools
          const tools = mockRemoteTools[name]
          if (!tools) {
            const status: MCPStatus = { status: "failed", error: `未知服务器: ${name}` }
            connections.set(name, status)
            return status
          }

          // 缓存工具列表
          toolCache.set(name, tools)
          connections.set(name, { status: "connected" })

          // 发送工具变更通知 — 类似 OpenCode 的 bus.publish(ToolsChanged, ...)
          yield* Queue.offer(changeQueue, { server: name })

          yield* Console.log(`[MCP] ${name} 已连接，${tools.length} 个工具可用`)
          return { status: "connected" } as MCPStatus
        }),

      disconnect: (name) =>
        Effect.gen(function* () {
          yield* Console.log(`[MCP] 断开连接: ${name}`)
          connections.delete(name)
          toolCache.delete(name)
        }),

      tools: (name) =>
        Effect.gen(function* () {
          const cached = toolCache.get(name)
          if (cached) return cached
          return []
        }),

      callTool: (name, toolName, args) =>
        Effect.gen(function* () {
          const status = connections.get(name)
          if (!status || status.status !== "connected") {
            return `错误: ${name} 未连接`
          }

          const tools = toolCache.get(name)
          const tool = tools?.find((t) => t.name === toolName)
          if (!tool) {
            return `错误: 工具 ${toolName} 未找到`
          }

          yield* Console.log(`[MCP] 调用 ${name}.${toolName}: ${JSON.stringify(args)}`)
          return `${toolName} 执行成功`
        }),

      toolChanges: () => toolChanges,
    })
  }),
)

// ============================================================
// 5. 使用 MCP 客户端 — 展示 Stream + Queue 模式
// ============================================================

const main = Effect.gen(function* () {
  const mcp = yield* MCPService

  // 启动后台 Fiber 监听工具变更 — 类似 OpenCode 的 watch()
  // 使用 Stream.runForEach 消费队列中的事件
  const watcher = yield* Effect.forkScoped(
    mcp.toolChanges().pipe(
      Stream.runForEach((event) =>
        Console.log(`[Watcher] 工具变更通知: ${event.server}`),
      ),
    ),
  )

  // 连接 filesystem 服务器
  const status1 = yield* mcp.connect("filesystem", "http://localhost:3001/mcp")
  yield* Console.log(`filesystem 状态: ${status1.status}`)

  // 连接 github 服务器
  const status2 = yield* mcp.connect("github", "http://localhost:3002/mcp")
  yield* Console.log(`github 状态: ${status2.status}`)

  // 列出所有工具
  const fsTools = yield* mcp.tools("filesystem")
  yield* Console.log(`\nfilesystem 工具列表:`)
  for (const tool of fsTools) {
    yield* Console.log(`  - ${tool.name}: ${tool.description}`)
  }

  // 调用工具
  const result = yield* mcp.callTool("filesystem", "read_file", { path: "/tmp/test.txt" })
  yield* Console.log(`\n调用结果: ${result}`)

  // 断开连接
  yield* mcp.disconnect("filesystem")

  // 等待 watcher Fiber 处理完事件
  yield* Effect.sleep(Duration.millis(50))
  yield* Fiber.interrupt(watcher)
})

// 运行
await main.pipe(
  Effect.scoped, // 提供 Scope 给 forkScoped
  Effect.provide(MCPLayer),
  Effect.runPromise,
)
