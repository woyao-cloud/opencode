import { Effect, Context, Schema } from "effect"

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
  abort?: AbortSignal
}

export interface Def<Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>> {
  id: string
  description: string
  parameters: Parameters
  execute(args: Schema.Schema.Type<Parameters>, ctx: ToolContext): Effect.Effect<ExecuteResult>
}

export type DefWithoutID<Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>> =
  Omit<Def<Parameters>, "id">

export interface Info<Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>> {
  id: string
  init: () => Effect.Effect<DefWithoutID<Parameters>>
}

// ── Tool Definition Helpers ─────────────────────────────────

export function define<Parameters extends Schema.Decoder<unknown>>(
  id: string,
  init: Effect.Effect<DefWithoutID<Parameters>>,
): Effect.Effect<Info<Parameters>> {
  return Effect.gen(function* () {
    const resolved = yield* init
    return { id, init: () => Effect.succeed(resolved) }
  })
}

export function init<Parameters extends Schema.Decoder<unknown>>(
  info: Info<Parameters>,
): Effect.Effect<Def<Parameters>> {
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

  // Eagerly init all tools — they have no Effect dependencies, so runSync is safe.
  const defs = new Map<string, Def<any>>()
  for (const info of toolInfos) {
    const def = Effect.runSync(init(info))
    defs.set(def.id, def)
  }

  function run(name: string, args: Record<string, unknown>, ctx?: ToolContext): Effect.Effect<string> {
    const def = defs.get(name)
    if (!def) return Effect.die(new Error(`Tool not found: ${name}`)) as any
    const decode = Schema.decodeUnknownEffect(def.parameters)
    return decode(args).pipe(
      Effect.mapError((e) => new Error(`Invalid args for ${name}: ${e}`)),
      Effect.orDie,
      Effect.flatMap((decoded) => def.execute(decoded, ctx ?? {})),
      Effect.map((r) => r.output),
    ) as any
  }

  function toAI(): Record<string, {
    description: string
    parameters: Record<string, unknown>
    execute: (args: Record<string, unknown>) => Promise<string>
  }> {
    const result: Record<string, any> = {}
    for (const [name, def] of defs) {
      result[name] = {
        description: def.description,
        parameters: (Schema.toJsonSchemaDocument(def.parameters) as any).schema as Record<string, unknown>,
        execute: async (rawArgs: Record<string, unknown>) => {
          const decode = Schema.decodeUnknownEffect(def.parameters)
          const decoded = Effect.runSync(decode(rawArgs).pipe(Effect.orDie) as any)
          const execResult: any = Effect.runSync(def.execute(decoded, {}).pipe(Effect.orDie) as any)
          return execResult.output
        },
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
