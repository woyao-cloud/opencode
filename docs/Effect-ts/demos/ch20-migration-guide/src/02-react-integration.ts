/**
 * 02-react-integration.ts — React 集成模式
 *
 * 展示 Effect-TS 在 React 应用中的三种集成方式：
 *   1. Effect.runPromise — 在 useEffect 中加载数据
 *   2. Scope 生命周期 — 组件卸载时自动清理
 *   3. Effect.runFork — 在事件处理器中触发副作用
 *
 * 注意: 本 demo 在 Node/Bun 环境中模拟 React 行为，
 * 实际 React 代码结构相同，只需将模拟的组件渲染替换为 JSX。
 *
 * 运行: bun run src/02-react-integration.ts
 */
import { Effect, Scope, Fiber, Duration } from "effect"

// ============================================================
// 模拟数据 API
// ============================================================

interface User {
  readonly id: string
  readonly name: string
  readonly email: string
}

// 模拟异步 API 调用
const fetchUser = (id: string): Effect.Effect<never, Error, User> =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(50))
    if (id === "error") {
      return yield* Effect.fail(new Error("获取用户失败"))
    }
    return { id, name: "Alice", email: "alice@example.com" }
  })

const fetchPosts = (userId: string): Effect.Effect<never, Error, string[]> =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(30))
    return [`${userId}:post-1`, `${userId}:post-2`]
  })

// ============================================================
// 模式 1: Effect.runPromise — 在 useEffect 中加载数据
// ============================================================

// 模拟 React 组件的 useEffect + useState
function simulateUseEffect(effect: () => void | (() => void)) {
  // 模拟组件挂载
  console.log("[useEffect] 组件挂载")
  const cleanup = effect()
  // 模拟组件卸载
  return () => {
    console.log("[useEffect] 组件卸载")
    if (cleanup) cleanup()
  }
}

function simulateUseState<T>(initial: T): { get: () => T; set: (v: T) => void } {
  let state = initial
  return {
    get: () => state,
    set: (v: T) => {
      state = v
      console.log(`[useState] 状态更新: ${JSON.stringify(state)}`)
    },
  }
}

function demoRunPromise() {
  return Effect.gen(function* () {
    console.log("=== 模式 1: Effect.runPromise 在 useEffect 中加载数据 ===")

    // 模拟 React 组件
    const userState = simulateUseState<User | null>(null)
    const loadingState = simulateUseState(true)
    const errorState = simulateUseState<string | null>(null)

    // 模拟 useEffect(() => { ... }, [])
    const unmount = simulateUseEffect(() => {
      // 在 Effect 中加载数据
      const promise = Effect.runPromise(
        fetchUser("1").pipe(
          Effect.tap((user) => Effect.sync(() => userState.set(user))),
          Effect.tap(() => Effect.sync(() => loadingState.set(false))),
          Effect.catch((err) =>
            Effect.sync(() => {
              errorState.set(err.message)
              loadingState.set(false)
            })
          ),
        ),
      )
      // 无清理逻辑
      return undefined
    })

    // 等待异步操作完成
    yield* Effect.sleep(Duration.millis(100))

    console.log(`最终状态 - 用户: ${JSON.stringify(userState.get())}, 加载中: ${loadingState.get()}, 错误: ${errorState.get()}`)

    // 清理
    unmount()
  })
}

// ============================================================
// 模式 2: Scope 生命周期 — 组件卸载时自动清理
// ============================================================

// 模拟一个需要清理的资源（如 WebSocket 连接）
class Connection {
  constructor(readonly id: string) {
    console.log(`[Connection] 建立连接: ${id}`)
  }
  close() {
    console.log(`[Connection] 关闭连接: ${id}`)
  }
}

const createConnection = (id: string): Effect.Effect<never, never, Connection> =>
  Effect.sync(() => new Connection(id))

const useConnection = (id: string): Effect.Effect<Scope.Scope, never, Connection> =>
  Effect.gen(function* () {
    const conn = yield* createConnection(id)
    const scope = yield* Scope.make()
    // 在 Scope 关闭时自动清理
    yield* Scope.addFinalizer(scope, Effect.sync(() => conn.close()))
    return conn
  })

function demoScope() {
  return Effect.gen(function* () {
    console.log("\n=== 模式 2: Scope 生命周期 — 组件卸载时自动清理 ===")

    // 模拟 React useEffect 中使用 Scope
    console.log("[组件] 开始挂载")

    // 使用 Scope 管理连接生命周期
    const result = yield* Effect.scoped(
      Effect.gen(function* () {
        const conn = yield* useConnection("conn-1")
        console.log(`[组件] 使用连接: ${conn.id}`)
        // 模拟组件运行一段时间
        yield* Effect.sleep(Duration.millis(50))
        console.log("[组件] 准备卸载")
        return "组件渲染完成"
      }),
    )

    console.log(`[组件] ${result}`)
    // 离开 Effect.scoped 时，Scope 自动关闭，连接被清理
    console.log("[组件] 连接已自动清理")
  })
}

// ============================================================
// 模式 3: Effect.runFork — 在事件处理器中触发副作用
// ============================================================

// 模拟 React 事件处理器
function simulateEventHandler(name: string, handler: () => void) {
  console.log(`[事件] ${name} 触发`)
  handler()
}

function demoRunFork() {
  return Effect.gen(function* () {
    console.log("\n=== 模式 3: Effect.runFork 在事件处理器中触发副作用 ===")

    // 模拟一个"保存"按钮点击事件
    const saveData = (data: string): Effect.Effect<never, Error, string> =>
      Effect.gen(function* () {
        console.log(`[保存] 正在保存: ${data}`)
        yield* Effect.sleep(Duration.millis(30))
        if (data === "fail") {
          return yield* Effect.fail(new Error("保存失败"))
        }
        console.log(`[保存] 成功: ${data}`)
        return `saved-${data}`
      })

    // 模拟事件处理器中使用 runFork
    simulateEventHandler("点击保存按钮", () => {
      // runFork 返回一个 Fiber，可以用于取消
      const fiber = Effect.runFork(
        saveData("用户设置").pipe(
          Effect.catch((err) =>
            Effect.sync(() => console.log(`[UI] 显示错误: ${err.message}`))
          ),
        ),
      )
      console.log(`[事件] 保存操作已启动 (Fiber: ${fiber.id})`)
    })

    // 等待保存完成
    yield* Effect.sleep(Duration.millis(50))

    // 模拟"取消"场景
    simulateEventHandler("点击取消按钮", () => {
      const fiber = Effect.runFork(
        saveData("large-file").pipe(
          Effect.tap(() => console.log("[保存] 大文件保存完成（不应出现）")),
        ),
      )
      console.log(`[事件] 保存操作已启动，立即取消`)
      // 立即取消 Fiber
      Effect.runFork(Fiber.interrupt(fiber))
    })

    yield* Effect.sleep(Duration.millis(50))
  })
}

// ============================================================
// 运行所有模式
// ============================================================

const program = Effect.gen(function* () {
  yield* demoRunPromise()
  yield* demoScope()
  yield* demoRunFork()
  console.log("\n✅ 02-react-integration.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()
