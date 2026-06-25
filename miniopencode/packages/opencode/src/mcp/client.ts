/**
 * mcp/client.ts — MCP 客户端实现
 *
 * 支持 stdio 和 SSE 两种传输方式
 * 使用 Effect 管理连接生命周期
 */

import { Effect, Fiber, Queue, Stream, Scope } from "effect"
import * as Log from "@miniopencode/core/util/log"
import type { JSONRPCRequest, JSONRPCResponse, JSONRPCNotification, ToolDefinition, CallToolResult } from "./schema"
import { Methods } from "./schema"

const log = Log.create({ service: "mcp.client" })

// ===== 传输层抽象 =====

export interface Transport {
  readonly send: (message: string) => void
  readonly onMessage: (handler: (data: string) => void) => void
  readonly onClose: (handler: () => void) => void
  readonly close: () => void
}

// ===== Stdio 传输 =====

export interface StdioOpts {
  command: string
  args: string[]
  env?: Record<string, string>
}

export const makeStdioTransport = (opts: StdioOpts): Transport => {
  const proc = Bun.spawn([opts.command, ...opts.args], {
    env: { ...process.env, ...opts.env },
    stdio: ["pipe", "pipe", "pipe"],
  })

  const messageHandlers: Array<(data: string) => void> = []
  const closeHandlers: Array<() => void> = []

  const reader = proc.stdout?.getReader()
  if (reader) {
    const readLoop = async () => {
      const decoder = new TextDecoder()
      let buffer = ""
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          // JSON-RPC 消息以换行分隔
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""
          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed) {
              for (const handler of messageHandlers) {
                handler(trimmed)
              }
            }
          }
        }
      } catch (err) {
        log.debug("stdio read loop ended", { error: String(err) })
      } finally {
        reader.releaseLock()
        for (const handler of closeHandlers) handler()
      }
    }
    readLoop()
  }

  return {
    send: (message: string) => {
      try {
        proc.stdin?.write(message + "\n")
      } catch (err) {
        log.error("stdio send failed", { error: String(err) })
      }
    },
    onMessage: (handler) => messageHandlers.push(handler),
    onClose: (handler) => closeHandlers.push(handler),
    close: () => {
      try {
        proc.kill()
      } catch {}
    },
  }
}

// ===== MCP 客户端 =====

export interface MCPClient {
  readonly tools: () => Effect.Effect<ToolDefinition[]>
  readonly callTool: (name: string, args: Record<string, unknown>) => Effect.Effect<CallToolResult>
  readonly close: () => Effect.Effect<void>
}

let requestId = 0
const nextId = () => ++requestId

export const makeClient = (
  transport: Transport,
  serverName: string,
): Effect.Effect<MCPClient, Error, Scope.Scope> =>
  Effect.gen(function* () {
    const pending = new Map<string | number, {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
    }>()

    const toolChangeHandlers: Array<() => void> = []

    // 处理收到的消息
    transport.onMessage((data: string) => {
      try {
        const msg = JSON.parse(data)
        if ("id" in msg && ("result" in msg || "error" in msg)) {
          // 响应
          const response = msg as JSONRPCResponse
          const pending_handler = pending.get(response.id)
          if (pending_handler) {
            pending.delete(response.id)
            if (response.error) {
              pending_handler.reject(new Error(response.error.message))
            } else {
              pending_handler.resolve(response.result)
            }
          }
        } else if ("method" in msg && !("id" in msg)) {
          // 通知
          const notification = msg as JSONRPCNotification
          if (notification.method === Methods.toolsChanged) {
            for (const handler of toolChangeHandlers) handler()
          }
        }
      } catch (err) {
        log.debug("failed to parse MCP message", { data, error: String(err) })
      }
    })

    // 发送请求并等待响应
    const request = <T>(method: string, params?: Record<string, unknown>): Effect.Effect<T> =>
      Effect.async<T>((resume) => {
        const id = nextId()
        const req: JSONRPCRequest = { jsonrpc: "2.0", id, method, params }
        pending.set(id, {
          resolve: (v) => resume(Effect.succeed(v as T)),
          reject: (e) => resume(Effect.fail(e)),
        })
        transport.send(JSON.stringify(req))
      })

    // 初始化
    log.info("initializing MCP client", { server: serverName })
    const initResult = yield* Effect.tryPromise({
      try: () =>
        request<{ serverInfo: { name: string; version: string } }>(Methods.initialize, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          clientInfo: { name: "miniopencode", version: "0.1.0" },
        }),
      catch: (err) => new Error(`MCP init failed: ${err}`),
    })
    log.info("MCP client initialized", { server: serverName, info: initResult.serverInfo })

    // 发送 initialized 通知
    transport.send(JSON.stringify({ jsonrpc: "2.0", method: Methods.initialized }))

    // 注册 Scope 清理
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        log.info("closing MCP client", { server: serverName })
        transport.close()
      })
    )

    return {
      tools: () => request<ToolDefinition[]>(Methods.toolsList).pipe(
        Effect.map((result: any) => result.tools as ToolDefinition[]),
      ),
      callTool: (name: string, args: Record<string, unknown>) =>
        request<CallToolResult>(Methods.toolsCall, { name, arguments: args }),
      close: () =>
        Effect.sync(() => {
          transport.close()
        }),
    }
  })
