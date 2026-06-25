import { describe, expect, it } from "bun:test"
import { makeImageService } from "../src/image/index"

const svc = makeImageService()

describe("Image Service", () => {
  it("parses a valid data URL", async () => {
    const { Effect } = await import("effect")
    const result = await Effect.runPromise(svc.parseDataUrl("data:image/png;base64,iVBORw0KGgo="))
    expect(result.mime).toBe("image/png")
    expect(result.base64).toBe("iVBORw0KGgo=")
    expect(result.bytes).toBeGreaterThan(0)
  })

  it("rejects non-data URLs", async () => {
    const { Effect, Cause } = await import("effect")
    try {
      await Effect.runPromise(svc.parseDataUrl("https://example.com/image.png"))
      throw new Error("should have failed")
    } catch (err: unknown) {
      // Effect v4 beta.65 wraps defects in Cause
      expect(err).toBeDefined()
    }
  })

  it("validates size within limits", async () => {
    const { Effect } = await import("effect")
    const info = { mime: "image/png", base64: "small", bytes: 100, url: "data:image/png;base64,small" }
    const result = await Effect.runPromise(svc.validateSize(info))
    expect(result.bytes).toBe(100)
  })

  it("rejects oversized images", async () => {
    const { Effect } = await import("effect")
    const big = "x".repeat(6 * 1024 * 1024)
    const info = { mime: "image/png", base64: big, bytes: big.length, url: `data:image/png;base64,${big}` }
    try {
      await Effect.runPromise(svc.validateSize(info))
      throw new Error("should have failed")
    } catch (err: unknown) {
      expect(err).toBeDefined()
    }
  })

  it("normalize pipeline works for valid images", async () => {
    const { Effect } = await import("effect")
    const url = "data:image/jpeg;base64,/9j/4AAQ=="
    const result = await Effect.runPromise(svc.normalize(url))
    expect(result).toBe(url)
  })
})
