# TypeScript 基础：Java 开发者快速上手

> **目标读者**：熟悉 Java 8+、了解泛型、注解和 Maven 模块概念的开发者。
> **本章目标**：用 30 分钟建立阅读 OpenCode 源码所需的 TypeScript 知识。

---

## 1.1 类型系统：interface 不只是 interface

### 1.1.1 回顾 Java 的 interface

Java 的 interface 定义行为契约：

```java
// Java
public interface UserService {
    User findById(String id);
    void save(User user);
}
```

在 Java 中，interface 只能描述**行为**（方法签名），不能描述**数据形状**（字段）。

### 1.1.2 TypeScript 的 interface：行为 + 数据

```typescript
// TypeScript: interface 既描述数据形状，也描述行为
interface User {
  id: string      // 数据字段
  name: string
  email?: string  // 可选字段 (Java 中没有直接对应)
}

interface UserService {
  findById(id: string): Promise<User | undefined>  // 行为方法
  save(user: User): Promise<void>
}
```

**对 Java 开发者来说**：TypeScript 的 `interface` 更像是 `POJO + interface` 的结合体。一个 `interface` 可以同时包含字段和方法。

### 1.1.3 type 关键字：Java 没有的灵活性

TypeScript 的 `type` 可以创建 Java 中需要多个类才能表达的联合类型：

```typescript
// 联合类型: 值可以是 A 或 B（Java 中需要继承体系）
type Status = "idle" | "busy" | "error"      // 字符串字面量联合
type ID = string | number                      // 类型联合
type Result<T> = { success: true; data: T }    //  discriminated union
               | { success: false; error: Error }

// 交叉类型: 合并多个类型（Java 中需要多继承或接口组合）
type WithTimestamp = { createdAt: number; updatedAt: number }
type AuditableUser = User & WithTimestamp      // 合并两个类型
```

### 1.1.4 Java vs TypeScript 类型对照表

| Java | TypeScript | 说明 |
|------|-----------|------|
| `class User { String id; }` | `interface User { id: string }` | 数据模型定义 |
| `T` 泛型 | `T` 泛型 | 类似，但 TS 更灵活 |
| `Optional<User>` | `User \| undefined` | 可选值的表达 |
| `@NotNull String name` | `name: string` | 非空（默认就是非空） |
| `@Nullable String name` | `name?: string` | 可选字段用 `?` |
| `enum Status { IDLE, BUSY }` | `type Status = "idle" \| "busy"` | 字面量联合类型替代枚举 |
| `public class Pair<A,B> { ... }` | `type Pair<A,B> = [A,B]` | 元组类型 |
| `record User(String id, String name)` | `type User = { id: string; name: string }` | Java 16 record |

---

## 1.2 泛型：TypeScript 比 Java 更灵活

### 1.2.1 Java 的泛型

```java
// Java 泛型
public class Box<T> {
    private T value;
    public T get() { return value; }
    public void set(T value) { this.value = value; }
}

// 使用时要指定类型
Box<String> box = new Box<>();
```

Java 的泛型是**编译期擦除**的——运行时不知道 `T` 是什么类型。

### 1.2.2 TypeScript 的泛型

```typescript
// TypeScript 泛型
class Box<T> {
  constructor(private value: T) {}
  get(): T { return this.value }
}

// TypeScript 泛型约束（类似 Java 的 <T extends Comparable>）
function getLength<T extends { length: number }>(item: T): number {
  return item.length
}
```

**关键区别**：
- TypeScript 的泛型是**保留到运行时**的（通过编译期类型检查）
- TypeScript 支持**条件类型**（Java 没有）：

```typescript
// 条件类型: 根据输入类型决定输出类型
type IsString<T> = T extends string ? "yes" : "no"
type A = IsString<"hello">  // "yes"
type B = IsString<42>       // "no"
```

### 1.2.3 在 OpenCode 中的实际使用

```typescript
// packages/core/src/schema.ts:64-67
// withStatics: 给一个 Schema 附加静态方法
export const withStatics =
  <S extends object, M extends Record<string, unknown>>(
    methods: (schema: S) => M
  ) =>
  (schema: S): S & M =>
    Object.assign(schema, methods(schema))
```

这个泛型约束 `S extends object` 确保 `schema` 是一个对象类型，`M extends Record<string, unknown>` 确保静态方法是一个字符串键到未知值的映射。

---

## 1.3 模块系统：从 Maven/Gradle 到 ESM

### 1.3.1 Maven 模块

```xml
<!-- Java Maven: 每个模块一个 pom.xml -->
<groupId>com.opencode</groupId>
<artifactId>opencode-core</artifactId>
<version>1.0.0</version>
<dependencies>
    <dependency>
        <groupId>io.effect</groupId>
        <artifactId>effect</artifactId>
    </dependency>
</dependencies>
```

### 1.3.2 TypeScript ES Module

```typescript
// TypeScript: 每个文件就是一个模块
// packages/core/src/auth.ts:1-4
import path from "path"
import { Effect, Layer, Option, Schema, Context, SynchronizedRef } from "effect"
import { Identifier } from "./util/identifier"

// 导出（其他文件可以 import）
export class Service extends Context.Service<Service, Interface>()("@opencode/v2/Auth") {}
export const layer = Layer.effect(Service, ...)
export * as AuthV2 from "./auth"  // 命名空间导出
```

**关键概念**：
- **每个文件都是一个模块**（不像 Java 每个文件只能有一个 public class）
- **`import` 替代 `import`**（Java 的 `import` 是编译期，TS 的 `import` 是运行时的）
- **`export` 替代 `public`**（不 export 的就是私有的）
- **`export * as AuthV2 from "./auth"`** — 创建一个命名空间导出，这是 OpenCode 中常见的模式

### 1.3.3 OpenCode 的模块自导出模式

```typescript
// 文件末尾常见的模式
export * as AuthV2 from "./auth"

// 消费者导入
import { AuthV2 } from "@opencode-ai/core/auth"
// 然后使用 AuthV2.Service、AuthV2.layer 等
```

**为什么这么做？**
- 避免 `export namespace AuthV2 { ... }`（这不是标准 ESM）
- 保持树摇（tree-shaking）友好
- 所有导出都在顶层，IDE 能正确提示

---

## 1.4 async/await 与 Promise

### 1.4.1 Java 的 CompletableFuture

```java
// Java
public CompletableFuture<User> findUser(String id) {
    return CompletableFuture.supplyAsync(() -> {
        User user = db.query(id);
        return user;
    });
}

// 调用
User user = findUser("123").get();  // 阻塞
findUser("123").thenAccept(u -> System.out.println(u));  // 非阻塞
```

### 1.4.2 TypeScript 的 Promise

```typescript
// TypeScript
async function findUser(id: string): Promise<User | undefined> {
  const user = await db.query(id)
  return user
}

// 调用
const user = await findUser("123")  // await = 阻塞但非阻塞线程
findUser("123").then(u => console.log(u))  // 非阻塞回调
```

**关键区别**：
- TypeScript 的 `await` 不会阻塞线程（JavaScript 是单线程事件循环）
- Java 的 `.get()` 会阻塞线程（需要线程池来管理）
- Effect 比 Promise 更强大——我们下一章会详细讲

### 1.4.3 在 OpenCode 中的实际使用

```typescript
// packages/core/src/global.ts:34-42
// 模块加载时并行创建目录
await Promise.all([
  fs.mkdir(Path.data, { recursive: true }),
  fs.mkdir(Path.config, { recursive: true }),
  fs.mkdir(Path.state, { recursive: true }),
  fs.mkdir(Path.tmp, { recursive: true }),
  fs.mkdir(Path.log, { recursive: true }),
  fs.mkdir(Path.bin, { recursive: true }),
  fs.mkdir(Path.repos, { recursive: true }),
])
```

上面这段代码等价于 Java 的 `CompletableFuture.allOf()`。

---

## 1.5 本章小结

| Java 概念 | TypeScript 对应 | 注意事项 |
|-----------|----------------|----------|
| `interface` (行为契约) | `interface` (数据 + 行为) | TS interface 包含字段 |
| `enum` | `type X = "a" \| "b"` | 字面量联合类型更灵活 |
| `Optional<T>` | `T \| undefined` | 联合类型空值 |
| `public class` | `export` | 不 export 的就是私有 |
| `import pkg` | `import` / `import type` | ES module |
| `CompletableFuture` | `Promise` | 单线程事件循环 vs 线程池 |
| `Maven/Gradle` | `npm` / `bun` | JSON 配置 |
| `pom.xml` | `package.json` + `tsconfig.json` | 声明依赖和编译配置 |

**下一章预告**：Effect-ts 是 OpenCode 的核心框架。我们将从 `CompletableFuture` 出发，一步步理解 Effect 是什么、为什么比 Promise 更强大、以及如何使用它来构建可靠的异步应用。