/**
 * 03-ecosystem.ts — Effect 生态概览
 *
 * 展示 Effect 生态中四个核心库的使用模式：
 *   1. @effect/platform — HTTP 客户端、文件系统、路径操作
 *   2. @effect/cli — 命令行应用构建
 *   3. @effect/rpc — 类型安全的 RPC 通信
 *   4. @effect/sql — 数据库访问
 *
 * 注意: 本 demo 使用核心 effect 包模拟各库的 API 风格。
 * 实际使用时需安装对应 @effect/* 包。
 *
 * 运行: bun run src/03-ecosystem.ts
 */
import { Effect, Schema, Context, Layer, ManagedRuntime, Duration } from "effect"

// ============================================================
// 1. @effect/platform — HTTP 客户端、文件系统、路径操作
// ============================================================

// @effect/platform 提供跨运行时的 HTTP、FS、Path 等抽象。
// 以下展示其 API 风格和使用模式。

// ---- HTTP 客户端模式 ----
interface HttpRequest {
  readonly url: string
  readonly method: "GET" | "POST"
  readonly headers?: Record<string, string>
  readonly body?: unknown
}

interface HttpResponse {
  readonly status: number
  readonly body: string
}

// @effect/platform 的 HttpClient 接口风格
interface HttpClientShape {
  readonly request: (req: HttpRequest) => Effect.Effect<never, Error, HttpResponse>
  readonly get: (url: string) => Effect.Effect<never, Error, HttpResponse>
  readonly post: (url: string, body: unknown) => Effect.Effect<never, Error, HttpResponse>
}

class HttpClient extends Context.Service<HttpClient, HttpClientShape>()("@effect/platform/HttpClient") {}

// 模拟 HTTP 客户端实现
const requestImpl = (req: HttpRequest): Effect.Effect<never, Error, HttpResponse> =>
  Effect.gen(function* () {
    console.log(`[HTTP] ${req.method} ${req.url}`)
    if (req.url.includes("error")) {
      return yield* Effect.fail(new Error(`请求失败: ${req.url}`))
    }
    return { status: 200, body: JSON.stringify({ ok: true }) }
  })

const HttpClientLive = Layer.succeed(HttpClient)(HttpClient.of({
  request: (req) => requestImpl(req),
  get: (url) => requestImpl({ url, method: "GET" }),
  post: (url, body) => requestImpl({ url, method: "POST", body }),
}))

// ---- 文件系统模式 ----
// @effect/platform 的 FileSystem 接口风格
interface FileSystemShape {
  readonly readFile: (path: string) => Effect.Effect<never, Error, string>
  readonly writeFile: (path: string, content: string) => Effect.Effect<never, Error, void>
  readonly exists: (path: string) => Effect.Effect<never, Error, boolean>
}

class FileSystem extends Context.Service<FileSystem, FileSystemShape>()("@effect/platform/FileSystem") {}

const FileSystemLive = Layer.succeed(FileSystem)(FileSystem.of({
  readFile: (path) =>
    Effect.gen(function* () {
      console.log(`[FS] 读取文件: ${path}`)
      if (path === "missing.txt") {
        return yield* Effect.fail(new Error(`文件不存在: ${path}`))
      }
      return `文件内容: ${path}`
    }),
  writeFile: (path, content) =>
    Effect.sync(() => console.log(`[FS] 写入文件: ${path} (${content.length} 字节)`)),
  exists: (path) =>
    Effect.succeed(path !== "missing.txt"),
}))

// ---- 路径操作模式 -//
// @effect/platform 的 Path 模块风格
interface PathShape {
  readonly join: (...segments: string[]) => string
  readonly basename: (path: string) => string
  readonly dirname: (path: string) => string
  readonly extname: (path: string) => string
}

class Path extends Context.Service<Path, PathShape>()("@effect/platform/Path") {}

const PathLive = Layer.succeed(Path)(Path.of({
  join: (...segments) => segments.join("/"),
  basename: (path) => path.split("/").pop() ?? path,
  dirname: (path) => path.split("/").slice(0, -1).join("/"),
  extname: (path) => {
    const parts = path.split(".")
    return parts.length > 1 ? `.${parts.pop()}` : ""
  },
}))

async function demoPlatform() {
  console.log("=== 1. @effect/platform ===")

  const layer = Layer.mergeAll(HttpClientLive, FileSystemLive, PathLive)

  // HTTP 请求
  const http = await Effect.runPromise(
    Effect.provide(layer)(Effect.gen(function* () { return yield* HttpClient })),
  )
  const resp = await Effect.runPromise(http.get("https://api.example.com/users"))
  console.log(`  HTTP 响应: ${resp.status} ${resp.body}`)

  // 文件系统
  const fs = await Effect.runPromise(
    Effect.gen(function* () { return yield* FileSystem }).pipe(
      Effect.provide(layer),
    ),
  )
  const content = await Effect.runPromise(fs.readFile("config.json"))
  console.log(`  FS 读取: ${content}`)

  // 路径操作
  const path = await Effect.runPromise(
    Effect.gen(function* () { return yield* Path }).pipe(
      Effect.provide(layer),
    ),
  )
  console.log(`  Path.join: ${path.join("a", "b", "c.txt")}`)
  console.log(`  Path.basename: ${path.basename("/usr/local/bin")}`)
  console.log(`  Path.extname: ${path.extname("image.png")}`)
}

// ============================================================
// 2. @effect/cli — 命令行应用构建
// ============================================================

// @effect/cli 提供类型安全的命令行参数解析和命令定义。
// 以下展示其 API 风格。

// 模拟 CLI 命令定义
interface CommandDef<A> {
  readonly name: string
  readonly description: string
  readonly handler: Effect.Effect<never, never, A>
}

// 模拟 CLI 参数解析
interface CliArgs {
  readonly name: string
  readonly verbose: boolean
  readonly count: number
}

// @effect/cli 风格的参数定义
const CliArgsSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.annotate({ description: "用户名" })),
  verbose: Schema.Boolean.pipe(Schema.annotate({ description: "详细输出" })),
  count: Schema.Number.pipe(Schema.annotate({ description: "重复次数" })),
})

async function demoCli() {
  console.log("\n=== 2. @effect/cli ===")

  // 模拟 CLI 参数解析
  const rawArgs: Record<string, unknown> = {
    name: "Alice",
    verbose: true,
    count: 3,
  }

  const args = await Effect.runPromise(Schema.decodeEffect(CliArgsSchema)(rawArgs))
  console.log(`  CLI 参数: name=${args.name}, verbose=${args.verbose}, count=${args.count}`)

  // 模拟命令执行
  const greetCommand: CommandDef<string> = {
    name: "greet",
    description: "向用户打招呼",
    handler: Effect.succeed(`你好, ${args.name}!`),
  }

  const result = await Effect.runPromise(greetCommand.handler)
  console.log(`  CLI 输出: ${result}`)

  // 模拟多命令路由
  const commands: CommandDef<unknown>[] = [
    greetCommand,
    { name: "version", description: "显示版本", handler: Effect.succeed("v1.0.0") },
  ]

  for (const cmd of commands) {
    console.log(`  命令: ${cmd.name} — ${cmd.description}`)
  }
}

// ============================================================
// 3. @effect/rpc — 类型安全的 RPC 通信
// ============================================================

// @effect/rpc 提供类型安全的远程过程调用。
// 核心概念: RpcSchema 定义请求/响应类型，RpcGroup 分组，RpcRouter 路由。

// 定义 RPC 协议（类似 @effect/rpc 的 RpcSchema）
interface RpcProtocol<Req, Res> {
  readonly id: string
  readonly requestSchema: Schema.Schema<Req>
  readonly responseSchema: Schema.Schema<Res>
}

// 模拟 RPC 处理器
interface RpcHandlerShape {
  readonly register: <Req, Res>(
    protocol: RpcProtocol<Req, Res>,
    handler: (req: Req) => Effect.Effect<never, Error, Res>,
  ) => Effect.Effect<void>
  readonly call: <Req, Res>(
    protocol: RpcProtocol<Req, Res>,
    req: Req,
  ) => Effect.Effect<never, Error, Res>
}

class RpcHandler extends Context.Service<RpcHandler, RpcHandlerShape>()("@effect/rpc/RpcHandler") {}

// 定义 RPC 协议
const UserProtocol: RpcProtocol<{ id: string }, { name: string; email: string }> = {
  id: "user.get",
  requestSchema: Schema.Struct({ id: Schema.String }),
  responseSchema: Schema.Struct({ name: Schema.String, email: Schema.String }),
}

const RpcHandlerLive = Layer.succeed(RpcHandler)(RpcHandler.of({
  register: (protocol, handler) =>
    Effect.sync(() => console.log(`[RPC] 注册协议: ${protocol.id}`)),
  call: (protocol, req) =>
    Effect.gen(function* () {
      console.log(`[RPC] 调用: ${protocol.id}(${JSON.stringify(req)})`)
      if (req.id === "not-found") {
        return yield* Effect.fail(new Error(`用户 ${req.id} 不存在`))
      }
      return { name: "Alice", email: "alice@example.com" }
    }),
}))

async function demoRpc() {
  console.log("\n=== 3. @effect/rpc ===")

  const runtime = ManagedRuntime.make(RpcHandlerLive)
  const rpc = await runtime.runPromise(
    Effect.gen(function* () { return yield* RpcHandler }),
  )

  // 注册处理器
  await Effect.runPromise(
    rpc.register(UserProtocol, (req) =>
      Effect.succeed({ name: "Alice", email: "alice@example.com" }),
    ),
  )

  // 调用 RPC
  const user = await Effect.runPromise(rpc.call(UserProtocol, { id: "1" }))
  console.log(`  RPC 结果: ${JSON.stringify(user)}`)

  // 错误处理
  const errorResult = await Effect.runPromise(
    rpc.call(UserProtocol, { id: "not-found" }).pipe(
      Effect.catch((e) => Effect.succeed(`RPC 错误: ${e.message}`)),
    ),
  )
  console.log(`  ${errorResult}`)

  await runtime.dispose()
}

// ============================================================
// 4. @effect/sql — 数据库访问
// ============================================================

// @effect/sql 提供类型安全的 SQL 查询构建和执行。
// 核心概念: SqlClient、sql`...` 模板字面量、迁移管理。

// 模拟 SQL 客户端
interface SqlResult {
  readonly rows: readonly Record<string, unknown>[]
  readonly rowCount: number
}

interface SqlClientShape {
  readonly query: (sql: string, params: readonly unknown[]) => Effect.Effect<never, Error, SqlResult>
  readonly queryFirst: (sql: string, params: readonly unknown[]) => Effect.Effect<never, Error, Record<string, unknown> | undefined>
  readonly execute: (sql: string) => Effect.Effect<never, Error, void>
}

class SqlClient extends Context.Service<SqlClient, SqlClientShape>()("@effect/sql/SqlClient") {}

const SqlClientLive = Layer.succeed(SqlClient)(SqlClient.of({
  query: (sql, params) =>
    Effect.gen(function* () {
      console.log(`[SQL] 查询: ${sql} (参数: ${JSON.stringify(params)})`)
      return {
        rows: [{ id: "1", name: "Alice", email: "alice@example.com" }],
        rowCount: 1,
      }
    }),
  queryFirst: (sql, params) =>
    Effect.gen(function* () {
      console.log(`[SQL] 查询首行: ${sql}`)
      return { id: "1", name: "Alice", email: "alice@example.com" }
    }),
  execute: (sql) =>
    Effect.sync(() => console.log(`[SQL] 执行: ${sql}`)),
}))

// 模拟 Schema 定义（类似 @effect/sql 的 Model）
class UserModel extends Schema.Class<UserModel>("UserModel")({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
}) {}

async function demoSql() {
  console.log("\n=== 4. @effect/sql ===")

  const runtime = ManagedRuntime.make(SqlClientLive)
  const sql = await runtime.runPromise(
    Effect.gen(function* () { return yield* SqlClient }),
  )

  // 创建表
  await Effect.runPromise(sql.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `))

  // 插入数据
  await Effect.runPromise(sql.execute(
    `INSERT INTO users (id, name, email, created_at) VALUES ('1', 'Alice', 'alice@test.com', '2024-01-01')`,
  ))

  // 查询数据
  const result = await Effect.runPromise(sql.queryFirst(
    `SELECT * FROM users WHERE id = ?`,
    ["1"],
  ))
  console.log(`  SQL 查询结果: ${JSON.stringify(result)}`)

  // 使用 Schema 解码查询结果
  const user = await Effect.runPromise(Schema.decodeEffect(UserModel)(result!))
  console.log(`  Schema 解码: ${user.name} (${user.email})`)

  await runtime.dispose()
}

// ============================================================
// 运行所有生态演示
// ============================================================

async function main() {
  try {
    await demoPlatform()
    await demoCli()
    await demoRpc()
    await demoSql()
    console.log("\n✅ 03-ecosystem.ts 运行完成")
  } catch (err) {
    console.error("运行失败:", err)
  }
}

main()
