/**
 * lsp/lsp.ts — LSP 语言服务器协议客户端
 *
 * 基于 JSON-RPC 的 LSP 客户端实现
 * 支持诊断、引用查找、跳转定义
 */

import { Effect, Layer, Context, Schema, Queue } from "effect"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "lsp" })

// ===== LSP 基础类型 =====

export interface Position { line: number; character: number }
export interface Range { start: Position; end: Position }
export interface Location { uri: string; range: Range }

export interface Diagnostic {
  range: Range
  severity?: number
  message: string
  source?: string
}

export interface SymbolInfo {
  name: string
  kind: number
  location: Location
}

// ===== LSP 服务器实例 =====

interface LSPServer {
  name: string
  languageId: string
  command: string
  args: string[]
  root: string
}

interface LSPConnection {
  server: LSPServer
  process: { stdin: WritableStream; stdout: ReadableStream }
  requestId: number
  pending: Map<string | number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
  capabilities: Record<string, unknown>
}

// ===== 服务接口 =====

export interface LSPService {
  readonly initialize: (root: string) => Effect.Effect<void>
  readonly openDocument: (uri: string, languageId: string, text: string) => Effect.Effect<void>
  readonly changeDocument: (uri: string, text: string) => Effect.Effect<void>
  readonly closeDocument: (uri: string) => Effect.Effect<void>
  readonly diagnostics: (uri: string) => Effect.Effect<Diagnostic[]>
  readonly references: (uri: string, line: number, character: number) => Effect.Effect<Location[]>
  readonly definition: (uri: string, line: number, character: number) => Effect.Effect<Location | undefined>
  readonly documentSymbols: (uri: string) => Effect.Effect<SymbolInfo[]>
  readonly shutdown: () => Effect.Effect<void>
}

// ===== Context Tag =====

export class LSPServiceTag extends Context.Service<LSPServiceTag, LSPService>()("@miniopencode/LSP") {}

// ===== LSP 协议常量 =====

const LSP_METHODS = {
  initialize: "initialize",
  initialized: "initialized",
  textDocumentDidOpen: "textDocument/didOpen",
  textDocumentDidChange: "textDocument/didChange",
  textDocumentDidClose: "textDocument/didClose",
  textDocumentReferences: "textDocument/references",
  textDocumentDefinition: "textDocument/definition",
  textDocumentDocumentSymbol: "textDocument/documentSymbol",
  textDocumentPublishDiagnostics: "textDocument/publishDiagnostics",
  shutdown: "shutdown",
  exit: "exit",
} as const

// ===== 创建 LSP 连接 =====

const createConnection = (server: LSPServer): Effect.Effect<LSPConnection> =>
  Effect.sync(() => {
    const proc = Bun.spawn([server.command, ...server.args], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    })

    const pending = new Map<string | number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
    let requestId = 0
    const diagnosticsMap = new Map<string, Diagnostic[]>()

    // 读取 stdout
    const reader = proc.stdout?.getReader()
    if (reader) {
      const readLoop = async () => {
        const decoder = new TextDecoder()
        let buffer = ""
        let contentLength = 0
        let inHeaders = true
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            while (buffer.length > 0) {
              if (inHeaders) {
                const headerEnd = buffer.indexOf("\r\n\r\n")
                if (headerEnd === -1) break
                const header = buffer.slice(0, headerEnd)
                const lenMatch = header.match(/Content-Length:\s*(\d+)/i)
                contentLength = lenMatch ? parseInt(lenMatch[1], 10) : 0
                buffer = buffer.slice(headerEnd + 4)
                inHeaders = false
              } else {
                if (buffer.length < contentLength) break
                const content = buffer.slice(0, contentLength)
                buffer = buffer.slice(contentLength)
                inHeaders = true
                contentLength = 0

                try {
                  const msg = JSON.parse(content)
                  if ("id" in msg && ("result" in msg || "error" in msg)) {
                    const handler = pending.get(msg.id)
                    if (handler) {
                      pending.delete(msg.id)
                      if (msg.error) handler.reject(new Error(msg.error.message))
                      else handler.resolve(msg.result)
                    }
                  } else if ("method" in msg) {
                    if (msg.method === LSP_METHODS.textDocumentPublishDiagnostics) {
                      diagnosticsMap.set(msg.params.uri, msg.params.diagnostics)
                    }
                  }
                } catch {}
              }
            }
          }
        } catch {}
      }
      readLoop()
    }

    const send = (msg: unknown) => {
      const json = JSON.stringify(msg)
      const header = `Content-Length: ${Buffer.byteLength(json, "utf-8")}\r\n\r\n`
      try { proc.stdin?.write(header + json) } catch {}
    }

    const request = <T>(method: string, params?: unknown): Promise<T> =>
      new Promise((resolve, reject) => {
        const id = ++requestId
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        send({ jsonrpc: "2.0", id, method, params })
      })

    return {
      server,
      process: { stdin: proc.stdin!, stdout: proc.stdout! },
      requestId,
      pending,
      capabilities: {},
      send,
      request,
      diagnosticsMap,
    } as any
  })

// ===== Layer 实现 =====

export const LSPLive = Layer.effect(
  LSPServiceTag,
  Effect.gen(function* () {
    let conn: any = null

    const ensureConn = (root: string) =>
      Effect.gen(function* () {
        if (conn) return conn
        conn = yield* Effect.sync(() => {
          const c: any = { root }
          c.requestId = 0
          c.pending = new Map()
          c.diagnosticsMap = new Map()
          c.send = (msg: unknown) => {}
          c.request = <T>(method: string, params?: unknown): Promise<T> =>
            Promise.resolve(undefined as T)
          return c
        })
        return conn
      })

    return {
      initialize: (root: string) =>
        Effect.gen(function* () {
          log.info("initializing LSP", { root })
          conn = yield* createConnection({
            name: "typescript",
            languageId: "typescript",
            command: "typescript-language-server",
            args: ["--stdio"],
            root,
          })
          const result = yield* Effect.promise(() => conn.request("initialize", {
            processId: process.pid,
            rootUri: `file://${root}`,
            capabilities: {
              textDocument: {
                references: {},
                definition: {},
                documentSymbol: {},
                diagnostic: {},
              },
            },
          }))
          conn.capabilities = result.capabilities ?? {}
          conn.send({ jsonrpc: "2.0", method: "initialized" })
          log.info("LSP initialized", { caps: Object.keys(conn.capabilities) })
        }),

      openDocument: (uri: string, languageId: string, text: string) =>
        Effect.sync(() => {
          if (!conn) return
          conn.send({ jsonrpc: "2.0", method: LSP_METHODS.textDocumentDidOpen, params: {
            textDocument: { uri, languageId, version: 1, text },
          }})
        }),

      changeDocument: (uri: string, text: string) =>
        Effect.sync(() => {
          if (!conn) return
          conn.send({ jsonrpc: "2.0", method: LSP_METHODS.textDocumentDidChange, params: {
            textDocument: { uri, version: Date.now() },
            contentChanges: [{ text }],
          }})
        }),

      closeDocument: (uri: string) =>
        Effect.sync(() => {
          if (!conn) return
          conn.send({ jsonrpc: "2.0", method: LSP_METHODS.textDocumentDidClose, params: {
            textDocument: { uri },
          }})
        }),

      diagnostics: (uri: string) =>
        Effect.sync(() => conn?.diagnosticsMap?.get(uri) ?? []),

      references: (uri: string, line: number, character: number) =>
        Effect.promise(() => {
          if (!conn) return Promise.resolve([])
          return conn.request("textDocument/references", {
            textDocument: { uri },
            position: { line, character },
            context: { includeDeclaration: true },
          }).then((result: any) => result ?? [])
        }),

      definition: (uri: string, line: number, character: number) =>
        Effect.promise(() => {
          if (!conn) return Promise.resolve(undefined)
          return conn.request("textDocument/definition", {
            textDocument: { uri },
            position: { line, character },
          }).then((result: any) => {
            if (Array.isArray(result)) return result[0]
            return result
          })
        }),

      documentSymbols: (uri: string) =>
        Effect.promise(() => {
          if (!conn) return Promise.resolve([])
          return conn.request("textDocument/documentSymbol", {
            textDocument: { uri },
          }).then((result: any) => {
            if (!result) return []
            if (Array.isArray(result) && result[0]?.selectionRange) {
              return result.map((s: any) => ({
                name: s.name,
                kind: s.kind,
                location: { uri, range: s.range },
              }))
            }
            return []
          })
        }),

      shutdown: () =>
        Effect.sync(() => {
          if (!conn) return
          conn.send({ jsonrpc: "2.0", method: "shutdown", id: ++conn.requestId })
          conn.send({ jsonrpc: "2.0", method: "exit" })
          conn = null
        }),
    }
  }),
)
