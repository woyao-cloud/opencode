// ── File Handlers ───────────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { FileService } from "@/file"
import { InstanceHttpApi } from "../api"

export const fileHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "file", (handlers: any) =>
  Effect.gen(function* () {
    const file = yield* FileService

    handlers.handle("fileRead", (request: any) =>
      file.read(request.query.path)
    )

    handlers.handle("fileWrite", (request: any) =>
      file.write(request.payload.path, request.payload.content)
    )

    handlers.handle("fileExists", (request: any) =>
      file.exists(request.query.path)
    )

    return handlers
  })
)
