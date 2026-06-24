import { Effect, Context, Schema } from "effect"
import { checkToolPermission } from "@/permission/evaluate"

// ── Tool Types ─────────────────────────────────────────────

export interface ExecuteResult {
  title: string
  output: string
  metadata?: Record<string, unknown>
}

export interface ToolContext {
  sessionID?: string
  messageID?: string
  agent?: string
  agentPermissions?: ReadonlyArray<string>
  abort?: AbortSignal
  extra?: Record<string, unknown>
}

export interface Def<Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>> {
  id: string
  description: string
  parameters: Parameters
  execute(args: Schema.Schema.Type<Parameters>, ctx: ToolContext): Effect.Effect<ExecuteResult, never, any>
}

export type DefWithoutID<Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>> =
  Omit<Def<Parameters>, "id">

export interface Info<Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>> {
  id: string
  init: () => Effect.Effect<DefWithoutID<Parameters>, never, any>
}

// ── Tool Definition Helpers ─────────────────────────────────

export function define<Parameters extends Schema.Decoder<unknown>, R = never>(
  id: string,
  init: Effect.Effect<DefWithoutID<Parameters>, never, R>,
): Effect.Effect<Info<Parameters>, never, R> {
  return Effect.gen(function* () {
    const resolved = yield* init
    return { id, init: () => Effect.succeed(resolved) }
  })
}

export function init<Parameters extends Schema.Decoder<unknown>>(
  info: Info<Parameters>,
): Effect.Effect<Def<Parameters>, never, any> {
  return Effect.gen(function* () {
    const d = yield* info.init()
    return { ...d, id: info.id }
  })
}

// ── Tool Runtime Service ───────────────────────────────────

export interface ToolRuntimeShape {
  readonly tools: () => ReadonlyArray<Info<any>>
  readonly get: (name: string) => Info<any> | undefined
  readonly execute: (name: string, args: Record<string, unknown>, ctx?: ToolContext) => Effect.Effect<string>
  readonly toAITools: () => Record<string, {
    description: string
    parameters: Record<string, unknown>
    execute: (args: Record<string, unknown>) => Promise<string>
  }>
}

export class ToolRuntimeService extends Context.Service<ToolRuntimeService, ToolRuntimeShape>()("@miniopencode/ToolRuntime") {}

// ── Make Runtime ───────────────────────────────────────────

export function makeRuntime(toolInfos: ReadonlyArray<Info<any>>): ToolRuntimeShape {
  const toolMap = new Map<string, Info<any>>()
  for (const info of toolInfos) {
    toolMap.set(info.id, info)
  }

  // Init defs lazily - first tool execution triggers init.
  // Eager init via Effect.runSync only works for tools without Effect dependencies.
  const defPromises = new Map<string, Effect.Effect<Def<any>, never, any>>()

  function ensureDef(name: string): Effect.Effect<Def<any>, never, any> {
    const cached = defPromises.get(name)
    if (cached) return cached

    const info = toolMap.get(name)
    if (!info) return Effect.die(new Error(`Tool not found: ${name}`))

    // Try eager init first (for tools without Effect deps), fall back to lazy
    const def = Effect.gen(function* () {
      const d = yield* init(info)
      return d as Def<any>
    })

    defPromises.set(name, def)
    return def
  }

  function run(name: string, args: Record<string, unknown>, ctx?: ToolContext): Effect.Effect<string> {
    // Permission check before execution
    const permissionAction = ctx?.agentPermissions
      ? checkToolPermission(name, ctx.agentPermissions)
      : undefined
    if (permissionAction === "deny") {
      return Effect.succeed(`Error: Permission denied — tool "${name}" is not allowed by current agent configuration.`)
    }

    return ensureDef(name).pipe(
      Effect.flatMap((def) => {
        const decode = Schema.decodeUnknownEffect(def.parameters)
        return decode(args).pipe(
          Effect.mapError((e) => new Error(`Invalid args for ${name}: ${e}`)),
          Effect.orDie,
          Effect.flatMap((decoded) => def.execute(decoded, ctx ?? {})),
          Effect.map((r) => r.output),
        )
      }),
    ) as Effect.Effect<string>
  }

  function toAI(): Record<string, {
    description: string
    parameters: Record<string, unknown>
    execute: (args: Record<string, unknown>) => Promise<string>
  }> {
    const result: Record<string, any> = {}
    const seen = new Set<string>()

    // Only expose tools that can be eagerly initialized (no Effect deps)
    for (const info of toolInfos) {
      try {
        const def: Def<any> = Effect.runSync(init(info) as Effect.Effect<Def<any>>)
        result[def.id] = {
          description: def.description,
          parameters: (Schema.toJsonSchemaDocument(def.parameters) as any).schema as Record<string, unknown>,
          execute: async (rawArgs: Record<string, unknown>) => {
            const decode = Schema.decodeUnknownEffect(def.parameters)
            const decoded = Effect.runSync(decode(rawArgs).pipe(Effect.orDie) as any)
            const execResult: any = Effect.runSync(def.execute(decoded, {}).pipe(Effect.orDie) as any)
            return execResult.output
          },
        }
        seen.add(def.id)
      } catch {
        // Tool has Effect deps — skip for toAI (used via task tool inside runtime)
      }
    }
    return result
  }

  return {
    tools: () => [...toolInfos],
    get: (name: string) => toolMap.get(name),
    execute: run,
    toAITools: toAI,
  }
}

export * as Tool from "./tool"
