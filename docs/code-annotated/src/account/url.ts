/**
 * [account/url] - 账户服务器 URL 规范化工具
 * 功能概述：标准化账户服务器 URL（移除 query、hash、末尾斜杠）
 * 核心导出：normalizeServerUrl
 * 架构位置：utility layer，被 account.ts 和 repo.ts 依赖
 */

export const normalizeServerUrl = (input: string): string => {
  const url = new URL(input)
  url.search = ""
  url.hash = ""

  const pathname = url.pathname.replace(/\/+$/, "")
  return pathname.length === 0 ? url.origin : `${url.origin}${pathname}`
}
