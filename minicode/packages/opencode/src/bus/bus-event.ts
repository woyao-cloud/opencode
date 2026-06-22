import { Schema } from "effect"
export type Definition<Type extends string = string, Properties extends Schema.Top = Schema.Top> = { readonly type: Type; readonly properties: Properties }
export function define<Type extends string, Properties extends Schema.Top>(type: Type, properties: Properties): Definition<Type, Properties> { return { type, properties } }
export * as BusEvent from "./bus-event"
