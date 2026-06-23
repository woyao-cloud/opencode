import { mkdirSync, appendFileSync } from "fs"
import path from "path"
import { Path } from "../global"

export type Level = "DEBUG" | "INFO" | "WARN" | "ERROR"

let _print = false
let _level: Level = "INFO"
let _logFile: string | undefined

export async function init(opts: { print?: boolean; level?: Level }) {
  _print = opts.print ?? false
  _level = opts.level ?? "INFO"
  mkdirSync(Path.log, { recursive: true })
  _logFile = path.join(Path.log, `miniopencode-${new Date().toISOString().slice(0, 10)}.log`)
}

export function file(): string | undefined { return _logFile }

function shouldLog(level: Level): boolean {
  const levels: Level[] = ["DEBUG", "INFO", "WARN", "ERROR"]
  return levels.indexOf(level) >= levels.indexOf(_level)
}

function write(level: Level, service: string, msg: string, data?: Record<string, unknown>) {
  if (!shouldLog(level)) return
  const time = new Date().toISOString()
  const line = `${time} [${level}] [${service}] ${msg}${data ? " " + JSON.stringify(data) : ""}`
  if (_print) process.stderr.write(line + "\n")
  if (_logFile) appendFileSync(_logFile, line + "\n")
}

export function create(opts: { service: string }) {
  const service = opts.service
  return {
    debug: (msg: string, data?: Record<string, unknown>) => write("DEBUG", service, msg, data),
    info: (msg: string, data?: Record<string, unknown>) => write("INFO", service, msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => write("WARN", service, msg, data),
    error: (msg: string, data?: Record<string, unknown>) => write("ERROR", service, msg, data),
  }
}

export const Default = create({ service: "miniopencode" })

export * as Log from "./log"
