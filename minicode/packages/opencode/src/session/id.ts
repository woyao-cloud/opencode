import { Schema } from "effect"
export const SessionID = Schema.String.pipe(Schema.brand("SessionID"))
export type SessionID = Schema.Schema.Type<typeof SessionID>
export function ascendingSessionID(id?: string) { return SessionID.make("ses_" + (id ?? Math.random().toString(36).slice(2, 12))) }
