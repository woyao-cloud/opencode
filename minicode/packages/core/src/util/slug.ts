// 极简 slug 生成：把任意字符串转为 URL 友好的 slug。
export function create(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "session"
}

export * as Slug from "./slug"