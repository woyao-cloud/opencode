# Schema 系统：类型安全的 JSON

> **目标读者**：熟悉 Jackson/Gson 序列化、JPA `@Column` 注解、Java Bean Validation 的开发者。
> **本章目标**：理解 Effect Schema 如何在一个声明中同时完成类型校验、序列化和编解码，以及它背后的设计哲学。

---

## 3.1 从一个 Java 开发者的困惑开始

你有没有遇到过这种情况？

一个 Java 项目里，同一个"用户"实体，在三个地方定义了三次：

```java
// 定义 1：JPA 实体——给数据库用
@Entity
@Table(name = "users")
public class UserEntity {
    @Id
    private Long id;
    @Column(name = "user_name")
    private String name;
    @Column(name = "email_addr")
    private String email;
}

// 定义 2：DTO——给 API 用
public class UserDTO {
    private Long id;
    @JsonProperty("user_name")
    private String name;
    @JsonProperty("email_addr")
    private String email;
}

// 定义 3：内部模型——给业务逻辑用
public class User {
    private Long id;
    private String name;
    private String email;
}
```

然后有一天，产品经理说"把 `email_addr` 改成 `email_address`"——你要改三个文件，改一个映射配置，还要祈祷没有忘记第四个地方。如果你在微服务架构中，可能还要跨仓库改。

这个问题的根源在于：**Java 的类型系统和运行时序列化是分离的**。`int` 在 JVM 中是 `int`，但 `int` 在 JSON 中怎么表示——那是 Jackson 的事，和 Java 类型系统无关。

### Effect Schema 的解决思路

Effect Schema 的做法是：**把"这个数据的结构是什么"和"这个数据怎么序列化"合并在同一个声明中**。

```typescript
// Effect Schema：一次定义，所有功能自动获得
const User = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String.pipe(
    Schema.pattern(/^[^@]+@[^@]+$/)   // 校验规则直接嵌在类型声明里
  ),
})

// 自动获得的能力：
type User = typeof User.Type
// → { id: number; name: string; email: string }

// JSON 编码
Schema.encodeSync(User)({ id: 1, name: "Alice", email: "alice@test.com" })
// → JSON 字符串

// JSON 解码（自动校验 email 格式）
Schema.decodeSync(User)({ id: 1, name: "Alice", email: "not-an-email" })
// ❌ ParseError: 邮箱格式不正确
```

**以后字段改名怎么办？**——只改这一个 Schema。所有使用 `User.Type` 的地方自动感知新类型。

---

## 3.2 Schema 核心概念：类型 + 校验 + 编解码 = 三位一体

### 3.2.1 Schema 的哲学

先停下来想想这个问题：**"类型"到底是什么？**

在 Java 中，`int` 是一个类型——它告诉你"这是一个 32 位有符号整数"。但它没有告诉你"这个整数的范围是 0 到 150"——那是校验逻辑，你要用 Bean Validation 的 `@Min(0) @Max(150)` 来表达。

换句话说，Java 把"类型"和"约束"分开了。分开意味着你可以有一个类型为 `int` 但值为 `-1` 的"年龄"字段——编译器不会检查，校验器在运行期才会报错。

Effect Schema 的哲学是：**约束就是类型**。一个 0 到 150 的整数就是一个和"普通整数"不同的类型。

```typescript
// 在 Schema 中，"0-150 的整数"是一个类型，不是"整数类型 + 校验注解"
const Age = Schema.Number.pipe(
  Schema.int(),                // 必须是整数
  Schema.between(0, 150),     // 必须在 0-150
)

// 如果你传入了 -1：
Schema.decodeSync(Age)(-1)
// ParseError: -1 不在 0-150 范围内
// 不是"运行时校验报错"，而是"解码失败"——类型不匹配
```

这个区别看起来很微妙，但它有一个重要的后果：**在 Effect 中，解码失败是一个"类型错误"**，和处理逻辑错误的方式完全不同。在 Java 中，校验失败和逻辑异常混在同一个 `try/catch` 里——你分不清"用户传了非法参数"和"数据库连接断了"。

### 3.2.2 Schema 的三种用法

```typescript
// 用法 1：定义数据模型（最常用）
const Person = Schema.Struct({
  name: Schema.String,
  age: Schema.Number.pipe(Schema.int(), Schema.between(0, 150)),
})

// 用法 2：编码（TypeScript 对象 → JSON 兼容对象）
const jsonData = Schema.encodeSync(Person)({ name: "Alice", age: 30 })
// → { name: "Alice", age: 30 }

// 用法 3：解码（JSON 兼容对象 → TypeScript 对象，带校验）
const person = Schema.decodeSync(Person)(jsonData)
// → { name: "Alice", age: 30 }
// 如果 age 是 -1 → ParseError
```

### 3.2.3 对比 Java 的三件套

```java
// Java: 三套体系

// 1. 类型：Java 类型系统
public class Person {
    private String name;       // 类型：String
    private int age;           // 类型：int（可以是 -1）
}

// 2. 校验：Bean Validation
public class Person {
    @NotNull
    private String name;
    @Min(0) @Max(150)
    private int age;           // 校验说 0-150，但类型说 int（包含 -1）
}

// 3. 序列化：Jackson
public class Person {
    @JsonProperty("user_name")
    private String name;
}
```

```typescript
// Effect: 一个 Schema 顶三套
const Person = Schema.Struct({
  name: Schema.String,                   // 类型 + 非空校验 + JSON 序列化
  age: Schema.Number.pipe(
    Schema.int(),
    Schema.between(0, 150),              // 类型要求 0-150（编译期 + 运行期）
  ),
})
```

**对于 Java 开发者来说**：Schema 相当于同时做了三件事——你定义了一个类（Java `class`），给它加了校验注解（`@Min` `@Max`），还配置了 JSON 序列化（`@JsonProperty`）——而且只用了一组声明。

---

## 3.3 品牌类型：Java 包装类的"零成本"版本

### 3.3.1 一个真实的 Bug 故事

想象一下这个场景。你是一个 Java 开发者，正在排查一个生产环境的问题：用户的数据被存到了另一个用户的账号下。

你查了三天的日志，最终发现是这样一个 bug：

```java
// 一个参数传反了的悲剧
public void saveSession(String sessionId, String userId) {
    // 把 session 存到 userId 对应的用户下
    db.insert("sessions", sessionId, userId);
}

// 调用的地方
String sessionId = "ses_001";
String userId = "user_042";

// 不小心传反了
saveSession(userId, sessionId);
// → 把 session 存到了 ses_001 用户下——这是另一个用户的 ID！
// → 编译通过，测试通过（因为测试数据"恰好"都有这个 ID）
// → 生产环境出了大问题
```

问题的根源在于：`sessionId` 和 `userId` 都是 `String`——编译器分不清它们。在 Java 中，解决这个问题需要创建包装类：

```java
// Java 的解决方案：包装类
public class SessionId {
    private final String value;
    public SessionId(String value) { this.value = value; }
    // getter, equals, hashCode...
}

public class UserId {
    private final String value;
    public UserId(String value) { this.value = value; }
    // 又是同样的 getter, equals, hashCode...
}

// 现在编译器能区分了
public void saveSession(SessionId sessionId, UserId userId) { ... }
saveSession(new SessionId("ses_001"), new UserId("user_042"));  // ✅
saveSession(new UserId("user_042"), new SessionId("ses_001"));  // ❌ 编译错误！
```

包装类解决了问题，但有代价：
- 每个包装类 20+ 行样板代码
- 运行时每个 String 包装成一个对象——增加内存和 GC 压力
- JSON 序列化需要额外配置（`@JsonValue`、`@JsonCreator`）

### 3.3.2 Effect Schema 的品牌类型

```typescript
// TypeScript 品牌类型：编译期区分，运行时仍然是普通的 string
const AccountID = Schema.String.pipe(
  Schema.brand("AccountID"),
)
type AccountID = typeof AccountID.Type
// 运行时是 string，编译期是 AccountID

const ServiceID = Schema.String.pipe(Schema.brand("ServiceID"))
type ServiceID = typeof ServiceID.Type

// 在函数签名中使用
function getAccount(id: AccountID): Effect<Account, never, never> { ... }
function getService(id: ServiceID): Effect<Service, never, never> { ... }

// 编译器检查
getAccount(serviceID)  // ❌ 编译错误！ServiceID 不是 AccountID
getAccount(accountID)  // ✅ 正确

// 但运行时，accountID 和 serviceID 都是普通的 string——没有对象开销！
```

**品牌类型的工作原理**——一个"幻影类型"：

```typescript
// 品牌类型编译后的样子
// 编译前：
type AccountID = string & { readonly _brand: "AccountID" }

// 编译后：
// 就只是 string —— _brand 是"幻影"，只在编译期存在

// 运行时的验证：
const id: AccountID = AccountID.make("acc_001")
console.log(typeof id)           // "string" —— 运行时是普通字符串
console.log(id)                  // "acc_001"
console.log(id.length)           // 8 —— 可以使用 String 的所有方法

// 但编译器知道：
function fn(x: AccountID) { ... }
fn("acc_001")                    // ❌ 编译错误！string 不是 AccountID
fn(AccountID.make("acc_001"))    // ✅
```

**对比 Java 包装类的内存开销**：

```
// Java: 包装类 ~24 bytes 对象头 + 字符串引用
SessionId id = new SessionId("ses_001");
// 内存: 对象头(12-16 bytes) + 字符串引用(8 bytes) = ~20-24 bytes

// TypeScript: 品牌类型 0 bytes 额外开销
const id: AccountID = "ses_001"
// 内存: 就是普通的字符串，没有任何包装
```

### 3.3.3 withStatics：给 Schema 附加工厂方法

品牌类型经常需要配合 `withStatics` 使用——给 Schema 添加静态工厂方法：

```typescript
// 没有 withStatics 的写法：
const ID = Schema.String.pipe(Schema.brand("Event.ID"))
// 创建实例时调用者需要：
const id = ID.make("evt_" + Identifier.ascending())
// 每次都要写 "evt_" + ... → 容易漏掉前缀

// 有 withStatics 的写法：
const ID = Schema.String.pipe(
  Schema.brand("Event.ID"),
  withStatics((schema) => ({
    create: () => schema.make("evt_" + Identifier.ascending()),
  })),
)

// 调用者只需：
const id = ID.create()  // → "evt_01JQXR..."
// 不需要知道内部前缀的规则
```

**为什么不用普通的函数？**

```typescript
// 普通函数也行：
function createEventID() {
  return "evt_" + Identifier.ascending()
}

// 但 withStatics 的优势是：create 方法和 Schema 绑定在一起
// 任何看到 ID.create() 的人都知道——这是一个 Event ID
// 而 createEventID() 是一个"不知道在哪里的函数"
```

---

## 3.4 Schema.Class：定义"真正的类"

### 3.4.1 什么时候用 Schema.Class

`Schema.Struct` 适合简单的数据对象。但如果你需要**实例方法**、**继承**、或者**联合类型**，就需要 `Schema.Class`。

看 AuthV2 中的实际例子——两种不同类型的凭证：

```typescript
// API Key 凭证
export class ApiKeyCredential extends Schema.Class<ApiKeyCredential>("AuthV2.ApiKeyCredential")({
  type: Schema.Literal("api"),              // 类型标记：api
  key: Schema.String,                       // API Key 字符串
  metadata: Schema.optional(                // 可选的元数据
    Schema.Record(Schema.String, Schema.String)
  ),
}) {}

// OAuth 凭证
export class OAuthCredential extends Schema.Class<OAuthCredential>("AuthV2.OAuthCredential")({
  type: Schema.Literal("oauth"),            // 类型标记：oauth——和上面不同
  access: Schema.String,                    // access token
  refresh: Schema.String,                   // refresh token
  expires: Schema.Number,                   // 过期时间
}) {}
```

### 3.4.2 联合类型：Java 继承的替代方案

在 Java 中，`ApiKeyCredential` 和 `OAuthCredential` 通常会这样组织：

```java
// Java：类的继承体系
public abstract class Credential { }

public class ApiKeyCredential extends Credential {
    private String key;
}

public class OAuthCredential extends Credential {
    private String accessToken;
    private String refreshToken;
    private long expiresAt;
}

// 使用：需要 instanceof
Credential cred = getCredential();
if (cred instanceof ApiKeyCredential) {
    String key = ((ApiKeyCredential) cred).getKey();  // 强制转换
}
```

在 Effect 中，用的是联合类型——不需要继承：

```typescript
// TypeScript：联合类型——不需要继承
const Credential = Schema.Union([ApiKeyCredential, OAuthCredential])

// 使用：根据 type 字段区分
function useCredential(cred: typeof Credential.Type) {
  if (cred.type === "api") {
    // TypeScript 自动推断：cred 是 ApiKeyCredential
    console.log(cred.key)        // ✅ 类型安全
    // console.log(cred.refresh) // ❌ 编译错误——api 类型没有 refresh
  }

  if (cred.type === "oauth") {
    // TypeScript 自动推断：cred 是 OAuthCredential
    console.log(cred.expires)    // ✅
  }
}
```

**联合类型 vs 继承体系的对比**：

| 对比维度 | Java 继承 | TypeScript 联合类型 |
|----------|-----------|-------------------|
| 添加新类型 | 需要新建一个类，可能需要改父类 | 在联合类型中添加即可 |
| 类型区分 | `instanceof` + 强制类型转换 | 根据标记字段（`type`）自动推断 |
| 穷尽性检查 | 没有——忘了处理某种类型编译器不报错 | 有的——switch 所有分支后编译器知道已穷尽 |

### 3.4.3 一个完整的实战例子

假设你需要定义一个"聊天消息"类型，有三种可能：文本消息、图片消息、工具调用消息。

```typescript
// 1. 定义三种消息类型
class TextMessage extends Schema.Class<TextMessage>("Message.Text")({
  type: Schema.Literal("text"),
  content: Schema.String,
  timestamp: Schema.Number,
}) {}

class ImageMessage extends Schema.Class<ImageMessage>("Message.Image")({
  type: Schema.Literal("image"),
  url: Schema.String,
  width: Schema.Number,
  height: Schema.Number,
  timestamp: Schema.Number,
}) {}

class ToolCallMessage extends Schema.Class<ToolCallMessage>("Message.ToolCall")({
  type: Schema.Literal("tool_call"),
  toolName: Schema.String,
  arguments: Schema.Record(Schema.String, Schema.Unknown),
  timestamp: Schema.Number,
}) {}

// 2. 联合类型
const Message = Schema.Union([TextMessage, ImageMessage, ToolCallMessage])

// 3. 使用——类型安全的处理每种消息
function handleMessage(msg: typeof Message.Type) {
  switch (msg.type) {
    case "text":
      // 这里 TypeScript 知道 msg 是 TextMessage
      console.log(`Text: ${msg.content}`)
      break
    case "image":
      // 这里 TypeScript 知道 msg 是 ImageMessage
      console.log(`Image: ${msg.width}x${msg.height}`)
      break
    case "tool_call":
      // 这里 TypeScript 知道 msg 是 ToolCallMessage
      console.log(`Tool: ${msg.toolName}`)
      break
    // 不需要 default——编译器知道所有分支都覆盖了
  }
}
```

---

## 3.5 TaggedError：类型安全的错误定义

### 3.5.1 从 Java 的异常类说起

```java
// Java
public class PaymentException extends Exception {
    private final String transactionId;
    private final int errorCode;

    public PaymentException(String transactionId, int errorCode, String message) {
        super(message);
        this.transactionId = transactionId;
        this.errorCode = errorCode;
    }
}
```

这段代码的作用是：定义一个携带业务数据的异常。但在 Java 中，`Exception` 是可序列化的吗？不一定——取决于你有没有正确实现 `Serializable`。它能被 JSON 序列化吗？不能——Jackson 默认不序列化异常。

### 3.5.2 TaggedError 的三个优势

```typescript
// Effect: TaggedError 自动获得 Schema 的所有能力

// 1. 定义
export class ProviderNotFoundError extends Schema.TaggedErrorClass<ProviderNotFoundError>()(
  "CatalogV2.ProviderNotFound",
  { providerID: ProviderV2.ID },
) {}

// 2. JSON 序列化——不需要任何额外配置
const err = new ProviderNotFoundError({
  providerID: ProviderV2.ID.make("unknown-provider")
})
JSON.stringify(err)
// → {"_tag":"CatalogV2.ProviderNotFound","providerID":"unknown-provider"}

// 3. JSON 反序列化——自动重建错误对象
const parsed = Schema.decodeSync(ProviderNotFoundError)(json)
// → ProviderNotFoundError { _tag: "...", providerID: "unknown-provider" }

// 4. 精确捕获——用 _tag 字符串匹配
yield* someEffect.pipe(
  Effect.catchTag("CatalogV2.ProviderNotFound", (err) => {
    console.log(`Provider ${err.providerID} not found`)
    return Effect.succeed(defaultValue)
  }),
)
```

**三个优势**：
1. **可序列化**——任何 TaggedError 都可以变成 JSON，也可以从 JSON 还原
2. **可模式匹配**——用字符串标签精确捕获，不需要 `instanceof`
3. **自带 Schema**——不需要额外配置，Schema 自动派生

---

## 3.6 完整示例：从 JSON 到对象的全过程

```typescript
// 假设我们从 HTTP API 收到一个 JSON 请求：
const rawJson = `{
  "id": "ses_001",
  "title": "Fix login bug",
  "model": {
    "provider": "anthropic",
    "name": "claude-sonnet-4"
  },
  "messages": [
    {"role": "user", "content": "帮我修复登录页面"},
    {"role": "assistant", "content": "好的，让我看一下你的登录代码"}
  ]
}`

// 1. 定义 Schema
const SessionSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  model: Schema.Struct({
    provider: Schema.String,
    name: Schema.String,
  }),
  messages: Schema.Array(
    Schema.Struct({
      role: Schema.Literal("user", "assistant"),
      content: Schema.String,
    })
  ),
})

// 2. JSON → 未知对象（JSON.parse）
const unknown = JSON.parse(rawJson)

// 3. 解码 + 校验（Schema.decodeUnknownSync）
const session = Schema.decodeUnknownSync(SessionSchema)(unknown)
// 如果 JSON 格式不对（比如 messages 缺少 content 字段）→ ParseError

// 4. 现在 session 是类型安全的
console.log(session.messages[0].role)     // "user"
console.log(session.model.provider)       // "anthropic"
```

**如果 Java 开发者来做同样的事**：

```java
// Java
// 1. 定义 DTO 类（10+ 行）
// 2. 写 Jackson 注解（@JsonProperty）
// 3. 写 Bean Validation 注解（@NotNull）
// 4. 调用 ObjectMapper.readValue()
// 5. 调用 Validator.validate()
// 总共：~30 行代码，分布在 2 个文件中

// Effect
// 1. Schema.Struct({...}) 一行定义
// 2. Schema.decodeUnknownSync() 一行调用
// 总共：~10 行代码，一个文件
```

---

## 3.7 ⚠️ 常见错误

**错误 1：用 Schema.Type 代替 Schema 本身**

```typescript
// ❌ 错误
type User = typeof UserSchema.Type
function save(user: User) { ... }
// save 接受的是 JavaScript 对象，不是 Schema

// ✅ 正确
function save(user: typeof UserSchema.Type) { ... }
// 或者：
type User = typeof UserSchema.Type
function save(user: User) { ... }
```

**错误 2：忘记 Schema 能做的自动校验**

```typescript
// ❌ 自己写校验，和 Schema 重复
const Age = Schema.Number
function validateAge(age: number) {
  if (age < 0 || age > 150) throw new Error("Invalid age")
}

// ✅ Schema 自带校验
const Age = Schema.Number.pipe(
  Schema.int(),
  Schema.between(0, 150),
)
// 解码时自动校验
Schema.decodeSync(Age)(-1)  // → ParseError
```

**错误 3：品牌类型只在函数签名中有用**

```typescript
// ✅ 正确用法：在函数签名中用品牌类型
function findUser(id: UserID): Effect<User, never, never> { ... }

// ❌ 只在类型定义中用，但函数签名用 string
function findUser(id: string): Effect<User, never, never> { ... }
// 那品牌类型就没起作用了
```

---

## 3.8 试试看

**练习**：为"电商订单"定义一套 Schema。

需求：
1. 订单有 ID、用户 ID、商品列表、总金额、创建时间
2. 订单状态是枚举：`pending`、`paid`、`shipped`、`delivered`、`cancelled`
3. 总金额必须大于 0
4. 商品列表中每个商品有名称、单价、数量

**预期的输出结构**：

```typescript
// 提示：试试用 Schema.Struct + Schema.Array + Schema.Literal
// 解码一个合法的 JSON 应该成功
// 解码一个不合法的 JSON（如 status="unknown"）应该失败
// 解码一个总金额 <= 0 的 JSON 应该失败
```

---

## 3.9 本章小结

| Java 概念 | Effect Schema 对应 | 核心区别 |
|-----------|-------------------|----------|
| `class + @Column + @JsonProperty` | `Schema.Struct({...})` | 一次定义，同时覆盖类型/校验/序列化 |
| `@NotNull` `@Min` `@Max` | `Schema.pipe(int(), between(0,150))` | 约束即类型——编译期和运行期都有效 |
| 包装类（如 `SessionId`） | `Schema.brand("SessionId")` | 零运行时开销——编译期"幻影"类型 |
| `instanceof` + 类型转换 | 联合类型 + `type` 字段 | 编译器自动推断，不需要强制转换 |
| `Exception` 类 | `Schema.TaggedErrorClass` | 可序列化、可模式匹配 |
| `ObjectMapper` + `Validator` | `Schema.decodeSync` | 解码 + 校验一步完成 |

**下一章预告**：EventV2——事件总线。有了 Schema 的基础，我们会看到如何用类型安全的事件定义来解耦系统组件。