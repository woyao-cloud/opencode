// ── CORS Configuration ──────────────────────────────────────────

export type CorsOptions = {
  allowedOrigins?: ReadonlyArray<string>
}

export class CorsConfig {
  constructor(readonly options?: CorsOptions) {}
}

export function isAllowedCorsOrigin(origin: string, corsOptions?: CorsOptions): boolean {
  if (!corsOptions?.allowedOrigins?.length) return false
  return corsOptions.allowedOrigins.some(
    (allowed) => allowed === "*" || allowed === origin,
  )
}
