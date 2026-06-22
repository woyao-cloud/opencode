import { Schema } from "effect"
import { SessionID } from "./id"
export const MessageID = Schema.String.pipe(Schema.brand("MessageID"))
export type MessageID = Schema.Schema.Type<typeof MessageID>
export const PartID = Schema.String.pipe(Schema.brand("PartID"))
export type PartID = Schema.Schema.Type<typeof PartID>
export function ascendingMessageID(id?: string) { return MessageID.make("msg_" + (id ?? Math.random().toString(36).slice(2, 12))) }
export function ascendingPartID(id?: string) { return PartID.make("prt_" + (id ?? Math.random().toString(36).slice(2, 12))) }
