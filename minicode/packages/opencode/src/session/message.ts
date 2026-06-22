import { SessionID } from "./id"
import { ascendingPartID } from "./schema"
import { Session } from "./session"
export function appendText(input: { sessionID: SessionID; role: "user" | "assistant" | "tool"; text: string }) {
  return (Session as any).appendMessage({ sessionID: input.sessionID, role: input.role, parts: [{ id: ascendingPartID(), type: "text", text: input.text }] })
}
export * as Message from "./message"
