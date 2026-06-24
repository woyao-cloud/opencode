# ch12-stream — Stream 响应式数据处理

本目录包含第 12 章「Stream 响应式数据处理」的示例代码。

## 运行方式

```bash
# 安装依赖
bun install

# 运行各示例
bun run demo:create       # 创建 Stream
bun run demo:transform    # 转换 Stream
bun run demo:consume      # 消费 Stream
bun run demo:merge        # 合并与分流
bun run demo:backpressure # 背压机制
```

## 示例列表

| 文件 | 主题 | 演示内容 |
|------|------|---------|
| `01-create-stream.ts` | 创建 Stream | fromIterable, fromEffect, fromQueue, make+repeat, range |
| `02-transform.ts` | 转换 Stream | map, filter, tap, mapEffect, take, drop, changes |
| `03-consume.ts` | 消费 Stream | runCollect, runForEach, runFold, runHead, runCount, runDrain |
| `04-merge-zip.ts` | 合并与分流 | merge, zip, concat, broadcast, groupBy |
| `05-backpressure.ts` | 背压机制 | pull-based 模型, buffer, throttle, 生产者-消费者速率 |

## 前置知识

- 第 2 章 Effect 基础
- 第 11 章 Fiber
