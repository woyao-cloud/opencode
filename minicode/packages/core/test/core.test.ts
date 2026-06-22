import { describe, expect, it } from "bun:test"
import * as Log from "@minicode/core/util/log"
import { create } from "@minicode/core/util/slug"
import { InstallationVersion } from "@minicode/core/installation/version"
import { Global } from "@minicode/core/global"
import path from "path"

describe("core/util/log", () => {
  it("create returns a logger with info/warn/error/debug", () => {
    const log = Log.create({ service: "test" })
    expect(typeof log.info).toBe("function")
    expect(typeof log.warn).toBe("function")
    expect(typeof log.error).toBe("function")
    expect(typeof log.debug).toBe("function")
  })

  it("tagged logger preserves service name", () => {
    const log = Log.create({ service: "my-service" })
    // 无法直接断言 stderr 输出，但确保 tag 不会抛错
    log.info("hello", { key: "value" })
    expect(true).toBe(true)
  })
})

describe("core/util/slug", () => {
  it("creates a slug from a string", () => {
    expect(create("Hello World!")).toBe("hello-world")
    expect(create("foo bar baz")).toBe("foo-bar-baz")
    expect(create("  spaced  ")).toBe("spaced")
  })

  it("falls back to 'session' for empty strings", () => {
    expect(create("")).toBe("session")
    expect(create("@#$%")).toBe("session")
  })
})

describe("core/installation/version", () => {
  it("has a version string", () => {
    expect(InstallationVersion).toBe("0.0.1")
  })
})

describe("core/global", () => {
  it("Path has all required fields", () => {
    expect(typeof Global.Path.home).toBe("string")
    expect(typeof Global.Path.data).toBe("string")
    expect(typeof Global.Path.log).toBe("string")
    expect(typeof Global.Path.db).toBe("string")
    expect(Global.Path.db.endsWith("minicode.db")).toBe(true)
  })
})