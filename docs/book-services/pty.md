# @opencode/Pty — 伪终端管理服务
> 婧愭枃浠? `opencode/packages/opencode/src/pty/index.ts`

## 概述

`@opencode/Pty` 是 OpenCode 的**伪终端（PTY）管理服务**，负责创建、管理和多路复用终端会话。每个会话由一个 PTY 进程和多个 WebSocket 订阅者组成，支持实时数据广播、缓冲区回放和会话生命周期管理。

该服务通过 Node.js 原生 `#pty` 模块（`node-pty` 或等效实现）创建伪终端进程，对外暴露创建、写入、调整大小和 WebSocket 连接等接口。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 读取 `cfg.shell` 确定默认 shell |
| `Bus` | `@opencode/Bus` | 发布终端生命周期事件（Created/Updated/Exited/Deleted） |
| `Plugin` | `@opencode/Plugin` | 触发 `shell.env` 钩子，允许插件注入终端环境变量 |

```typescript
// index.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const bus = yield* Bus.Service
    const plugin = yield* Plugin.Service
    // ...
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Bus.layer),
  Layer.provide(Plugin.defaultLayer),
  Layer.provide(Config.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly list: () => Effect.Effect<Info[]>                                                                       // 列出所有终端会话
  readonly get: (id: PtyID) => Effect.Effect<Info | undefined>                                                     // 获取单个会话信息
  readonly create: (input: CreateInput) => Effect.Effect<Info>                                                     // 创建新终端会话
  readonly update: (id: PtyID, input: UpdateInput) => Effect.Effect<Info | undefined>                              // 更新会话（标题/尺寸）
  readonly remove: (id: PtyID) => Effect.Effect<void>                                                              // 删除终端会话
  readonly resize: (id: PtyID, cols: number, rows: number) => Effect.Effect<void>                                  // 调整终端尺寸
  readonly write: (id: PtyID, data: string) => Effect.Effect<void>                                                 // 向终端写入数据
  readonly connect: (
    id: PtyID,
    ws: Socket,
    cursor?: number,
  ) => Effect.Effect<{ onMessage: (message: string | ArrayBuffer) => void; onClose: () => void } | undefined>     // 连接 WebSocket 客户端
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Pty") {}
```

使用方式：

```typescript
// 创建终端
const pty = yield* Pty.Service.create({ command: "bash", cwd: "/project" })

// 写入命令
yield* Pty.Service.write(pty.id, "ls -la\n")

// 连接 WebSocket
const conn = yield* Pty.Service.connect(pty.id, websocket)
```

## 数据结构

### Info（终端会话信息）

```typescript
export const Info = Schema.Struct({
  id: PtyID,                                      // 唯一标识符
  title: Schema.String,                           // 终端标题
  command: Schema.String,                         // 启动命令
  args: Schema.Array(Schema.String),              // 命令参数
  cwd: Schema.String,                             // 工作目录
  status: Schema.Literals(["running", "exited"]),  // 运行状态
  pid: PositiveInt,                               // 进程 PID
})
```

### CreateInput（创建输入）

```typescript
export const CreateInput = Schema.Struct({
  command: Schema.optional(Schema.String),                                    // 启动命令（默认使用 cfg.shell）
  args: Schema.optional(Schema.Array(Schema.String)),                         // 命令参数
  cwd: Schema.optional(Schema.String),                                        // 工作目录（默认使用实例目录）
  title: Schema.optional(Schema.String),                                      // 终端标题（默认 "Terminal XXXX"）
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),          // 额外的环境变量
})
```

### UpdateInput（更新输入）

```typescript
export const UpdateInput = Schema.Struct({
  title: Schema.optional(Schema.String),
  size: Schema.optional(Schema.Struct({
    rows: PositiveInt,
    cols: PositiveInt,
  })),
})
```

### Socket（WebSocket 抽象）

```typescript
type Socket = {
  readyState: number
  data?: unknown
  send: (data: string | Uint8Array | ArrayBuffer) => void
  close: (code?: number, reason?: string) => void
}
```

`sock()` 辅助函数处理 `ws.data` 的解包，用于将 WebSocket 的 `data` 属性作为订阅者标识。

### 事件

```typescript
export const Event = {
  Created: BusEvent.define("pty.created", Schema.Struct({ info: Info })),
  Updated: BusEvent.define("pty.updated", Schema.Struct({ info: Info })),
  Exited: BusEvent.define("pty.exited", Schema.Struct({ id: PtyID, exitCode: NonNegativeInt })),
  Deleted: BusEvent.define("pty.deleted", Schema.Struct({ id: PtyID })),
}
```

### 内部状态

```typescript
type Active = {
  info: Info
  process: Proc
  buffer: string            // 输出缓冲区（滚动缓冲）
  bufferCursor: number      // 缓冲区起始位置（用于回放偏移计算）
  cursor: number            // 已输出的总字节数
  subscribers: Map<unknown, Socket>  // WebSocket 订阅者
}

type State = {
  dir: string
  sessions: Map<PtyID, Active>
}
```

## 关键实现细节

### 终端创建流程

`create` 方法的完整流程：

1. 生成唯一 `PtyID`（使用 `PtyID.ascending()` 生成时间排序的 ID）
2. 确定命令和参数：如果未指定 `command`，使用 `Shell.preferred(cfg.shell)` 获取默认 shell；如果是 login shell，追加 `-l` 参数
3. 触发 `plugin.trigger("shell.env", ...)` 获取插件注入的环境变量
4. 合并环境变量：`process.env → input.env → shell.env → TERM=xterm-256color + OPENCODE_TERMINAL=1`
5. Windows 平台额外设置 `LC_ALL=C.UTF-8`、`LC_CTYPE=C.UTF-8`、`LANG=C.UTF-8`
6. 调用 `#pty.spawn()` 创建伪终端进程
7. 构建 `Info` 和 `Active` 结构，加入 sessions Map
8. 注册 `onData` 和 `onExit` 回调
9. 发布 `Event.Created` 事件

```typescript
const { spawn } = yield* Effect.promise(() => pty())
const proc = yield* Effect.sync(() =>
  spawn(command, args, {
    name: "xterm-256color",
    cwd,
    env,
  }),
)
```

### 输出广播与缓冲区管理

`onData` 回调处理 PTY 输出：

```typescript
proc.onData((chunk) => {
  session.cursor += chunk.length

  // 向所有 WebSocket 订阅者实时广播
  for (const [key, ws] of session.subscribers.entries()) {
    if (ws.readyState !== 1) { session.subscribers.delete(key); continue }
    if (sock(ws) !== key) { session.subscribers.delete(key); continue }
    try { ws.send(chunk) } catch { session.subscribers.delete(key) }
  }

  // 追加到缓冲区，超过 BUFFER_LIMIT (2MB) 时从头部裁剪
  session.buffer += chunk
  if (session.buffer.length <= BUFFER_LIMIT) return
  const excess = session.buffer.length - BUFFER_LIMIT
  session.buffer = session.buffer.slice(excess)
  session.bufferCursor += excess
})
```

缓冲区限制为 2MB（`BUFFER_LIMIT = 1024 * 1024 * 2`），超出时从头部丢弃旧数据，`bufferCursor` 跟踪已丢弃的偏移量。

### WebSocket 连接与回放

`connect` 方法处理新客户端连接：

1. 将客户端加入 `subscribers` Map
2. 计算需要回放的数据范围：`cursor`（连接时光标位置，-1 表示最新，默认 0）
3. 从缓冲区中提取对应偏移的数据
4. 以 `BUFFER_CHUNK`（64KB）为块大小分批发送回放数据
5. 发送控制帧（`0x00` + JSON `{ cursor }`）告知客户端当前光标位置
6. 返回 `onMessage` 和 `onClose` 回调

```typescript
// 控制帧格式
const meta = (cursor: number) => {
  const json = JSON.stringify({ cursor })
  const bytes = encoder.encode(json)
  const out = new Uint8Array(bytes.length + 1)
  out[0] = 0        // 控制帧标识
  out.set(bytes, 1)
  return out
}
```

### 进程退出处理

`onExit` 回调处理进程退出：

- 标记 `info.status = "exited"`（防止重复处理）
- 通过 `bridge.fork` 发布 `Event.Exited` 事件
- 通过 `bridge.fork` 调用 `remove(id)` 自动清理

```typescript
proc.onExit(({ exitCode }) => {
  if (session.info.status === "exited") return
  session.info.status = "exited"
  bridge.fork(bus.publish(Event.Exited, { id, exitCode }))
  bridge.fork(remove(id))
})
```

### 清理逻辑

`teardown` 函数处理会话销毁：

```typescript
function teardown(session: Active) {
  try { session.process.kill() } catch {}
  for (const [sub, ws] of session.subscribers.entries()) {
    try { if (sock(ws) === sub) ws.close() } catch {}
  }
  session.subscribers.clear()
}
```

实例销毁时通过 `Effect.addFinalizer` 清理所有活跃会话。

## 关键设计决策

1. **WebSocket 多路复用**：一个 PTY 进程支持多个 WebSocket 订阅者同时连接，每个订阅者通过 `ws.data` 作为唯一标识，输出广播到所有订阅者，输入通过 `onMessage` 回传

2. **缓冲区回放机制**：新连接的客户端可以通过 `cursor` 参数请求历史输出回放。缓冲区保留最近 2MB 的输出，使用 `bufferCursor` 跟踪已丢弃的偏移量，使客户端可以精确请求任意历史位置的数据

3. **控制帧协议**：以 `0x00` 字节开头的 WebSocket 消息为控制帧（JSON `{ cursor }`），用于告知客户端当前的输出光标位置。其余消息为终端原始数据

4. **插件环境变量注入**：通过 `plugin.trigger("shell.env", ...)` 允许插件在终端创建时注入环境变量，实现了可扩展的终端环境配置

5. **退出自动清理**：进程退出时自动调用 `remove`，通过 `EffectBridge.fork` 在 Effect 上下文中执行清理，确保事件发布和资源释放的正确性

6. **Windows UTF-8 强制设置**：Windows 平台自动设置 `LC_ALL`、`LC_CTYPE`、`LANG` 为 `C.UTF-8`，解决 Windows 终端编码问题
