import { Effect } from "effect"
import * as Log from "@minicode/core/util/log"
import { AppRuntime, init } from "../bootstrap"
import * as Server from "@/server/server"
const log = Log.create({ service: "cli.serve" })
export async function serveCommand(opts: { port?: number; hostname?: string }) {
  await init()
  const port = opts.port ?? 4096
  const hostname = opts.hostname ?? "localhost"
  await AppRuntime.runPromise(Effect.gen(function* () {
    const server = yield* Server.Service as any
    const listener = yield* server.listen({ port, hostname })
    log.info("server listening", { url: listener.url.toString() })
    console.log("minicode server listening on " + listener.url)
    yield* Effect.never
  }))
}
