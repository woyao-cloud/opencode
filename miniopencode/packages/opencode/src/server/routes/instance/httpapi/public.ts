// ── Public API — OpenAPI annotations ────────────────────────────

import { OpenApi } from "effect/unstable/httpapi"
import { MiniOpenCodeHttpApi } from "./api"

export const PublicApi = MiniOpenCodeHttpApi.annotateMerge(
  OpenApi.annotations({
    title: "miniopencode",
    version: "1.0.0",
    description: "miniopencode api",
  }),
)
