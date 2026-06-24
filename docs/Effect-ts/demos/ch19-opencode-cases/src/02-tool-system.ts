/**
 * 案例 2: 工具系统 — Context.Service + Layer 模式
 *
 * 本 demo 模拟 OpenCode 中 tool/registry.ts 的核心模式：
 * 使用 Context.Service 定义工具注册接口，Layer.effect 实现依赖注入，
 * 通过 Effect.gen 组合多个工具实现。
 *
 * 关键 API:
 * - Context.Service — 定义带唯一标识的服务类
 * - Layer.effect — 从 Effect 创建服务层
 * - Layer.provide — 为 Layer 提供依赖
 * - Effect.gen — 生成器风格的 Effect 组合
 */

import { Context, Effect, Layer, Console, Schema } from "effect"

// ============================================================
// 1. 定义工具类型
// ============================================================

// 工具定义 — 类似 OpenCode 的 Tool.Def
export interface ToolDef {
  readonly id: string
  readonly description: string
  readonly execute: (args: Record<string, unknown>) => Effect.Effect<string>
}

// 工具执行结果
export interface ToolResult {
  readonly output: string
  readonly truncated: boolean
}

// ============================================================
// 2. 定义服务接口 — 类似 OpenCode 的 ToolRegistry.Interface
// ============================================================

export interface ToolRegistryInterface {
  readonly register: (tool: ToolDef) => Effect.Effect<void>
  readonly all: () => Effect.Effect<ToolDef[]>
  readonly execute: (id: string, args: Record<string, unknown>) => Effect.Effect<ToolResult>
}

// 使用 Context.Service 定义服务 — 类似 OpenCode 的 ToolRegistry.Service
export class ToolRegistry extends Context.Service<ToolRegistry, ToolRegistryInterface>()(
  "@demo/ToolRegistry",
) {}

// ============================================================
// 3. 定义具体工具
// ============================================================

// Shell 工具 — 类似 OpenCode 的 ShellTool
const ShellTool: ToolDef = {
  id: "shell",
  description: "执行 shell 命令",
  execute: (args) =>
    Effect.gen(function* () {
      const cmd = String(args.command ?? "")
      yield* Console.log(`[Shell] 执行命令: ${cmd}`)
      return `命令 "${cmd}" 执行成功`
    }),
}

// Read 工具 — 类似 OpenCode 的 ReadTool
const ReadTool: ToolDef = {
  id: "read",
  description: "读取文件内容",
  execute: (args) =>
    Effect.gen(function* () {
      const path = String(args.path ?? "")
      yield* Console.log(`[Read] 读取文件: ${path}`)
      return `文件 ${path} 的内容: Hello, World!`
    }),
}

// Grep 工具 — 类似 OpenCode 的 GrepTool
const GrepTool: ToolDef = {
  id: "grep",
  description: "搜索文件内容",
  execute: (args) =>
    Effect.gen(function* () {
      const pattern = String(args.pattern ?? "")
      const path = String(args.path ?? ".")
      yield* Console.log(`[Grep] 在 ${path} 中搜索: ${pattern}`)
      return `在 ${path} 中找到 3 处匹配`
    }),
}

// ============================================================
// 4. 实现服务层 — 类似 OpenCode 的 ToolRegistry.layer
// ============================================================

export const ToolRegistryLayer = Layer.effect(
  ToolRegistry,
  Effect.gen(function* () {
    // 内部状态: 已注册的工具列表
    const tools: ToolDef[] = []

    return ToolRegistry.of({
      register: (tool) =>
        Effect.sync(() => {
          tools.push(tool)
        }),
      all: () => Effect.succeed([...tools]),
      execute: (id, args) =>
        Effect.gen(function* () {
          const tool = tools.find((t) => t.id === id)
          if (!tool) {
            return { output: `工具 ${id} 未找到`, truncated: false }
          }
          const output = yield* tool.execute(args)
          return { output, truncated: false }
        }),
    })
  }),
)

// ============================================================
// 5. 注册内置工具 — 类似 OpenCode 的 defaultLayer
// ============================================================

// 初始化层: 注册所有内置工具
export const InitLayer = Layer.effect(
  ToolRegistry,
  Effect.gen(function* () {
    const registry = yield* ToolRegistry
    yield* registry.register(ShellTool)
    yield* registry.register(ReadTool)
    yield* registry.register(GrepTool)
    return registry
  }),
).pipe(Layer.provide(ToolRegistryLayer))

// ============================================================
// 6. 使用工具系统
// ============================================================

const main = Effect.gen(function* () {
  const registry = yield* ToolRegistry

  // 列出所有工具
  const all = yield* registry.all()
  yield* Console.log(`已注册 ${all.length} 个工具:`)
  for (const tool of all) {
    yield* Console.log(`  - ${tool.id}: ${tool.description}`)
  }

  // 执行工具
  yield* Console.log("")
  const result1 = yield* registry.execute("shell", { command: "ls -la" })
  yield* Console.log(`结果: ${result1.output}`)

  const result2 = yield* registry.execute("read", { path: "/tmp/test.txt" })
  yield* Console.log(`结果: ${result2.output}`)

  const result3 = yield* registry.execute("grep", { pattern: "TODO", path: "./src" })
  yield* Console.log(`结果: ${result3.output}`)
})

// 运行 — 通过 Layer 提供所有依赖
await main.pipe(
  Effect.provide(InitLayer),
  Effect.runPromise,
)
