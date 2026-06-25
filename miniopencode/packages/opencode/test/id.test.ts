import { describe, expect, it } from "bun:test"
import { makeId, idTimestamp, sessionId, messageId, jobId } from "../src/id/index"

describe("ID generation", () => {
  it("generates IDs with correct prefix", () => {
    const id = sessionId()
    expect(id.startsWith("ses_")).toBe(true)
  })

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => sessionId()))
    expect(ids.size).toBe(100)
  })

  it("message IDs have correct prefix", () => {
    expect(messageId().startsWith("msg_")).toBe(true)
  })

  it("job IDs have correct prefix", () => {
    expect(jobId().startsWith("job_")).toBe(true)
  })

  it("makeId works with custom prefix", () => {
    const id = makeId("test")
    expect(id.startsWith("test_")).toBe(true)
  })

  it("idTimestamp extracts timestamp", () => {
    const before = Date.now()
    const id = sessionId()
    const after = Date.now()
    const ts = idTimestamp(id)
    expect(ts).toBeGreaterThanOrEqual(before - 1000)
    expect(ts).toBeLessThanOrEqual(after + 1000)
  })

  it("idTimestamp returns 0 for invalid IDs", () => {
    expect(idTimestamp("invalid")).toBe(0)
  })

  it("IDs are sortable by creation time", () => {
    const ids = Array.from({ length: 5 }, () => sessionId())
    for (let i = 1; i < ids.length; i++) {
      expect(idTimestamp(ids[i])).toBeGreaterThanOrEqual(idTimestamp(ids[i - 1]))
    }
  })
})
