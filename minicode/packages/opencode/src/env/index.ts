export const Env = {
  get MINICODE_HOME() { return process.env.MINICODE_HOME },
  get OPENAI_API_KEY() { return process.env.OPENAI_API_KEY },
  get MINICODE_LOG_LEVEL() { return process.env.MINICODE_LOG_LEVEL as "DEBUG" | "INFO" | "WARN" | "ERROR" | undefined },
  get MINICODE_LOG_PRINT() { return process.env.MINICODE_LOG_PRINT === "1" },
}
export * as Env from "./index"
