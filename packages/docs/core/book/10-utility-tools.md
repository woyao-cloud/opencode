# 工具函数：坚实的地基

> **目标读者**：熟悉 `java.util.UUID`、`java.util.concurrent.locks`、`SLF4J`、`MessageDigest` 的开发者。
> **本章目标**：理解 OpenCode 的工具函数如何用更轻量的方式解决 Java 中常见的问题。

---

## 10.1 Identifier：ULID 风格的 ID 生成

### 10.1.1 Java 中的 ID 生成

```java
// Java
String uuid = UUID.randomUUID().toString();
// → "550e8400-e29b-41d4-a716-446655440000"

// UUID 的问题：
// 1. 无序：不能按创建时间排序
// 2. 长：36 字符带连字符
// 3. 性能：java.util.UUID.randomUUID() 相对慢
```

### 10.1.2 OpenCode 的 Identifier

```typescript
Identifier.ascending()
// → "01JQXRMYK9A8B3C4D5E6F7G8H9"
```

**设计要点**：

```typescript
// 1. 时间有序：前 10 字符是时间戳
// 2. 唯一：后 16 字符是随机数
// 3. 短：26 字符（无连字符）
// 4. 快：纯计算，无需系统调用

// 用在哪些地方：
// SessionID:   "ses_" + Identifier.ascending()
// EventID:     "evt_" + Identifier.ascending()
// AccountID:   "acc_" + Identifier.ascending()
// MessageID:   Identifier.ascending() 直接使用
// PartID:      Identifier.ascending() 直接使用
```

**对比 Java 的 UUID**：

| 特性 | `UUID.randomUUID()` | `Identifier.ascending()` |
|------|---------------------|--------------------------|
| 长度 | 36 字符 | 26 字符 |
| 排序 | 无序 | 时间有序 |
| 可读性 | 带连字符 | 无连字符 |
| 性能 | 较慢（依赖 SecureRandom） | 快 |
| 碰撞概率 | 极低 | 极低（128 位） |

---

## 10.2 Flock：跨进程文件锁

### 10.2.1 Java 中的文件锁

```java
// Java
File file = new File("/tmp/myapp.lock");
FileChannel channel = new RandomAccessFile(file, "rw").getChannel();
FileLock lock = channel.lock();  // 阻塞直到获得锁
try {
    // 临界区
} finally {
    lock.release();              // 释放锁
    channel.close();
}
```

### 10.2.2 OpenCode 的 Flock

```typescript
// TypeScript: 用函数封装，自动管理锁的生命周期
await Flock.withLock("my-lock-name", async () => {
  // 临界区 - 同一时刻只有一个进程能执行这里
  const data = await read(file)
  data.counter++
  await writeJson(file, data)
  // 锁自动释放（即使抛出异常）
})
```

**实际使用场景：插件元数据写入**：

```typescript
// packages/opencode/src/plugin/meta.ts:147-157
export async function touchMany(items: Touch[]) {
  return Flock.withLock("plugin-meta", async () => {
    const store = await read(file)
    // ... 更新 store ...
    await writeJson(file, store)
    // 锁自动释放
  })
}
```

**和 Java 的区别**：

| Java | Flock | 优势 |
|------|-------|------|
| `try/finally` 释放锁 | 回调自动释放 | 不会忘记 release |
| 崩溃后锁残留 | 进程退出 OS 自动释放 | 无需清理逻辑 |
| `FileLock` 仅 JDK | 纯 JavaScript 实现 | 跨平台 |

---

## 10.3 Log：结构化日志

### 10.3.1 Java 的日志

```java
// Java SLF4J
private static final Logger log = LoggerFactory.getLogger(MyClass.class);

log.info("Processing session: {}", sessionId);

// 输出
// 2026-06-15 12:00:00 [main] INFO  c.o.MyClass - Processing session: ses_001
```

### 10.3.2 OpenCode 的 Log

```typescript
// 创建带标签的 Logger（类似 LoggerFactory.getLogger）
const log = Log.create({ service: "llm" })

log.info("stream started", {
  modelID: "claude-sonnet-4",
  providerID: "anthropic",
})

// 输出
// INFO  service=llm modelID=claude-sonnet-4 providerID=anthropic stream started
```

**关键特性**：

```typescript
// 1. 标签化字段（结构化日志）
log.info("tool call", { tool: "read", args: { filePath: "/foo" } })
// INFO  service=session tool=read args={"filePath":"/foo"} tool call

// 2. 耗时追踪
using _ = log.time("LLM.stream")
// INFO  service=llm LLM.stream status=started
// ... (中间代码执行) ...
// INFO  service=llm LLM.stream status=completed duration=12345

// 3. 克隆 + 上下文标签
const slog = log.clone().tag("session.id", "ses_001")
slog.info("processing")
// INFO  service=llm session.id=ses_001 processing

// 4. 日志级别
log.debug("debug info")    // 仅在 DEBUG 级别输出
log.info("info")           // 默认日志级别
log.warn("warning")        // 警告
log.error("error occurred", { error: err.message })  // 错误
```

### 10.3.3 日志文件管理

```typescript
// 日志文件自动管理
// 生产环境: ~/.local/share/opencode/log/20260615T120000.log
// 开发环境: ~/.local/share/opencode/log/dev.log

// 自动清理：只保留最近 10 个文件
async function cleanup(dir: string) {
  const files = await Glob.scan("????-??-??T??????.log", { cwd: dir })
  if (files.length > 10) {
    // 删除最早的文件
  }
}
```

### 10.3.4 对比 SLF4J

| 特性 | Java SLF4J | OpenCode Log |
|------|-----------|-------------|
| 获取 Logger | `LoggerFactory.getLogger(Class)` | `Log.create({ service: "name" })` |
| 参数化 | `log.info("{}", arg)` | `log.info("msg", { key: val })` |
| 级别 | TRACE/DEBUG/INFO/WARN/ERROR | DEBUG/INFO/WARN/ERROR |
| MDC | `MDC.put("key", "val")` | `log.clone().tag("key", "val")` |
| 输出 | 文件 + console | 文件（按日期/固定）+ stderr |
| 耗时 | 手动记录 | `using _ = log.time("op")` 自动 |

---

## 10.4 Hash：内容哈希

```typescript
// SHA-256 哈希
const hash = Hash.sha256(fileContent)
// → "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

// 用途：文件快照指纹
// 当文件变化时，哈希值变化 → 检测到修改
```

**对比 Java**：

```java
// Java
MessageDigest md = MessageDigest.getInstance("SHA-256");
byte[] hash = md.digest(content.getBytes());
String hex = DatatypeConverter.printHexBinary(hash).toLowerCase();

// TypeScript（OpenCode）
const hash = Hash.sha256(content)  // 一行
```

---

## 10.5 Glob：文件模式匹配

```typescript
// 搜索所有 .json 文件
const files = await Glob.scan("**/*.json", {
  cwd: "/path/to/data",
  include: "file",
})

// 搜索所有日志文件
const logs = await Glob.scan("2026*.log", {
  cwd: Global.Path.log,
  include: "file",
})
```

---

## 10.6 Retry：指数退避重试

```typescript
// 基本重试策略
const policy = Retry.policy({
  maxAttempts: 3,
  baseDelay: 1000,       // 首次等待 1 秒
  maxDelay: 10000,       // 最多等待 10 秒
})

// 和 Effect 搭配使用
yield* llmCall.pipe(
  Effect.retry(policy)   // 声明式重试
)
```

**重试时序**：

```
第 1 次: 失败 → 等待 1s
第 2 次: 失败 → 等待 2s (指数增长)
第 3 次: 失败 → 等待 4s
第 4 次: 用 maxDelay=10s (不超过这个值)
...直到 maxAttempts 耗尽
```

**对比 Java**：

```java
// Java 手动重试
int maxAttempts = 3;
for (int i = 0; i < maxAttempts; i++) {
    try {
        return callAPI();
    } catch (Exception e) {
        if (i == maxAttempts - 1) throw e;
        Thread.sleep((long) (1000 * Math.pow(2, i)));  // 手动指数退避
    }
}

// TypeScript Effect
yield* callAPI().pipe(
  Effect.retry(Retry.policy({ maxAttempts: 3 }))  // 声明式
)
```

---

## 10.7 完整工具函数清单

| 文件 | 功能 | Java 对应 |
|------|------|-----------|
| `identifier.ts` | ULID 风格唯一 ID | `UUID.randomUUID()` |
| `flock.ts` | 跨进程文件锁 | `FileChannel.lock()` |
| `hash.ts` | SHA-256 内容哈希 | `MessageDigest` |
| `log.ts` | 结构化日志系统 | SLF4J |
| `glob.ts` | 文件模式匹配 | `Files.walk()` + glob |
| `retry.ts` | 指数退避重试策略 | 手写 for 循环 |
| `error.ts` | 命名错误类 | `extends Exception` |
| `array.ts` | 数组工具函数 | `Collections` / Stream API |
| `effect-flock.ts` | Effect 版本的 Flock | — |
| `opencode-process.ts` | 进程元数据 | `ManagementFactory` |

---

## 10.8 ⚠️ 常见错误

**错误 1：在非 Effect 代码中使用 Flock 操作 Effect 状态**

```typescript
// ❌ 错误：在 Effect 外面用 Flock
Flock.withLock("my-lock", async () => {
  // 这里不能 yield*，无法使用 Effect 服务
})

// ✅ 正确：在 Effect 内部使用
yield* Effect.promise(() =>
  Flock.withLock("my-lock", async () => {
    return await someAsyncOp()
  })
)
```

**错误 2：忘记日志文件的自动清理机制**

如果手动删除了日志文件而没有通过 `Log.cleanup()`，日志系统只会在下次 `init` 时清理。如果长期运行不重启——日志文件不会自动减少。

---

## 10.9 试试看

**练习**：用本章学到的工具函数实现一个"文件变更检测器"。

需求：
1. 用 `Hash.sha256()` 计算文件的哈希值
2. 定期（用 `Retry.policy` 实现间隔）检查哈希是否变化
3. 如果变化了，用 `Log` 记录"文件已变更"

**期望代码结构**：

```typescript
function watchFile(path: string) {
  return Effect.gen(function* () {
    const log = Log.create({ service: "file-watcher" })
    let lastHash = yield* computeHash(path)

    // 用 Retry 实现轮询逻辑
    // 每次轮询比较哈希值
    // 变化时 log.info("file changed", { path, hash: newHash })
  })
}
```

---

## 10.10 本章小结

这一章介绍的工具函数看似简单，但它们是整个应用的"地基"：

- **Identifier**：支撑会话、消息、事件等所有 ID 的生成
- **Flock**：保证跨进程的文件操作安全
- **Log**：提供全项目统一的结构化日志
- **Hash**：支撑快照系统的文件指纹
- **Retry**：LLM 调用失败时的自动重试

**下一章预告**：附录——Docker Compose 部署、配置详解、环境变量参考、常见问题。