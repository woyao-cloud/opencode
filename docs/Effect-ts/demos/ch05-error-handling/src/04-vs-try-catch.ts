/**
 * 04-vs-try-catch.ts — Effect 错误处理 vs try/catch 思维对比
 *
 * 演示同一场景下两种错误处理方式的对比：
 * - try/catch: 错误类型是 unknown，需要手动 instanceof 判断
 * - Effect: 错误类型在签名中，编译器强制处理
 *
 * 运行: bun run src/04-vs-try-catch.ts
 */

import { Effect, Schema, Console } from "effect"

// ============================================================
// 场景: 从 API 获取用户数据，然后更新用户名
// ============================================================

// 定义业务错误类型
class NotFoundError extends Schema.Class<NotFoundError>("NotFoundError")({
  _tag: Schema.Literal("NotFoundError"),
  message: Schema.String,
  userId: Schema.Number,
}) {
  get description(): string {
    return `[NotFoundError] 用户 ${this.userId} 不存在: ${this.message}`
  }
}

class PermissionError extends Schema.Class<PermissionError>("PermissionError")({
  _tag: Schema.Literal("PermissionError"),
  message: Schema.String,
}) {
  get description(): string {
    return `[PermissionError] ${this.message}`
  }
}

class ValidationError extends Schema.Class<ValidationError>("ValidationError")({
  _tag: Schema.Literal("ValidationError"),
  message: Schema.String,
  field: Schema.String,
}) {
  get description(): string {
    return `[ValidationError] ${this.field}: ${this.message}`
  }
}

// 用户数据类型
interface User {
  id: number
  name: string
  email: string
}

// ============================================================
// 方式 A: 传统 try/catch
// ============================================================

console.log("=== 方式 A: 传统 try/catch ===\n")

// 问题 1: 类型签名为 void，看不出可能抛出什么错误
async function updateUserNameTryCatch(userId: number, newName: string): Promise<User> {
  // 校验名称
  if (newName.length === 0) {
    throw new ValidationError({
      _tag: "ValidationError" as const,
      message: "用户名不能为空",
      field: "name",
    })
  }

  // 模拟从数据库获取用户
  // 问题 2: 真实的数据库错误和业务错误混在一起
  if (userId === 404) {
    throw new NotFoundError({
      _tag: "NotFoundError" as const,
      message: "用户记录不存在",
      userId,
    })
  }

  if (userId === 403) {
    throw new PermissionError({
      _tag: "PermissionError" as const,
      message: "无权修改该用户",
    })
  }

  // 模拟成功
  const user: User = { id: userId, name: `旧名称-${userId}`, email: `user${userId}@test.com` }
  return { ...user, name: newName }
}

// try/catch 调用 — 所有错误类型都是 unknown
async function tryCatchDemo() {
  // 场景 1: 正常成功
  try {
    const user = await updateUserNameTryCatch(1, "新名称")
    console.log("✅ 成功:", user.name)
  } catch (error: unknown) {
    // 问题 3: 必须手动 instanceof 判断，容易遗漏错误类型
    if (error instanceof ValidationError) {
      console.log("❌ 校验错误:", error.description)
    } else if (error instanceof NotFoundError) {
      console.log("❌ 未找到:", error.description)
    } else if (error instanceof PermissionError) {
      console.log("❌ 权限错误:", error.description)
    } else {
      // 问题 4: 未知错误只能笼统处理
      console.log("❌ 未知错误:", String(error))
    }
  }

  // 场景 2: 校验失败
  try {
    await updateUserNameTryCatch(1, "") // 空名称
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      console.log("✅ 正确处理: 校验失败被捕获")
    }
  }

  // 场景 3: 用户不存在
  try {
    await updateUserNameTryCatch(404, "新名称")
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      console.log("✅ 正确处理: 未找到被捕获")
    }
  }

  // 场景 4: 权限不足
  try {
    await updateUserNameTryCatch(403, "新名称")
  } catch (error: unknown) {
    if (error instanceof PermissionError) {
      console.log("✅ 正确处理: 权限错误被捕获")
    }
  }
}

await tryCatchDemo()

// ============================================================
// 方式 B: Effect-TS 类型化错误处理
// ============================================================

console.log("\n=== 方式 B: Effect-TS 类型化错误处理 ===\n")

// 优势 1: 错误类型在签名中明确声明
// Effect<never, NotFoundError | PermissionError | ValidationError, User>
// 编译器知道这个 Effect 可能失败，且失败类型是这三种之一
function updateUserNameEffect(
  userId: number,
  newName: string,
): Effect.Effect<User, NotFoundError | PermissionError | ValidationError> {
  return Effect.gen(function* () {
    // 校验名称
    if (newName.length === 0) {
      return yield* Effect.fail(new ValidationError({
        _tag: "ValidationError" as const,
        message: "用户名不能为空",
        field: "name",
      }))
    }

    if (userId === 404) {
      return yield* Effect.fail(new NotFoundError({
        _tag: "NotFoundError" as const,
        message: "用户记录不存在",
        userId,
      }))
    }

    if (userId === 403) {
      return yield* Effect.fail(new PermissionError({
        _tag: "PermissionError" as const,
        message: "无权修改该用户",
      }))
    }

    const user: User = { id: userId, name: `旧名称-${userId}`, email: `user${userId}@test.com` }
    return { ...user, name: newName }
  })
}

// Effect 调用 — 精确的错误处理
async function effectDemo() {
  // 场景 1: 正常成功
  const result1 = await Effect.runPromise(
    updateUserNameEffect(1, "新名称"),
  )
  console.log("✅ 成功:", result1.name)

  // 场景 2: 校验失败 — catchTag 精确捕获
  const result2 = await Effect.runPromise(
    updateUserNameEffect(1, "").pipe(
      Effect.catchTag("ValidationError", (err) =>
        Effect.succeed(`校验失败已处理: ${err.description}`),
      ),
    ),
  )
  console.log("✅ 正确处理:", result2)

  // 场景 3: 用户不存在 — catchTag 精确捕获
  const result3 = await Effect.runPromise(
    updateUserNameEffect(404, "新名称").pipe(
      Effect.catchTag("NotFoundError", (err) =>
        Effect.succeed(`未找到已处理: ${err.description}`),
      ),
    ),
  )
  console.log("✅ 正确处理:", result3)

  // 场景 4: 权限不足 — catchTag 精确捕获
  const result4 = await Effect.runPromise(
    updateUserNameEffect(403, "新名称").pipe(
      Effect.catchTag("PermissionError", (err) =>
        Effect.succeed(`权限错误已处理: ${err.description}`),
      ),
    ),
  )
  console.log("✅ 正确处理:", result4)

  // 场景 5: 统一处理所有已知错误
  const result5 = await Effect.runPromise(
    updateUserNameEffect(404, "测试").pipe(
      Effect.catchAll((err) =>
        Effect.succeed(`统一处理: ${err._tag} — ${err.message}`),
      ),
    ),
  )
  console.log("✅ 统一处理:", result5)
}

await effectDemo()

// ============================================================
// 对比总结
// ============================================================

console.log("\n=== 对比总结 ===\n")

console.log("维度          | try/catch                    | Effect-TS")
console.log("--------------|------------------------------|------------------------------")
console.log("错误类型      | unknown，需 instanceof       | 签名中明确声明")
console.log("类型安全      | 无编译时检查                 | 编译器强制处理")
console.log("精确捕获      | if/else instanceof 链       | catchTag 按 _tag 匹配")
console.log("恢复策略      | 只能在 catch 中处理          | retry / orElse / either")
console.log("可组合性      | 难以组合多个错误处理         | pipe 链式组合")
console.log("文档化        | 需要 JSDoc 描述可能错误      | 类型签名即文档")

console.log("\n核心差异:")
console.log("  1. Effect 的错误类型是签名的一部分，TypeScript 编译器能检查你是否处理了所有错误")
console.log("  2. catchTag 让你按错误 _tag 精确捕获，比 instanceof 链更可靠")
console.log("  3. Effect 提供重试、降级、Either 转换等丰富的恢复策略")
console.log("  4. 错误处理逻辑通过 pipe 组合，而不是嵌套的 try/catch")

console.log("\n✅ 04-vs-try-catch.ts 运行完成")
