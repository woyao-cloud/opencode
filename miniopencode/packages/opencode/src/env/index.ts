export const MINICODE_LOG_PRINT = process.env.MINICODE_LOG_PRINT === "1"
export const MINICODE_LOG_LEVEL = (process.env.MINICODE_LOG_LEVEL ?? "INFO") as "DEBUG" | "INFO" | "WARN" | "ERROR"
export const MINICODE_MODEL = process.env.MINICODE_MODEL

export * as Env from "./index"
