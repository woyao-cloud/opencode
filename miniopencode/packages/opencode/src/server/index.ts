// ── HTTP Server — Session API via Bun.serve() ────────────────
// Lightweight REST server for managing sessions through HTTP.
// Endpoints:
//   GET    /sessions          — list sessions
//   GET    /sessions/:id      — get session + messages
//   POST   /sessions          — create new session
//   POST   /sessions/:id/prompt — run a prompt on a session
//   DELETE /sessions/:id      — delete session
//   GET    /health            — health check

import { Effect } from "effect"
import { SessionService, SessionStatusService } from "@/session/index"

export interface ServeOptions {
  readonly port: number
  readonly host?: string
  readonly runEffect: (effect: any) => Promise<any>
}

export async function startServer(opts: ServeOptions): Promise<any> {
  const { port, host = "127.0.0.1", runEffect } = opts

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
      const url = new URL(req.url)
      const method = req.method
      const path = url.pathname

      try {
        // ── Health ──────────────────────────────────────────
        if (path === "/health" && method === "GET") {
          return Response.json({ status: "ok", uptime: process.uptime() })
        }

        // ── GET /sessions ───────────────────────────────────
        if (path === "/sessions" && method === "GET") {
          const limit = url.searchParams.get("limit")
          const sessions = await runEffect(
            SessionService.use((svc) => svc.list(limit ? parseInt(limit) : undefined)),
          )
          return Response.json(sessions)
        }

        // ── POST /sessions ──────────────────────────────────
        if (path === "/sessions" && method === "POST") {
          const body = await req.json().catch(() => ({}))
          const session = await runEffect(
            SessionService.use((svc) => svc.create({
              title: body.title,
              agentId: body.agentId,
              modelId: body.modelId,
            })),
          )
          return Response.json(session, { status: 201 })
        }

        // ── GET /sessions/:id ───────────────────────────────
        const sessionMatch = path.match(/^\/sessions\/([^/]+)$/)
        if (sessionMatch && method === "GET") {
          const id = sessionMatch[1]
          const session = await runEffect(SessionService.use((svc) => svc.get(id)))
          if (!session) return new Response("Session not found", { status: 404 })
          const messages = await runEffect(SessionService.use((svc) => svc.getMessages(id)))

          const status = await runEffect(
            SessionStatusService.use((svc) => svc.get(id)),
          )

          return Response.json({ ...session, messages, runtimeStatus: status })
        }

        // ── DELETE /sessions/:id ────────────────────────────
        if (sessionMatch && method === "DELETE") {
          const id = sessionMatch[1]
          await runEffect(SessionService.use((svc) => svc.delete(id)))
          return new Response(null, { status: 204 })
        }

        // ── POST /sessions/:id/prompt ───────────────────────
        const promptMatch = path.match(/^\/sessions\/([^/]+)\/prompt$/)
        if (promptMatch && method === "POST") {
          const id = promptMatch[1]
          const body = await req.json().catch(() => ({}))
          const prompt = body.prompt
          if (!prompt) return new Response("Missing 'prompt' field", { status: 400 })

          const result = await runEffect(
            Effect.gen(function* () {
              const session = yield* SessionService.use((svc) => svc.get(id))
              if (!session) return null
              yield* SessionService.use((svc) => svc.updateStatus(id, "running"))
              return { text: `[server] received prompt: ${prompt}. (Session: ${id})` }
            }),
          )

          if (!result) return new Response("Session not found", { status: 404 })
          return Response.json(result)
        }

        return new Response("Not found", { status: 404 })
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }
    },
  })

  console.log(`Server listening on http://${host}:${port}`)
  return server
}

export * as Server from "./index"
