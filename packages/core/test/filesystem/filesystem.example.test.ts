import { test, expect } from "bun:test"
import { promises as fs } from "fs"
import path from "path"

import { Effect, Layer, FileSystem } from "effect"
import { NodeFileSystem } from "@effect/platform-node"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { testEffect } from "../lib/effect"

// Live layer used by other tests in this package
const live = AppFileSystem.layer.pipe(Layer.provideMerge(NodeFileSystem.layer))
const { effect: it } = testEffect(live)

// Traditional Promise / async-await test (typical style)
test("traditional: write and read file (async/await)", async () => {
  const tmp = path.join(process.cwd(), `tmp-example-${Math.random()}`)
  await fs.mkdir(tmp, { recursive: true })
  const file = path.join(tmp, "hello.txt")
  await fs.writeFile(file, "hello")

  const content = await fs.readFile(file, "utf8")
  expect(content).toBe("hello")
})

// Effect-based test using the project's Effect helpers and layers
it("effect: write and read file (Effect)",
  Effect.gen(function* () {
    const fsSvc = yield* AppFileSystem.Service
    const filesys = yield* FileSystem.FileSystem
    const tmp = yield* filesys.makeTempDirectoryScoped()
    const file = path.join(tmp, "hello.txt")

    yield* filesys.writeFileString(file, "hello")

    const content = yield* filesys.readFileString(file)
    expect(content).toBe("hello")
  }),
)
