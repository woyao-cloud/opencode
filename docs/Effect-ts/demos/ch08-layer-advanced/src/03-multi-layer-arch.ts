/**
 * 03-multi-layer-arch.ts
 * 演示多层架构的 Layer 组织方式:
 *   - 三层架构: Infrastructure → Domain → Application
 *   - 每层作为独立 Layer，通过 Layer.provide 连接
 *   - Layer.mergeAll 组合所有层
 *   - 大型项目的最佳实践
 *
 * 运行: bun run src/03-multi-layer-arch.ts
 */

import { Context, Effect, Layer } from "effect"

// ============================================================
// 第 1 层: Infrastructure（基础设施层）
// ============================================================
// 基础设施层提供底层服务：数据库连接、HTTP 客户端、日志、配置等。
// 这些服务通常依赖外部资源，是整个应用的基石。

// --- 基础设施服务声明 ---

class Logger extends Context.Service<Logger, {
  readonly log: (message: string) => void
}>()("Logger") {}

class Database extends Context.Service<Database, {
  readonly query: (sql: string) => string
  readonly transaction: <A>(fn: Effect<A, never, Database>) => Effect<A, never, never>
}>()("Database") {}

class HttpClient extends Context.Service<HttpClient, {
  readonly get: (url: string) => string
  readonly post: (url: string, body: unknown) => string
}>()("HttpClient") {}

// --- 基础设施 Layer 实现 ---

const loggerLayer = Layer.effect(Logger)(
  Effect.sync(() => ({
    log: (message: string) => console.log(`  [${new Date().toISOString()}] ${message}`)
  }))
)

const databaseLayer = Layer.effect(Database)(
  Effect.sync(() => {
    // 模拟数据库连接池
    console.log("  [Infra] 初始化数据库连接池...")
    return {
      query: (sql: string) => `[DB] ${sql} → 返回 10 行`,
      transaction: <A>(fn: Effect<A, never, Database>) =>
        Effect.gen(function* () {
          console.log("  [DB] 开始事务...")
          const db = yield* Database
          const result = yield* fn
          console.log("  [DB] 提交事务")
          return result
        })
    }
  })
)

const httpClientLayer = Layer.effect(HttpClient)(
  Effect.sync(() => {
    console.log("  [Infra] 初始化 HTTP 客户端...")
    return {
      get: (url: string) => `[HTTP GET ${url}] → 200 OK`,
      post: (url: string, body: unknown) =>
        `[HTTP POST ${url}] → 201 Created (body: ${JSON.stringify(body)})`
    }
  })
)

// 合并基础设施层
const infrastructureLayer = Layer.mergeAll(
  loggerLayer,
  databaseLayer,
  httpClientLayer
)

console.log("=".repeat(60))
console.log("第 1 层: Infrastructure（基础设施层）")
console.log("=".repeat(60))
console.log("✅ infrastructureLayer 已创建")
console.log("   包含: Logger + Database + HttpClient")
console.log("   类型: Layer<Logger | Database | HttpClient>")

// ============================================================
// 第 2 层: Domain（领域层）
// ============================================================
// 领域层包含业务逻辑和领域模型。它依赖基础设施层提供的服务，
// 但不暴露基础设施的细节。领域层是应用的核心。

// --- 领域服务声明 ---

class UserRepository extends Context.Service<UserRepository, {
  readonly findById: (id: number) => string
  readonly findByEmail: (email: string) => string
  readonly save: (user: { id: number; name: string; email: string }) => string
}>()("UserRepository") {}

class OrderRepository extends Context.Service<OrderRepository, {
  readonly create: (userId: number, product: string, amount: number) => string
  readonly findByUser: (userId: number) => string[]
}>()("OrderRepository") {}

class PaymentService extends Context.Service<PaymentService, {
  readonly charge: (userId: number, amount: number) => string
  readonly refund: (orderId: string) => string
}>()("PaymentService") {}

// --- 领域 Layer 实现 ---
// 每个领域服务都依赖基础设施层的服务

const userRepositoryLayer = Layer.effect(UserRepository)(
  Effect.gen(function* () {
    const db = yield* Database
    const logger = yield* Logger
    logger.log("[Domain] 初始化 UserRepository")

    return {
      findById: (id: number) => db.query(`SELECT * FROM users WHERE id = ${id}`),
      findByEmail: (email: string) => db.query(`SELECT * FROM users WHERE email = '${email}'`),
      save: (user: { id: number; name: string; email: string }) => {
        const result = db.query(`INSERT INTO users (id, name, email) VALUES (${user.id}, '${user.name}', '${user.email}')`)
        logger.log(`[Domain] 保存用户: ${user.name} (ID=${user.id})`)
        return result
      }
    }
  })
)

const orderRepositoryLayer = Layer.effect(OrderRepository)(
  Effect.gen(function* () {
    const db = yield* Database
    const logger = yield* Logger
    logger.log("[Domain] 初始化 OrderRepository")

    return {
      create: (userId: number, product: string, amount: number) => {
        const result = db.query(`INSERT INTO orders (user_id, product, amount) VALUES (${userId}, '${product}', ${amount})`)
        logger.log(`[Domain] 创建订单: ${product} ¥${amount} (用户ID=${userId})`)
        return `ORDER-${Date.now()}`
      },
      findByUser: (userId: number) => [
        db.query(`SELECT * FROM orders WHERE user_id = ${userId}`)
      ]
    }
  })
)

const paymentServiceLayer = Layer.effect(PaymentService)(
  Effect.gen(function* () {
    const http = yield* HttpClient
    const logger = yield* Logger
    logger.log("[Domain] 初始化 PaymentService")

    return {
      charge: (userId: number, amount: number) => {
        const result = http.post("https://api.payment.com/charge", { userId, amount })
        logger.log(`[Domain] 扣款: ¥${amount} (用户ID=${userId})`)
        return result
      },
      refund: (orderId: string) => {
        const result = http.post("https://api.payment.com/refund", { orderId })
        logger.log(`[Domain] 退款: ${orderId}`)
        return result
      }
    }
  })
)

// 合并领域层，并通过 Layer.provideMerge 注入基础设施依赖
// 使用 provideMerge 而非 provide，以保留基础设施服务供上层使用
const domainLayer = Layer.mergeAll(
  userRepositoryLayer,
  orderRepositoryLayer,
  paymentServiceLayer
).pipe(Layer.provideMerge(infrastructureLayer))

console.log("\n" + "=".repeat(60))
console.log("第 2 层: Domain（领域层）")
console.log("=".repeat(60))
console.log("✅ domainLayer 已创建")
console.log("   包含: UserRepository + OrderRepository + PaymentService")
console.log("   依赖: Infrastructure 层（已通过 Layer.provide 注入）")

// ============================================================
// 第 3 层: Application（应用层）
// ============================================================
// 应用层是用户交互的入口，编排领域层的服务来完成业务用例。
// 它不直接依赖基础设施层，只通过领域层间接使用。

// --- 应用服务声明 ---

class UserService extends Context.Service<UserService, {
  readonly register: (name: string, email: string) => string
  readonly getUser: (id: number) => string
}>()("UserService") {}

class OrderService extends Context.Service<OrderService, {
  readonly placeOrder: (userId: number, product: string, amount: number) => string
  readonly getUserOrders: (userId: number) => string[]
}>()("OrderService") {}

// --- 应用 Layer 实现 ---

const userServiceLayer = Layer.effect(UserService)(
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const payment = yield* PaymentService
    const logger = yield* Logger
    logger.log("[Application] 初始化 UserService")

    return {
      register: (name: string, email: string) => {
        logger.log(`[用例] 用户注册: ${name} <${email}>`)
        const id = Math.floor(Math.random() * 10000)
        userRepo.save({ id, name, email })
        return `用户 ${name} 注册成功 (ID=${id})`
      },
      getUser: (id: number) => {
        logger.log(`[用例] 查询用户: ID=${id}`)
        return userRepo.findById(id)
      }
    }
  })
)

const orderServiceLayer = Layer.effect(OrderService)(
  Effect.gen(function* () {
    const orderRepo = yield* OrderRepository
    const payment = yield* PaymentService
    const logger = yield* Logger
    logger.log("[Application] 初始化 OrderService")

    return {
      placeOrder: (userId: number, product: string, amount: number) => {
        logger.log(`[用例] 下单: ${product} ¥${amount}`)
        const orderId = orderRepo.create(userId, product, amount)
        payment.charge(userId, amount)
        return `订单 ${orderId} 创建成功`
      },
      getUserOrders: (userId: number) => {
        logger.log(`[用例] 查询用户订单: ID=${userId}`)
        return orderRepo.findByUser(userId)
      }
    }
  })
)

// 合并应用层，注入领域层依赖
// 使用 provideMerge 保留所有下层服务
const applicationLayer = Layer.mergeAll(
  userServiceLayer,
  orderServiceLayer
).pipe(Layer.provideMerge(domainLayer))

console.log("\n" + "=".repeat(60))
console.log("第 3 层: Application（应用层）")
console.log("=".repeat(60))
console.log("✅ applicationLayer 已创建")
console.log("   包含: UserService + OrderService")
console.log("   依赖: Domain 层（已通过 Layer.provide 注入）")

// ============================================================
// 运行完整应用
// ============================================================

const app = Effect.gen(function* () {
  const userService = yield* UserService
  const orderService = yield* OrderService
  const logger = yield* Logger

  logger.log("=".repeat(50))
  logger.log("应用启动 — 三层架构演示")
  logger.log("=".repeat(50))

  // 用户注册
  const registerResult = userService.register("Alice", "alice@example.com")
  logger.log(`注册结果: ${registerResult}`)

  // 查询用户
  const userInfo = userService.getUser(1)
  logger.log(`用户信息: ${userInfo}`)

  // 下单
  const orderResult = orderService.placeOrder(1, "MacBook Pro", 19999)
  logger.log(`下单结果: ${orderResult}`)

  // 查询订单
  const orders = orderService.getUserOrders(1)
  logger.log(`用户订单: ${orders.join(", ")}`)

  return {
    register: registerResult,
    userInfo,
    order: orderResult,
    orders
  }
})

console.log("\n" + "=".repeat(60))
console.log("运行完整应用")
console.log("=".repeat(60))

const result = Effect.runSync(Effect.provide(app, applicationLayer))
console.log("\n✅ 应用执行结果:", JSON.stringify(result, null, 2))

// ============================================================
// 依赖图可视化
// ============================================================
console.log("\n" + "=".repeat(60))
console.log("三层架构依赖图")
console.log("=".repeat(60))
console.log(`
  ┌─────────────────────────────────────────────────┐
  │            Application Layer                    │
  │  ┌─────────────────────────────────────────┐   │
  │  │  UserService      OrderService          │   │
  │  └────────┬──────────────┬─────────────────┘   │
  │           │              │                     │
  │           ▼              ▼                     │
  │  ┌─────────────────────────────────────────┐   │
  │  │         Domain Layer                     │   │
  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ │   │
  │  │  │UserRepo  │ │OrderRepo │ │Payment   │ │   │
  │  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ │   │
  │  └───────┼────────────┼─────────────┼───────┘   │
  │          │            │             │           │
  │          ▼            ▼             ▼           │
  │  ┌─────────────────────────────────────────┐   │
  │  │       Infrastructure Layer              │   │
  │  │  ┌────────┐ ┌──────────┐ ┌──────────┐  │   │
  │  │  │ Logger │ │Database  │ │HttpClient│  │   │
  │  │  └────────┘ └──────────┘ └──────────┘  │   │
  │  └─────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────┘

  构建方式:
  applicationLayer = Layer.mergeAll(UserService, OrderService)
    .pipe(Layer.provide(domainLayer))

  domainLayer = Layer.mergeAll(UserRepo, OrderRepo, Payment)
    .pipe(Layer.provide(infrastructureLayer))

  infrastructureLayer = Layer.mergeAll(Logger, Database, HttpClient)
`)

// ============================================================
// 总结
// ============================================================
console.log("=".repeat(60))
console.log("总结: 多层架构最佳实践")
console.log("=".repeat(60))
console.log("  1. Infrastructure 层 — 底层服务（Logger, DB, HTTP）")
console.log("  2. Domain 层 — 业务逻辑（Repository, Payment）")
console.log("  3. Application 层 — 用例编排（UserService, OrderService）")
console.log("")
console.log("  关键原则:")
console.log("  - 依赖方向: Application → Domain → Infrastructure")
console.log("  - 每层只依赖下一层，不跨层依赖")
console.log("  - Layer.mergeAll 合并同层服务")
console.log("  - Layer.provide 注入下层依赖")
console.log("  - 替换下层实现不影响上层代码")
