export function create(length: number = 12): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  for (let i = 0; i < length; i++) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}

export * as Slug from "./slug"
