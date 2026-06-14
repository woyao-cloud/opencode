/**
 * server/shared/pty-ticket - PTY 连接票据常量
 *
 * 功能概述：
 * - 定义 PTY 终端连接票据相关的查询参数与请求头常量
 *
 * 核心导出：
 * - PTY_CONNECT_TICKET_QUERY：票据查询参数名
 * - PTY_CONNECT_TOKEN_HEADER：票据请求头名
 * - PTY_CONNECT_TOKEN_HEADER_VALUE：票据请求头值
 *
 * 架构位置：被 PTY 相关路由与中间件引用
 */

export const PTY_CONNECT_TICKET_QUERY = "ticket"
export const PTY_CONNECT_TOKEN_HEADER = "x-opencode-ticket"
export const PTY_CONNECT_TOKEN_HEADER_VALUE = "1"

const PTY_CONNECT_PATH = /^\/pty\/[^/]+\/connect$/

// Auth middleware skips Basic Auth when this matches; the PTY connect handler
// is then responsible for validating the ticket.
export function isPtyConnectPath(pathname: string) {
  return PTY_CONNECT_PATH.test(pathname)
}

export function hasPtyConnectTicketURL(url: URL) {
  return isPtyConnectPath(url.pathname) && !!url.searchParams.get(PTY_CONNECT_TICKET_QUERY)
}
