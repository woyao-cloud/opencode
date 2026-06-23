import path from "path"

export function xdgBasedir(): string | undefined {
  const base = process.env.XDG_STATE_HOME || process.env.XDG_DATA_HOME || process.env.APPDATA
  if (base) return path.join(base, "miniopencode")
  return undefined
}
