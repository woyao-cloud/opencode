/**
 * 01-pain-points.ts — TypeScript 异步编程的三大痛点
 *
 * 学习目标: 通过三个真实场景，理解为什么需要 Effect-TS
 * 前置章节: 无
 * 运行方式: bun run src/01-pain-points.ts
 *
 * 痛点 1: Promise 错误处理不完整
 * 痛点 2: 依赖注入靠手工管理
 * 痛点 3: 副作用与业务逻辑耦合
 */

// ========== 痛点 1: Promise 错误处理不完整 ==========

// 模拟一个可能失败的 API 调用
async function fetchUserData(id: string): Promise<{ name: string; email: string }> {
  if (id === "error") {
    throw new Error("Network error: Connection refused")
  }
  if (id === "not-found") {
    throw new Error("User not found")
  }
  return { name: "Alice", email: "alice@example.com" }
}

// 问题: 调用者无法从类型签名知道可能发生什么错误
// Promise<{name, email}> 看起来总是成功的，但实际可能抛出各种错误
async function demo1() {
  try {
    const user = await fetchUserData("error")
    console.log("用户:", user)
  } catch (err) {
    // err 是 unknown 类型，无法区分错误类型
    console.log("出了点问题:", String(err))
  }
}

// ========== 痛点 2: 依赖注入靠手工管理 ==========

// 传统方式: 全局单例或手工传递
class Database {
  private static instance: Database
  static getInstance() {
    if (!this.instance) this.instance = new Database()
    return this.instance
  }
  async query(sql: string): Promise<any[]> {
    console.log(`执行查询: ${sql}`)
    return []
  }
}

class UserService {
  // 硬编码依赖 Database.getInstance() — 无法在测试中替换
  async getUsers() {
    const db = Database.getInstance()
    return db.query("SELECT * FROM users")
  }
}

// ========== 痛点 3: 副作用与业务逻辑耦合 ==========

async function processOrder(orderId: string) {
  console.log(`[INFO] 开始处理订单 ${orderId}`) // 副作用: 日志
  const startTime = Date.now()                  // 副作用: 时间

  // 业务逻辑和副作用混在一起
  const result = await fetch(`/api/orders/${orderId}`)
  const data = await result.json()

  console.log(`[INFO] 订单处理完成，耗时 ${Date.now() - startTime}ms`)
  return data
}

// 运行所有演示
async function main() {
  console.log("=== 痛点 1: Promise 错误处理 ===\n")
  await demo1()

  console.log("\n=== 痛点 2: 依赖注入 ===\n")
  const svc = new UserService()
  await svc.getUsers()

  console.log("\n=== 痛点 3: 副作用耦合 ===\n")
  // 不实际调用 fetch，仅展示代码结构
  console.log("（代码结构展示：副作用与业务逻辑混在一起）")
}

main()
