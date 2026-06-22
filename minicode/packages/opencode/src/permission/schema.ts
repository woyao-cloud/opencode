import { Schema } from "effect"
export const PermissionID = Schema.String.pipe(Schema.brand("PermissionID"))
export type PermissionID = Schema.Schema.Type<typeof PermissionID>
