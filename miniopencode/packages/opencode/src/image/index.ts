// ── Image Processing Service ──────────────────────────────
// Validate and process base64-encoded images from message attachments.

import { Effect, Context, Layer } from "effect"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "image" })

const MAX_BASE64_BYTES = 5 * 1024 * 1024
const MAX_WIDTH = 2000
const MAX_HEIGHT = 2000

export class InvalidDataUrlError {
  readonly _tag = "InvalidDataUrlError"
  constructor(readonly message: string) {}
}

export class SizeError {
  readonly _tag = "SizeError"
  constructor(readonly message: string) {}
}

export type Error = InvalidDataUrlError | SizeError

export interface ImageInfo {
  mime: string
  base64: string
  bytes: number
  url: string
}

export interface ImageShape {
  readonly parseDataUrl: (url: string) => Effect.Effect<ImageInfo, InvalidDataUrlError>
  readonly validateSize: (info: ImageInfo) => Effect.Effect<ImageInfo, SizeError>
  readonly normalize: (url: string) => Effect.Effect<string, Error>
}

export class ImageService extends Context.Service<ImageService, ImageShape>()("@miniopencode/Image") {}

export const makeImageService = (): ImageShape => ({
  parseDataUrl: (url) =>
    Effect.try({
      try: () => {
        if (!url.startsWith("data:") || !url.includes(";base64,")) {
          throw new Error("Image URL must be a base64 data URL")
        }
        const mimeMatch = url.match(/^data:([^;]+);/)
        const mime = mimeMatch ? mimeMatch[1] : "image/png"
        const base64 = url.slice(url.indexOf(";base64,") + ";base64,".length)
        const bytes = Buffer.byteLength(base64, "utf8")
        return { mime, base64, bytes, url }
      },
      catch: (err) => new InvalidDataUrlError(String(err)),
    }),

  validateSize: (info) =>
    Effect.try({
      try: () => {
        if (info.bytes <= MAX_BASE64_BYTES) return info
        throw new Error(`Base64 size ${info.bytes} exceeds max ${MAX_BASE64_BYTES} bytes`)
      },
      catch: (err) => new SizeError(String(err)),
    }),

  normalize: (url) =>
    Effect.gen(function* () {
      const parsed = yield* makeImageService().parseDataUrl(url)
      yield* makeImageService().validateSize(parsed)
      log.info("image normalized", { mime: parsed.mime, bytes: parsed.bytes })
      return parsed.url
    }),
})

export const ImageLive = Layer.succeed(ImageService, makeImageService())

export * as Image from "."
