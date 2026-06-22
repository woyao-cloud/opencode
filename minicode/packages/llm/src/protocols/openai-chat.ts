// minicode 只保留 OpenAI Chat 协议作为可运行示例。
// opencode 的 protocol 层做了 4 轴分解（Protocol/Endpoint/Auth/Framing），
// minicode 直接用 ai-sdk 的 openai()，这里仅保留一个标记模块。

export const Protocol = "openai-chat" as const
export type Protocol = typeof Protocol

export * as OpenAIChat from "./openai-chat"