import { Effect, JsonSchema, Schema } from "effect"
import { ToolDefinition } from "./schema/messages"

// 工具参数与返回值的 Schema 约束：不允许带服务依赖。
export type ToolSchema<T> = Schema.Codec<T, any, never, never>

export interface ToolExecuteContext {
  readonly id: string
  readonly name: string
}

export type ToolExecute<P, S> = (
  params: Schema.Schema.Type<P>,
  ctx?: ToolExecuteContext,
) => Effect.Effect<Schema.Schema.Type<S>, Error>

export interface Tool<P extends ToolSchema<any> = ToolSchema<any>, S extends ToolSchema<any> = ToolSchema<any>> {
  readonly description: string
  readonly parameters: P
  readonly success: S
  readonly execute?: ToolExecute<P, S>
  readonly _decode: (input: unknown) => Effect.Effect<Schema.Schema.Type<P>, Schema.SchemaError>
  readonly _encode: (value: Schema.Schema.Type<S>) => Effect.Effect<unknown, Schema.SchemaError>
  readonly _definition: ToolDefinition
}

export type AnyTool = Tool<ToolSchema<any>, ToolSchema<any>>

export function make<P extends ToolSchema<any>, S extends ToolSchema<any>>(config: {
  description: string
  parameters: P
  success: S
  execute?: ToolExecute<P, S>
}): Tool<P, S> {
  return {
    description: config.description,
    parameters: config.parameters,
    success: config.success,
    execute: config.execute,
    _decode: Schema.decodeUnknownEffect(config.parameters),
    _encode: Schema.encodeEffect(config.success),
    _definition: new ToolDefinition({
      name: "",
      description: config.description,
      inputSchema: toJsonSchema(config.parameters),
    }),
  }
}

export const tool = make

export type Tools = Record<string, AnyTool>

export const toDefinitions = (tools: Tools): ReadonlyArray<ToolDefinition> =>
  Object.entries(tools).map(([name, t]) =>
    new ToolDefinition({
      name,
      description: t._definition.description,
      inputSchema: t._definition.inputSchema,
    }),
  )

function toJsonSchema(schema: Schema.Top): JsonSchema.JsonSchema {
  const doc = Schema.toJsonSchemaDocument(schema)
  if (Object.keys(doc.definitions).length === 0) return doc.schema
  return { ...doc.schema, $defs: doc.definitions }
}

export * as Tool from "./tool"