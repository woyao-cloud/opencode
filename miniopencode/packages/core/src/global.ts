import path from "path"
import { xdgBasedir } from "./util/xdg-basedir"

export const Path = {
  get home() { return xdgBasedir() ?? path.join(process.env.HOME || process.env.USERPROFILE || "/tmp", ".miniopencode") },
  get share() { return path.join(this.home, "share") },
  get state() { return path.join(this.home, "state") },
  get tmp() { return path.join(this.home, "tmp") },
  get db() { return path.join(this.home, "state", "miniopencode.db") },
  get log() { return path.join(this.home, "log") },
}

export * as Global from "./global"
