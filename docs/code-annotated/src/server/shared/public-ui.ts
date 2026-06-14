/**
 * server/shared/public-ui - 公开 UI 静态资源列表
 *
 * 功能概述：
 * - 定义无需认证即可访问的静态 UI 资源路径
 *
 * 核心导出：
 * - 公开资源路径列表
 *
 * 架构位置：被公共路由中间件引用，跳过认证检查
 */

// Static UI assets the browser fetches without app-managed credentials, e.g.
// the manifest link in <head>. These bypass auth so the page can install/render
// the manifest icons even when a server password is configured.
export const PUBLIC_UI_PATHS = new Set<string>([
  "/site.webmanifest",
  "/web-app-manifest-192x192.png",
  "/web-app-manifest-512x512.png",
])

export function isPublicUIPath(method: string, pathname: string) {
  return method === "GET" && PUBLIC_UI_PATHS.has(pathname)
}
