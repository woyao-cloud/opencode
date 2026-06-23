// ── JSON Schema Builder for Tool Parameters ─────────────────

export interface ParamDef {
  type: "string" | "number" | "boolean"
  description: string
  default?: unknown
}

export type ParamDefs = Record<string, ParamDef>

export interface JSONSchema {
  type: "object"
  properties: Record<string, { type: string; description: string; default?: unknown }>
  required?: string[]
  [key: string]: unknown
}

/**
 * Build a JSON Schema object from a parameter definitions record.
 * Fields without a `default` value are automatically added to `required`.
 */
export function toolSchema(params: ParamDefs): JSONSchema {
  const properties: Record<string, { type: string; description: string; default?: unknown }> = {}
  const required: string[] = []

  for (const [name, def] of Object.entries(params)) {
    properties[name] = {
      type: def.type,
      description: def.description,
    }
    if (def.default !== undefined) {
      properties[name].default = def.default
    } else {
      required.push(name)
    }
  }

  return {
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
  }
}

export * as ToolSchema from "./json-schema"
