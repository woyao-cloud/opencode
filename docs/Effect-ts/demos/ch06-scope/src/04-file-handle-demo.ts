/**
 * 04-file-handle-demo.ts — 文件句柄管理实战
 *
 * 参考 OpenCode 项目中的文件服务实现（packages/opencode/src/file/index.ts），
 * 本示例展示如何使用 Scope 管理文件句柄的生命周期：
 *
 * 1. acquireRelease 确保文件句柄在使用后正确关闭
 * 2. addFinalizer 确保临时文件被清理
 * 3. Scope.fork 隔离不同文件批次的操作
 * 4. 即使发生错误，文件句柄也不会泄漏
 */
import { Effect, Console, Scope, Exit } from "effect"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"

// ---------------------------------------------------------------------------
// 1. 文件句柄类型定义
// ---------------------------------------------------------------------------

/** 模拟文件句柄，封装 Node.js 文件操作 */
interface FileHandle {
  readonly filePath: string
  readonly fd: number
  readonly read: () => Effect.Effect<string, Error>
  readonly write: (content: string) => Effect.Effect<void, Error>
}

// ---------------------------------------------------------------------------
// 2. 使用 acquireRelease 打开和关闭文件
// ---------------------------------------------------------------------------

/**
 * 打开文件并返回受 Scope 管理的文件句柄。
 *
 * acquire: 使用 fs.openSync 打开文件
 * release: 使用 fs.closeSync 关闭文件（无论操作成功与否）
 */
const openFile = (filePath: string): Effect.Effect<FileHandle, Error, Scope.Scope> =>
  Effect.acquireRelease(
    // acquire: 打开文件
    Effect.try({
      try: () => {
        // 确保文件存在
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, "")
        }
        const fd = fs.openSync(filePath, "r+")
        Console.log(`[open] 打开文件: ${filePath} (fd: ${fd})`)
        return {
          filePath,
          fd,
          read: () =>
            Effect.try({
              try: () => {
                const content = fs.readFileSync(filePath, "utf-8")
                Console.log(`[read fd=${fd}] 读取 ${filePath}: ${content}`)
                return content
              },
              catch: (e) => new Error(`读取文件失败: ${e}`),
            }),
          write: (content: string) =>
            Effect.try({
              try: () => {
                fs.writeFileSync(filePath, content)
                Console.log(`[write fd=${fd}] 写入 ${filePath}: ${content}`)
              },
              catch: (e) => new Error(`写入文件失败: ${e}`),
            }),
        }
      },
      catch: (e) => new Error(`打开文件失败: ${e}`),
    }),
    // release: 关闭文件（接收 Exit 状态）
    (handle, exit) =>
      Effect.sync(() => {
        const status = Exit.isSuccess(exit) ? "成功" : "失败"
        fs.closeSync(handle.fd)
        Console.log(`[close] 关闭文件: ${handle.filePath} (fd: ${handle.fd}, 退出: ${status})`)
      }),
  )

// ---------------------------------------------------------------------------
// 3. 场景 1：基本的文件读写操作
// ---------------------------------------------------------------------------

const program1 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("=== 场景 1: 基本文件读写 ===")

    const tmpFile = path.join(os.tmpdir(), `effect-demo-${Date.now()}.txt`)

    // 打开文件（Scope 管理生命周期）
    const file = yield* openFile(tmpFile)

    // 写入内容
    yield* file.write("Hello, Effect Scope!")

    // 读取内容
    const content = yield* file.read()
    Console.log(`文件内容: ${content}`)

    // 注册清理 finalizer：删除临时文件
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile)
          Console.log(`[finalizer] 删除临时文件: ${tmpFile}`)
        }
      }),
    )

    // Scope 关闭时：
    // 1. 先执行 addFinalizer（删除临时文件）— 后注册先执行
    // 2. 再执行 release（关闭文件句柄）
  }),
)

// ---------------------------------------------------------------------------
// 4. 场景 2：操作失败时文件仍然正确关闭
// ---------------------------------------------------------------------------

const program2 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("\n=== 场景 2: 操作失败时文件仍正确关闭 ===")

    const tmpFile = path.join(os.tmpdir(), `effect-demo-${Date.now()}.txt`)
    const file = yield* openFile(tmpFile)

    // 写入一些初始内容
    yield* file.write("初始内容")

    // 模拟操作失败
    yield* Effect.fail(new Error("处理文件时发生错误"))

    // 这行不会执行，但文件句柄仍会被关闭
    yield* file.read()

    // 清理临时文件
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile)
          Console.log(`[finalizer] 删除临时文件: ${tmpFile}`)
        }
      }),
    )
  }),
)

// ---------------------------------------------------------------------------
// 5. 场景 3：多文件并行操作
// ---------------------------------------------------------------------------

const program3 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("\n=== 场景 3: 多文件并行操作 ===")

    const tmpFile1 = path.join(os.tmpdir(), `effect-demo-1-${Date.now()}.txt`)
    const tmpFile2 = path.join(os.tmpdir(), `effect-demo-2-${Date.now()}.txt`)

    // 同时打开两个文件
    const file1 = yield* openFile(tmpFile1)
    const file2 = yield* openFile(tmpFile2)

    // 并行写入
    yield* Effect.all([
      file1.write("文件 1 的内容"),
      file2.write("文件 2 的内容"),
    ])

    // 并行读取
    const contents = yield* Effect.all([file1.read(), file2.read()])
    Console.log(`文件 1: ${contents[0]}`)
    Console.log(`文件 2: ${contents[1]}`)

    // 清理两个临时文件
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (fs.existsSync(tmpFile1)) {
          fs.unlinkSync(tmpFile1)
          Console.log(`[finalizer] 删除: ${tmpFile1}`)
        }
        if (fs.existsSync(tmpFile2)) {
          fs.unlinkSync(tmpFile2)
          Console.log(`[finalizer] 删除: ${tmpFile2}`)
        }
      }),
    )
  }),
)

// ---------------------------------------------------------------------------
// 6. 场景 4：使用子 Scope 隔离文件操作
// ---------------------------------------------------------------------------

/**
 * 使用 Scope.fork 将一组文件操作隔离在子 Scope 中。
 * 子 Scope 中的文件在子 Scope 关闭时释放，
 * 不影响父 Scope 中的其他资源。
 */
const program4 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("\n=== 场景 4: 子 Scope 隔离文件操作 ===")

    const batchFile = path.join(os.tmpdir(), `effect-batch-${Date.now()}.txt`)
    const batchFile2 = path.join(os.tmpdir(), `effect-batch2-${Date.now()}.txt`)

    // 父 Scope 中的文件
    const mainFile = yield* openFile(batchFile)
    yield* mainFile.write("主文件内容")

    // 在子 Scope 中处理另一个文件
    yield* Scope.fork(
      Effect.gen(function* () {
        const childFile = yield* openFile(batchFile2)
        yield* childFile.write("子 Scope 文件内容")
        const content = yield* childFile.read()
        Console.log(`子 Scope: ${content}`)
        // 子 Scope 关闭 → 释放 childFile
      }),
    )

    // 子 Scope 已关闭，mainFile 仍然可用
    const mainContent = yield* mainFile.read()
    Console.log(`主 Scope: ${mainContent}`)

    // 清理所有临时文件
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        [batchFile, batchFile2].forEach((f) => {
          if (fs.existsSync(f)) {
            fs.unlinkSync(f)
            Console.log(`[finalizer] 删除: ${f}`)
          }
        })
      }),
    )
  }),
)

// ---------------------------------------------------------------------------
// 运行
// ---------------------------------------------------------------------------

Effect.runPromise(program1)
  .then(() =>
    Effect.runPromise(program2).catch((err) =>
      console.log(`场景 2 捕获错误: ${err.message}`),
    ),
  )
  .then(() => Effect.runPromise(program3))
  .then(() => Effect.runPromise(program4))
