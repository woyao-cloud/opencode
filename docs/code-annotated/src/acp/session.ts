/**
 * acp/session - ACP 会话管理器
 *
 * 功能概述：
 * - 管理 ACP 会话的生命周期状态（创建、加载、获取、设置、移除）
 * - 跟踪每个会话的模型、变体（effort）、模式等配置
 * - 通过 SDK 在 OpenCode 中创建和加载底层会话
 *
 * 核心导出：
 * - ACPSessionManager：ACP 会话管理器类
 *
 * 架构位置：ACP 协议实现的会话管理层，依赖 OpenCode SDK 和 types 中定义的会话状态接口
 */

import { RequestError, type McpServer } from "@agentclientprotocol/sdk"
import type { ACPSessionState } from "./types"
import * as Log from "@opencode-ai/core/util/log"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"

const log = Log.create({ service: "acp-session-manager" })

export class ACPSessionManager {
  private sessions = new Map<string, ACPSessionState>()
  private sdk: OpencodeClient

  constructor(sdk: OpencodeClient) {
    this.sdk = sdk
  }

  /**
   * 尝试获取会话状态，不存在时返回 undefined（不抛异常）
   */
  tryGet(sessionId: string): ACPSessionState | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * 创建新会话：通过 SDK 创建底层会话并记录 ACP 会话状态
   */
  async create(cwd: string, mcpServers: McpServer[], model?: ACPSessionState["model"]): Promise<ACPSessionState> {
    const session = await this.sdk.session
      .create(
        {
          directory: cwd,
        },
        { throwOnError: true },
      )
      .then((x) => x.data!)

    const sessionId = session.id
    const resolvedModel = model

    const state: ACPSessionState = {
      id: sessionId,
      cwd,
      mcpServers,
      createdAt: new Date(),
      model: resolvedModel,
    }
    log.info("creating_session", { state })

    this.sessions.set(sessionId, state)
    return state
  }

  /**
   * 加载已有会话：通过 SDK 获取会话信息并记录 ACP 会话状态
   */
  async load(
    sessionId: string,
    cwd: string,
    mcpServers: McpServer[],
    model?: ACPSessionState["model"],
  ): Promise<ACPSessionState> {
    const session = await this.sdk.session
      .get(
        {
          sessionID: sessionId,
          directory: cwd,
        },
        { throwOnError: true },
      )
      .then((x) => x.data!)

    const resolvedModel = model

    const state: ACPSessionState = {
      id: sessionId,
      cwd,
      mcpServers,
      createdAt: new Date(session.time.created),
      model: resolvedModel,
    }
    log.info("loading_session", { state })

    this.sessions.set(sessionId, state)
    return state
  }

  /**
   * 获取会话状态，不存在时抛异常
   */
  get(sessionId: string): ACPSessionState {
    const session = this.sessions.get(sessionId)
    if (!session) {
      log.error("session not found", { sessionId })
      throw RequestError.invalidParams(JSON.stringify({ error: `Session not found: ${sessionId}` }))
    }
    return session
  }

  /** 获取会话的模型配置 */
  getModel(sessionId: string) {
    const session = this.get(sessionId)
    return session.model
  }

  /** 设置会话的模型配置 */
  setModel(sessionId: string, model: ACPSessionState["model"]) {
    const session = this.get(sessionId)
    session.model = model
    this.sessions.set(sessionId, session)
    return session
  }

  /** 获取会话的变体（effort 等级） */
  getVariant(sessionId: string) {
    const session = this.get(sessionId)
    return session.variant
  }

  /** 设置会话的变体（effort 等级） */
  setVariant(sessionId: string, variant?: string) {
    const session = this.get(sessionId)
    session.variant = variant
    this.sessions.set(sessionId, session)
    return session
  }

  /** 设置会话的模式（Agent） */
  setMode(sessionId: string, modeId: string) {
    const session = this.get(sessionId)
    session.modeId = modeId
    this.sessions.set(sessionId, session)
    return session
  }

  /**
   * 移除并返回会话状态（用于关闭会话时清理）
   */
  remove(sessionId: string): ACPSessionState | undefined {
    const session = this.sessions.get(sessionId)
    this.sessions.delete(sessionId)
    return session
  }
}
