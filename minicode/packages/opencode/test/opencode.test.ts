import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { Slug } from "@minicode/core/util/slug"
import { create } from "@minicode/core/util/slug"

describe("opencode/util", () => {
  it("slug works", () => {
    expect(create("Hello World")).toBe("hello-world")
  })
})

describe("opencode/permission", () => {
  it("fromConfig converts map to ruleset", async () => {
    const { Permission } = await import("@/permission")
    const ruleset = Permission.fromConfig({ "*": "allow", "read:*.env": "ask" })
    expect(ruleset.length).toBe(2)
    expect(ruleset[0].action).toBe("allow")
  })
})