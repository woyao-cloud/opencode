/**
 * 04-test-replacement.ts
 * 演示测试 Layer 替换:
 *   - 生产 Layer vs 测试 Layer
 *   - Layer.succeed(Service)(mock) — 用 mock 替换真实服务
 *   - Effect.provideServiceEffect — 局部替换
 *   - 不修改业务代码即可切换依赖
 *
 * 运行: bun run src/04-test-replacement.ts
 */

import { Context, Effect, Layer } from "effect"

// ============================================================
// 业务服务声明 — 使用 Context.Service 类模式
// ============================================================

class EmailService extends Context.Service<EmailService, {
  readonly send: (to: string, subject: string, body: string) => string
}>()("EmailService") {}

class PaymentGateway extends Context.Service<PaymentGateway, {
  readonly processPayment: (orderId: string, amount: number) => string
  readonly refund: (orderId: string) => string
}>()("PaymentGateway") {}

class UserNotifier extends Context.Service<UserNotifier, {
  readonly notifyOrder: (email: string, orderId: string) => string
}>()("UserNotifier") {}

// ============================================================
// 生产环境实现
// ============================================================

const emailServiceLive = Layer.effect(EmailService)(
  Effect.sync(() => {
    console.log("  [生产] 初始化 EmailService (SMTP)")
    return {
      send: (to: string, subject: string, body: string) => {
        // 真实场景: 通过 SMTP 发送邮件
        console.log(`  [生产] 发送邮件到 ${to}: ${subject}`)
        return `邮件已发送到 ${to}`
      }
    }
  })
)

const paymentGatewayLive = Layer.effect(PaymentGateway)(
  Effect.sync(() => {
    console.log("  [生产] 初始化 PaymentGateway (Stripe)")
    return {
      processPayment: (orderId: string, amount: number) => {
        // 真实场景: 调用 Stripe API
        console.log(`  [生产] 处理支付: 订单 ${orderId}, 金额 ¥${amount}`)
        return `支付成功: 订单 ${orderId}, 金额 ¥${amount}`
      },
      refund: (orderId: string) => {
        console.log(`  [生产] 退款: 订单 ${orderId}`)
        return `退款成功: 订单 ${orderId}`
      }
    }
  })
)

const userNotifierLive = Layer.effect(UserNotifier)(
  Effect.gen(function* () {
    const email = yield* EmailService
    const payment = yield* PaymentGateway
    console.log("  [生产] 初始化 UserNotifier")

    return {
      notifyOrder: (emailAddr: string, orderId: string) => {
        const paymentResult = payment.processPayment(orderId, 100)
        const emailResult = email.send(emailAddr, "订单确认", `您的订单 ${orderId} 已确认`)
        return `${paymentResult} | ${emailResult}`
      }
    }
  })
)

// 组合生产 Layer
// userNotifierLive 依赖 EmailService 和 PaymentGateway，使用 provideMerge 注入
const productionLayer = userNotifierLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(emailServiceLive, paymentGatewayLive)
  )
)

console.log("=".repeat(60))
console.log("生产环境 Layer")
console.log("=".repeat(60))
console.log("✅ productionLayer 已创建")
console.log("   包含: EmailService + PaymentGateway + UserNotifier")

// ============================================================
// 测试环境实现（Mock）
// ============================================================
// 测试环境使用 Layer.succeed 直接提供 mock 实例，
// 不需要真实的 SMTP 或 Stripe 连接。

const emailServiceTest = Layer.succeed(EmailService)({
  send: (to: string, subject: string, body: string) => {
    console.log(`  [测试] 模拟发送邮件到 ${to}: ${subject}`)
    return `[测试] 邮件已记录: ${to}`
  }
})

const paymentGatewayTest = Layer.succeed(PaymentGateway)({
  processPayment: (orderId: string, amount: number) => {
    console.log(`  [测试] 模拟支付: 订单 ${orderId}, 金额 ¥${amount}`)
    return `[测试] 支付模拟成功: ${orderId}`
  },
  refund: (orderId: string) => {
    console.log(`  [测试] 模拟退款: 订单 ${orderId}`)
    return `[测试] 退款模拟成功: ${orderId}`
  }
})

// 测试 UserNotifier 使用与生产相同的实现逻辑，
// 但依赖的 EmailService 和 PaymentGateway 已被替换为 mock
const userNotifierTest = Layer.effect(UserNotifier)(
  Effect.gen(function* () {
    const email = yield* EmailService
    const payment = yield* PaymentGateway
    console.log("  [测试] 初始化 UserNotifier (使用 mock 依赖)")

    return {
      notifyOrder: (emailAddr: string, orderId: string) => {
        const paymentResult = payment.processPayment(orderId, 100)
        const emailResult = email.send(emailAddr, "订单确认", `您的订单 ${orderId} 已确认`)
        return `${paymentResult} | ${emailResult}`
      }
    }
  })
)

// 组合测试 Layer
const testLayer = userNotifierTest.pipe(
  Layer.provideMerge(
    Layer.mergeAll(emailServiceTest, paymentGatewayTest)
  )
)

console.log("\n" + "=".repeat(60))
console.log("测试环境 Layer（Mock）")
console.log("=".repeat(60))
console.log("✅ testLayer 已创建")
console.log("   使用 Layer.succeed 提供 mock 实例")
console.log("   不需要真实的 SMTP 或 Stripe 连接")

// ============================================================
// 业务代码（不依赖具体实现）
// ============================================================
// 业务代码只声明需要 UserNotifier，不关心是生产还是测试实现。

const businessLogic = Effect.gen(function* () {
  const notifier = yield* UserNotifier

  console.log("  [业务] 处理订单通知...")
  const result = notifier.notifyOrder("user@example.com", "ORDER-12345")

  return result
})

// ============================================================
// 运行：生产环境
// ============================================================
console.log("\n" + "=".repeat(60))
console.log("运行：生产环境")
console.log("=".repeat(60))

const prodResult = Effect.runSync(Effect.provide(businessLogic, productionLayer))
console.log("\n✅ 生产结果:", prodResult)

// ============================================================
// 运行：测试环境
// ============================================================
console.log("\n" + "=".repeat(60))
console.log("运行：测试环境")
console.log("=".repeat(60))

const testResult = Effect.runSync(Effect.provide(businessLogic, testLayer))
console.log("\n✅ 测试结果:", testResult)

// ============================================================
// Effect.provideServiceEffect — 局部替换
// ============================================================
// Effect.provideServiceEffect 允许在 Effect 级别局部替换服务，
// 而不需要修改整个 Layer 结构。适合在测试中覆盖单个服务。

console.log("\n" + "=".repeat(60))
console.log("Effect.provideServiceEffect — 局部替换")
console.log("=".repeat(60))

// 场景：在生产环境中，只想替换 EmailService 为测试实现
const partialTestProgram = Effect.gen(function* () {
  const notifier = yield* UserNotifier
  const result = notifier.notifyOrder("test@example.com", "ORDER-PARTIAL")
  return result
})

const partialTestResult = Effect.runSync(
  partialTestProgram.pipe(
    Effect.provide(productionLayer),
    // 局部替换：只将 EmailService 替换为测试实现
    Effect.provideServiceEffect(EmailService, Effect.sync(() => ({
      send: (to: string, subject: string, body: string) => {
        console.log(`  [局部替换] 拦截邮件: ${to} → ${subject}`)
        return `[局部替换] 邮件已拦截: ${to}`
      }
    })))
  )
)
console.log("\n✅ 局部替换结果:", partialTestResult)
console.log("   EmailService 被替换，但 PaymentGateway 仍使用生产实现")

// ============================================================
// 对比：生产 vs 测试
// ============================================================
console.log("\n" + "=".repeat(60))
console.log("生产 vs 测试 — 对比")
console.log("=".repeat(60))
console.log("")
console.log("  ┌──────────────┬──────────────────┬──────────────────┐")
console.log("  │  服务         │ 生产实现          │ 测试实现          │")
console.log("  ├──────────────┼──────────────────┼──────────────────┤")
console.log("  │ EmailService │ SMTP 真实发送     │ 控制台模拟        │")
console.log("  │ PaymentGW    │ Stripe API 调用   │ 返回固定结果      │")
console.log("  │ UserNotifier │ 真实组合          │ 使用 mock 依赖    │")
console.log("  └──────────────┴──────────────────┴──────────────────┘")
console.log("")
console.log("  关键点: 业务代码完全不变，只切换 Layer 实现")

// ============================================================
// 总结
// ============================================================
console.log("\n" + "=".repeat(60))
console.log("总结: 测试 Layer 替换")
console.log("=".repeat(60))
console.log("  1. Layer.succeed(Service)(mock) — 直接提供 mock 实例")
console.log("  2. Effect.provideServiceEffect — 局部替换单个服务")
console.log("  3. 业务代码不依赖具体实现，只声明需要什么")
console.log("")
console.log("  最佳实践:")
console.log("  - 为每个服务定义接口，生产/测试分别实现")
console.log("  - 测试 Layer 使用 Layer.succeed 提供 mock")
console.log("  - 使用 Effect.provideServiceEffect 做局部覆盖")
console.log("  - 不修改业务代码即可切换依赖")
