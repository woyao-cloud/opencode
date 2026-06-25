/**
 * test/session.test.ts — Session 模块测试
 */

import { expect, test } from "bun:test"
import { compact, isOverflow } from "../src/session/compaction"
import { createPoint, revert } from "../src/session/revert"
import { summarize, estimateTokens } from "../src/session/summary"

// ===== Compaction =====

test("isOverflow returns false for small sessions", () => {
  expect(isOverflow(10)).toBe(false)
  expect(isOverflow(49)).toBe(false)
})

test("isOverflow returns true for large sessions", () => {
  expect(isOverflow(51)).toBe(true)
  expect(isOverflow(100)).toBe(true)
})

test("compact keeps recent messages when under limit", () => {
  const msgs = Array.from({ length: 10 }, (_, i) => `message-${i}`)
  const result = compact(msgs, (removed) => `removed ${removed.length}`)
  expect(result.messages.length).toBe(10)
  expect(result.result.removed).toBe(0)
})

test("compact removes middle messages when over limit", () => {
  const msgs = Array.from({ length: 60 }, (_, i) => `message-${i}`)
  const result = compact(msgs, (removed) => `removed ${removed.length}`)
  expect(result.messages.length).toBeLessThan(60)
  expect(result.result.removed).toBeGreaterThan(0)
})

// ===== Revert =====

test("createPoint creates a valid revert point", () => {
  const point = createPoint("session-1", 5, "test revert")
  expect(point.sessionId).toBe("session-1")
  expect(point.messageIndex).toBe(5)
  expect(point.description).toBe("test revert")
})

test("revert truncates messages to the point", () => {
  const msgs = ["a", "b", "c", "d", "e"]
  const point = createPoint("s1", 2, "revert to c")
  const result = revert(msgs, point)
  expect(result).toEqual(["a", "b", "c"])
})

test("revert handles out-of-range point", () => {
  const msgs = ["a", "b"]
  const point = createPoint("s1", 10, "beyond")
  const result = revert(msgs, point)
  expect(result).toEqual(msgs)
})

// ===== Summary =====

test("estimateTokens estimates token count", () => {
  expect(estimateTokens("hello world".length)).toBe(3)
  expect(estimateTokens(100)).toBe(25)
})

test("summarize generates session summary", () => {
  const messages = [
    { role: "user", content: "How do I use Effect-TS?" },
    { role: "assistant", content: "Effect-TS is a library for TypeScript..." },
  ]
  const summary = summarize("session-1", messages)
  expect(summary.sessionId).toBe("session-1")
  expect(summary.messageCount).toBe(2)
  expect(summary.tokenEstimate).toBeGreaterThan(0)
})
