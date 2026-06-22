import { Effect, Layer, Context } from "effect"
import * as Log from "@minicode/core/util/log"
import { createServer } from "node:http"
const log = Log.create({ service: "server" })
export interface Listener { hostname: string; port: number; url: URL }
export interface Interface { readonly listen: (opts: { port: number; hostname: string }) => Effect.Effect<Listener, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Server") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const listen = Effect.fn("Server.listen")(function* (opts: { port: number; hostname: string }) {
    log.info("starting server", { port: opts.port })
    return yield* Effect.tryPromise(async () => {
      return await new Promise<Listener>((resolve) => {
        const server = createServer(async (req, res) => {
          res.setHeader("Content-Type", "application/json")
          try {
            if (req.method === "POST" && req.url === "/session") { const body = await readBody(req); res.end(JSON.stringify({ status: "ok", received: JSON.parse(body || "{}") })); return }
            if (req.method === "GET" && req.url === "/session") { res.end(JSON.stringify([])); return }
            res.statusCode = 404; res.end(JSON.stringify({ error: "not found" }))
          } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) })) }
        })
        server.listen(opts.port, opts.hostname, () => { resolve({ hostname: opts.hostname, port: opts.port, url: new URL("http://" + opts.hostname + ":" + opts.port) }) })
      })
    })
  })
  return Service.of({ listen } as any)
}))
export const defaultLayer = layer
async function readBody(req: any): Promise<string> { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks).toString() }
export * as Server from "./server"
