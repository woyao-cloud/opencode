/**
 * util/queue - 异步队列与并发控制工具
 *
 * 功能概述：
 * - 提供异步队列，支持生产者-消费者模式
 * - 提供并发工作器，控制任务并行度
 *
 * 核心导出：
 * - AsyncQueue：异步队列，支持 push/next 和 async 迭代
 * - work：以指定并发数执行任务列表
 *
 * 架构位置：通用工具层，无其他依赖
 */

export class AsyncQueue<T> implements AsyncIterable<T> {
  private queue: T[] = []
  private resolvers: ((value: T) => void)[] = []

  push(item: T) {
    const resolve = this.resolvers.shift()
    if (resolve) resolve(item)
    else this.queue.push(item)
  }

  async next(): Promise<T> {
    if (this.queue.length > 0) return this.queue.shift()!
    return new Promise((resolve) => this.resolvers.push(resolve))
  }

  async *[Symbol.asyncIterator]() {
    while (true) yield await this.next()
  }
}

export async function work<T>(concurrency: number, items: T[], fn: (item: T) => Promise<void>) {
  const pending = [...items]
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const item = pending.pop()
        if (item === undefined) return
        await fn(item)
      }
    }),
  )
}
