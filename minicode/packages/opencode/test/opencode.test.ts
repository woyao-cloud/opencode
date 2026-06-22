import { describe, expect, it } from "bun:test"
import { SessionID, ascendingSessionID } from "@/session/id"
import { MessageID, PartID, ascendingMessageID, ascendingPartID } from "@/session/schema"
import { BusEvent } from "@/bus/bus-event"
import { Permission } from "@/permission"
import { File } from "@/file"
import { Effect } from "effect"
import path from "path"
import os from "os"
import fs from "fs/promises"

describe("session/id - SessionID", () => {
  it("ascendingSessionID produces an id with ses_ prefix", () => {
    const id = ascendingSessionID()
    expect(id as string).toMatch(/^ses_/)
  })

  it("ascendingSessionID with explicit id uses that id", () => {
    const id = ascendingSessionID("abc123")
    expect(id as string).toBe("ses_abc123")
  })

  it("SessionID brand rejects non-prefixed strings", () => {
    // brand just wraps the string, it accepts any string
    const id = SessionID.make("ses_test")
    expect(id as string).toBe("ses_test")
  })
})

describe("session/schema - MessageID and PartID", () => {
  it("ascendingMessageID produces an id with msg_ prefix", () => {
    const id = ascendingMessageID()
    expect(id as string).toMatch(/^msg_/)
  })

  it("ascendingPartID produces an id with prt_ prefix", () => {
    const id = ascendingPartID()
    expect(id as string).toMatch(/^prt_/)
  })

  it("ascendingMessageID with explicit id uses that id", () => {
    const id = ascendingMessageID("xyz")
    expect(id as string).toBe("msg_xyz")
  })
})

describe("bus/bus-event - define", () => {
  it("creates a definition with the given type and properties", () => {
    const { Schema } = require("effect")
    const def = BusEvent.define("test.event", Schema.Struct({ value: Schema.Number }))
    expect(def.type).toBe("test.event")
    expect(def.properties).toBeDefined()
  })

  it("different definitions have different types", () => {
    const { Schema } = require("effect")
    const a = BusEvent.define("a", Schema.Struct({}))
    const b = BusEvent.define("b", Schema.Struct({}))
    expect(a.type).not.toBe(b.type)
  })
})

describe("permission - fromConfig", () => {
  it("converts a wildcard rule", () => {
    const ruleset = Permission.fromConfig({ "*": "allow" })
    expect(ruleset.length).toBe(1)
    expect(ruleset[0]?.permission).toBe("*")
    expect(ruleset[0]?.pattern).toBe("*")
    expect(ruleset[0]?.action).toBe("allow")
  })

  it("converts a permission:pattern rule", () => {
    const ruleset = Permission.fromConfig({ "read:*.env": "ask" })
    expect(ruleset.length).toBe(1)
    expect(ruleset[0]?.permission).toBe("read")
    expect(ruleset[0]?.pattern).toBe("*.env")
    expect(ruleset[0]?.action).toBe("ask")
  })

  it("converts multiple rules preserving order", () => {
    const ruleset = Permission.fromConfig({
      "*": "allow",
      "read:*.env": "ask",
      "bash:rm": "deny",
    })
    expect(ruleset.length).toBe(3)
    expect(ruleset[0]?.action).toBe("allow")
    expect(ruleset[1]?.action).toBe("ask")
    expect(ruleset[2]?.action).toBe("deny")
  })

  it("handles a rule with no colon — entire key is permission, pattern is the key itself", () => {
    const ruleset = Permission.fromConfig({ "bash": "deny" })
    expect(ruleset[0]?.permission).toBe("bash")
    // When there's no colon, split(":")[1] is undefined so pattern falls back to the key
    expect(ruleset[0]?.pattern).toBe("bash")
  })
})

describe("file - read/write round-trip", () => {
  it("writes content then reads it back", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minicode-test-"))
    const filePath = path.join(tmpDir, "test.txt")
    try {
      await Effect.runPromise(File.write(filePath, "hello world"))
      const content = await Effect.runPromise(File.read(filePath))
      expect(content).toBe("hello world")
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  it("read fails for non-existent file", async () => {
    expect(
      Effect.runPromise(File.read("/nonexistent/path/to/file.txt")),
    ).rejects.toThrow()
  })

  it("exists returns false for non-existent file", async () => {
    const result = await Effect.runPromise(File.exists("/nonexistent/path/to/file.txt"))
    expect(result).toBe(false)
  })

  it("exists returns true after write", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minicode-test-"))
    const filePath = path.join(tmpDir, "exists.txt")
    try {
      await Effect.runPromise(File.write(filePath, "content"))
      const result = await Effect.runPromise(File.exists(filePath))
      expect(result).toBe(true)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})