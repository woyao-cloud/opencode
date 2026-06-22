import { describe, expect, it } from "bun:test"
import { create } from "@minicode/core/util/slug"

describe("opencode/util", () => {
  it("slug works", () => {
    expect(create("Hello World")).toBe("hello-world")
  })
})