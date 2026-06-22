import path from "path"
import os from "os"
import fs from "fs/promises"
import { Context, Effect, Layer } from "effect"

// minicode 的所有持久化路径都挂在 ~/.minicode 下，便于学习时观察。
const app = "minicode"
const home: string = process.env.MINICODE_HOME ?? os.homedir()
const data = path.join(home, `.${app}`)
const cache = path.join(home, ".cache", app)
const config = path.join(home, ".config", app)
const state = path.join(home, ".local", "state", app)
const tmp = path.join(os.tmpdir(), app)

export const Path = {
  home,
  data,
  cache,
  config,
  state,
  tmp,
  log: path.join(data, "log"),
  bin: path.join(cache, "bin"),
  session: path.join(data, "session"),
  db: path.join(data, "minicode.db"),
}

// 启动时确保关键目录存在。opencode 用 await Promise.all 在模块顶层执行；
// minicode 沿用同样风格，但只在首次 import 时触发一次。
void Promise.all([
  fs.mkdir(Path.data, { recursive: true }),
  fs.mkdir(Path.config, { recursive: true }),
  fs.mkdir(Path.state, { recursive: true }),
  fs.mkdir(Path.tmp, { recursive: true }),
  fs.mkdir(Path.log, { recursive: true }),
  fs.mkdir(Path.session, { recursive: true }),
])

export interface Interface {
  readonly home: string
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
  readonly log: string
  readonly bin: string
  readonly session: string
  readonly db: string
}

export function make(input: Partial<Interface> = {}): Interface {
  return {
    home: Path.home,
    data: Path.data,
    cache: Path.cache,
    config: Path.config,
    state: Path.state,
    tmp: Path.tmp,
    log: Path.log,
    bin: Path.bin,
    session: Path.session,
    db: Path.db,
    ...input,
  }
}

export class Service extends Context.Service<Service, Interface>()("@minicode/Global") {}

export const layer = Layer.effect(Service, Effect.sync(() => Service.of(make())))

export const defaultLayer = layer

export const layerWith = (input: Partial<Interface>) =>
  Layer.effect(Service, Effect.sync(() => Service.of(make(input))))

export * as Global from "./global"