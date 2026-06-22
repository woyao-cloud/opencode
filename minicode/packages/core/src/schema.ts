import { Schema } from "effect"

// 非负整数 brand，用于 Drizzle schema 与工具参数中常见的 ">=0" 约束。
// Effect v4 用 refine 替代 filter。
export const NonNegativeInt = Schema.Number.pipe(
  Schema.refine((n: number): n is number => Number.isInteger(n) && n >= 0, {
    message: "expected non-negative integer",
  }),
  Schema.brand("NonNegativeInt"),
)
export type NonNegativeInt = Schema.Schema.Type<typeof NonNegativeInt>

export const PositiveInt = Schema.Number.pipe(
  Schema.refine((n: number): n is number => Number.isInteger(n) && n > 0, {
    message: "expected positive integer",
  }),
  Schema.brand("PositiveInt"),
)
export type PositiveInt = Schema.Schema.Type<typeof PositiveInt>

export function optionalOmitUndefined<T>(schema: Schema.Schema<T>) {
  return Schema.optional(schema)
}

export type DeepMutable<T> = T extends ReadonlyArray<infer U>
  ? Array<DeepMutable<U>>
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T

export function withStatics<T>(fn: (s: T) => Record<string, unknown>) {
  return (self: T) => fn(self)
}

export * as Schema from "./schema"