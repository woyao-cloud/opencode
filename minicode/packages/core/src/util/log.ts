import path from "path"
import fs from "fs/promises"
import { createWriteStream } from "fs"
import { Path } from "../global"

export const Level = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const
export type Level = keyof typeof Level

let currentLevel: Level = "INFO"

function shouldLog(l: Level): boolean {
  return Level[l] >= Level[currentLevel]
}

export type Logger = {
  debug(message?: any, extra?: Record<string, any>): void
  info(message?: any, extra?: Record<string, any>): void
  warn(message?: any, extra?: Record<string, any>): void
  error(message?: any, extra?: Record<string, any>): void
  tag(key: string, value: string): Logger
  clone(): Logger
}

let write = (msg: string) => {
  process.stderr.write(msg)
  return msg.length
}

let logpath = ""
export function file() {
  return logpath
}

export async function init(options: { print?: boolean; level?: Level } = {}) {
  if (options.level) currentLevel = options.level
  if (options.print) return

  logpath = path.join(Path.log, `${new Date().toISOString().split(".")[0]?.replace(/:/g, "")}.log`)
  await fs.truncate(logpath).catch(() => {})
  const stream = createWriteStream(logpath, { flags: "a" })
  write = (msg: string) => stream.write(msg) ? msg.length : 0
}

const loggers = new Map<string, Logger>()

function formatError(error: Error, depth = 0): string {
  return error.cause instanceof Error && depth < 10
    ? error.message + " Caused by: " + formatError(error.cause, depth + 1)
    : error.message
}

let last = Date.now()

export function create(tags: Record<string, any> = {}): Logger {
  const service = tags["service"]
  const nocache = tags["_nocache"]
  if (service && typeof service === "string" && !nocache) {
    const cached = loggers.get(service)
    if (cached) return cached
  }

  const build = (message: any, extra?: Record<string, any>) => {
    const prefix = Object.entries({ ...tags, ...extra })
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => {
        if (v instanceof Error) return `${k}=${formatError(v)}`
        if (typeof v === "object") return `${k}=${JSON.stringify(v)}`
        return `${k}=${v}`
      })
      .join(" ")
    const now = new Date()
    const diff = now.getTime() - last
    last = now.getTime()
    return [now.toISOString().split(".")[0], `+${diff}ms`, prefix, message].filter(Boolean).join(" ") + "\n"
  }

  const result: Logger = {
    debug(m, e) { if (shouldLog("DEBUG")) write("DEBUG " + build(m, e)) },
    info(m, e) { if (shouldLog("INFO")) write("INFO  " + build(m, e)) },
    warn(m, e) { if (shouldLog("WARN")) write("WARN  " + build(m, e)) },
    error(m, e) { if (shouldLog("ERROR")) write("ERROR " + build(m, e)) },
    tag(k, v) { (tags ??= {})[k] = v; return result },
    clone() { return create({ ...tags, _nocache: true }) },
  }

  if (service && typeof service === "string" && !nocache) loggers.set(service, result)
  return result
}

export const Default = create({ service: "default" })

export * as Log from "./log"