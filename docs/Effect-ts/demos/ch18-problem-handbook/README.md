# ch18-problem-handbook — 典型问题处理手册

本章汇集 Effect-TS 开发中常见的五类典型问题及其解决方案，每个场景都包含完整的可运行代码：

- **01-long-running-task** — 长任务超时、中断与检查点模式
- **02-rate-limiting** — 限流与并发控制（令牌桶、Schedule.spaced）
- **03-graceful-degradation** — 优雅降级（allSuccesses、partition、fallback 链）
- **04-debugging** — 调试与诊断（Cause.pretty、tap/tapError、Fiber.dump、withLogSpan）
- **05-anti-patterns** — 5 个常见反模式及正确写法

## 安装

```bash
cd docs/Effect-ts/demos/ch18-problem-handbook
bun install
```

## 运行

```bash
# 场景 1: 长任务超时与检查点
bun run demo:long-running

# 场景 2: 限流与并发控制
bun run demo:rate-limiting

# 场景 3: 优雅降级
bun run demo:degradation

# 场景 4: 调试与诊断
bun run demo:debugging

# 场景 5: 反模式与正确写法
bun run demo:anti-patterns
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/01-long-running-task.ts` | 超时控制、onInterrupt 清理、检查点模式 |
| `src/02-rate-limiting.ts` | 令牌桶限流、Schedule.spaced、并发度控制 |
| `src/03-graceful-degradation.ts` | allSuccesses、partition、orElseSucceed、fallback 链 |
| `src/04-debugging.ts` | Cause.pretty、tap/tapError、Fiber.dump、withLogSpan |
| `src/05-anti-patterns.ts` | 5 个反模式及对应的正确实现 |
