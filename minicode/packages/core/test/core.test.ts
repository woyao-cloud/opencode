import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import { NonNegativeInt, PositiveInt, optionalOmitUndefined } from "@minicode/core/schema"
import { Global } from "@minicode/core/global"
import { NamedError } from "@minicode/core/util/error"
import * as Log from "@minicode/core/util/log"
import { create } from "@minicode/core/util/slug"
import { InstallationVersion } from "@minicode/core/installation/version"
import path from "path"
import os from "os"

describe("core/schema - NonNegativeInt", () => {
  it("decodes a non-negative integer successfully", () => {
    const result = Schema.decodeUnknownSync(NonNegativeInt)(0)
    expect(result as number).toBe(0)
  })

  it("decodes a positive integer successfully", () => {
    const result = Schema.decodeUnknownSync(NonNegativeInt)(42)
    expect(result as number).toBe(42)
  })

  it("rejects a negative number", () => {
    expect(() => Schema.decodeUnknownSync(NonNegativeInt)(-1)).toThrow()
  })

  it("rejects a non-integer", () => {
    expect(() => Schema.decodeUnknownSync(NonNegativeInt)(3.14)).toThrow()
  })
})

describe("core/schema - PositiveInt", () => {
  it("decodes a positive integer successfully", () => {
    const result = Schema.decodeUnknownSync(PositiveInt)(1)
    expect(result as number).toBe(1)
  })

  it("rejects zero", () => {
    expect(() => Schema.decodeUnknownSync(PositiveInt)(0)).toThrow()
  })

  it("rejects a negative number", () => {
    expect(() => Schema.decodeUnknownSync(PositiveInt)(-5)).toThrow()
  })
})

describe("core/schema - optionalOmitUndefined", () => {
  it("accepts a value when present", () => {
    const s = optionalOmitUndefined(Schema.String as any)
    expect(Schema.decodeUnknownSync(s as any)("hello")).toBe("hello")
  })

  it("accepts undefined", () => {
    const s = optionalOmitUndefined(Schema.String as any)
    expect(Schema.decodeUnknownSync(s as any)(undefined)).toBeUndefined()
  })
})

describe("core/global - Path", () => {
  it("tmp path is under the system temp directory", () => {
    expect(Global.Path.tmp).toBe(path.join(os.tmpdir(), "minicode"))
  })

  it("db path ends with minicode.db", () => {
    expect(Global.Path.db.endsWith("minicode.db")).toBe(true)
  })

  it("log path is under data/log", () => {
    expect(Global.Path.log).toBe(path.join(Global.Path.data, "log"))
  })

  it("session path is under data/session", () => {
    expect(Global.Path.session).toBe(path.join(Global.Path.data, "session"))
  })
})

describe("core/global - make", () => {
  it("returns default paths when called with no args", () => {
    const paths = Global.make()
    expect(paths.tmp).toBe(Global.Path.tmp)
    expect(paths.db).toBe(Global.Path.db)
  })

  it("allows overriding individual paths", () => {
    const paths = Global.make({ tmp: "/custom/tmp" })
    expect(paths.tmp).toBe("/custom/tmp")
    // other paths remain default
    expect(paths.db).toBe(Global.Path.db)
  })
})

describe("core/util/error - NamedError", () => {
  it("formats message as [module.method] description", () => {
    const err = new NamedError({ module: "Session", method: "create", description: "db unavailable" })
    expect(err.message).toBe("[Session.create] db unavailable")
  })

  it("includes _tag field", () => {
    const err = new NamedError({ module: "M", method: "m", description: "d" })
    expect((err as any)._tag).toBe("NamedError")
  })
})

describe("core/util/log", () => {
  it("create returns a logger with info/warn/error/debug", () => {
    const log = Log.create({ service: "test" })
    expect(typeof log.info).toBe("function")
    expect(typeof log.warn).toBe("function")
    expect(typeof log.error).toBe("function")
    expect(typeof log.debug).toBe("function")
  })

  it("caches loggers by service name", () => {
    const a = Log.create({ service: "cached-svc" })
    const b = Log.create({ service: "cached-svc" })
    expect(a).toBe(b)
  })

  it("clone returns a different logger instance", () => {
    const a = Log.create({ service: "clone-svc" })
    const b = a.clone()
    expect(a).not.toBe(b)
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

  it("truncates long strings to 50 chars", () => {
    const long = "a".repeat(100)
    expect(create(long).length).toBe(50)
  })
})

describe("core/installation/version", () => {
  it("has a version string", () => {
    expect(InstallationVersion).toBe("0.0.1")
  })
})