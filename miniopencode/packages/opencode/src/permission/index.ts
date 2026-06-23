import { Effect, Context, Layer } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { ConfigService } from "@/config/config"
import { evaluate } from "./evaluate"
import type { Rule, Action } from "./schema"

const log = Log.create({ service: "permission" })

export interface PermissionShape {
  readonly evaluate: (pattern: string) => Action | undefined
  readonly request: (pattern: string) => Effect.Effect<Action, Error>
}

export class PermissionService extends Context.Service<PermissionService, PermissionShape>()("@miniopencode/Permission") {}

export const PermissionLive = Layer.effect(
  PermissionService,
  Effect.gen(function* () {
    const config = yield* ConfigService
    const rules: ReadonlyArray<Rule> = (config.config.permission?.rules ?? []).map((r) => ({
      pattern: r.pattern,
      action: r.deny ? "deny" as const : r.allow ? "allow" as const : "ask" as const,
    }))

    return {
      evaluate: (pattern: string) => {
        const result = evaluate(rules, pattern)
        log.debug("evaluate", { pattern, result })
        return result
      },
      request: (pattern: string) =>
        Effect.gen(function* () {
          const result = evaluate(rules, pattern)
          if (result === "allow") return "allow" as Action
          if (result === "deny") return "deny" as Action
          log.info("permission ask", { pattern })
          return "ask" as Action
        }),
    }
  }),
)
