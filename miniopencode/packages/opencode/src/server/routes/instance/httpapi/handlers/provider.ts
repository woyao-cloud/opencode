// ── Provider Handlers ────────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ProviderService } from "@/provider/index"
import { InstanceHttpApi } from "../api"

export const providerHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "provider", (handlers: any) =>
  Effect.gen(function* () {
    const provider = yield* ProviderService

    handlers.handle("providerList", () =>
      Effect.succeed({})
    )

    handlers.handle("providerResolve", (request: any) =>
      Effect.gen(function* () {
        const query = request.query
        return yield* provider.resolve(query.model, query.provider)
      })
    )

    return handlers
  })
)
