# Schema 系统：类型安全的 JSON

> **目标读者**：熟悉 Jackson/ Gson 序列化、JPA `@Column` 注解、Java Bean Validation 的开发者。
> **本章目标**：理解 Effect Schema 如何在一个声明中同时完成类型校验、序列化和文档生成。

---

## 3.1 从一个 Java 开发者的困惑开始

在 Java 中，处理"数据结构的定义 + 校验 + 序列化"需要至少三套独立的机制：

```java
// Java: 需要三套机制来描述一个数据结构

// 1. JPA 实体（数据库映射）
@Entity
@Table(name = "users")
public class User {
    @Id
    private String id;

    @Column(nullable = false)
    private String name;
}

// 2. Jackson 注解（JSON 序列化）
@JsonIgnoreProperties(ignoreUnknown = true)
public class UserDTO {
    @JsonProperty("user_id")
    private String userId;
}

// 3. Bean Validation（数据校验）
public class UserRequest {
    @NotNull
    @Email
    private String email;
}
```

问题很明显：**同一份数据结构，需要在三个地方重复定义**。如果字段名改了，三处都要改。

### Effect Schema 的方式

```typescript
// TypeScript Effect Schema：一次定义，所有功能自动获得
const User = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String.pipe(           // 内置校验
    Schema.pattern(/^[^@]+@[^@]+$/)
  ),
})

// 自动获得：
// 类型: typeof User.Type = { id: string; name: string; email: string }
// 编码（对象 → JSON）: Schema.encodeSync(User)(user)
// 解码（JSON → 对象）: Schema.decodeSync(User)(json)
// 校验: 自动通过 Schema 定义的类型约束
```

---

## 3.2 Schema 核心概念

### 3.2.1 Schema 是什么？

**Schema = 类型定义 + 运行时校验 + 序列化逻辑** 三者合一。

```typescript
// 一个 Schema 就是一个对象，同时描述了类型和校验规则
const Age = Schema.Number.pipe(
  Schema.int(),                          // 必须是整数
  Schema.between(0, 150),               // 必须在 0-150 之间
)

// Schema.Type 就是 TypeScript 类型
type Age = typeof Age.Type  // number（但运行时做了校验）

// 编码和解码
Schema.decodeSync(Age)(25)     // ✅ -> 25
Schema.decodeSync(Age)(-1)     // ❌ 抛出 ParseError
Schema.decodeSync(Age)("abc")  // ❌ 抛出 ParseError
```

### 3.2.2 对比 Java Bean Validation

```java
// Java: 注解定义校验
public class Person {
    @Min(0) @Max(150)
    private int age;           // 类型是 int，校验是注解
}

// 调用校验
Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
Set<ConstraintViolation<Person>> violations = validator.validate(person);
```

```typescript
// TypeScript: 类型和校验在同一个 Schema 中
const Person = Schema.Struct({
  age: Schema.Number.pipe(Schema.int(), Schema.between(0, 150)),
})

// 类型: { age: number }
type Person = typeof Person.Type

// 解码时自动校验
const result = Schema.decodeUnknownEither(Person)({ age: 25 })
if (Either.isRight(result)) {
  console.log(result.right)  // { age: 25 }
} else {
  console.log(result.left)   // ParseError: age must be between 0 and 150
}
```

**关键区别**：

| Java | Effect Schema |
|------|-------------|
| 类型和校验分离 | 类型和校验合一 |
| 校验是运行期行为 | 校验可以在编译期模拟 |
| 注解驱动 | 函数式组合 |
| 不同序列化格式用不同注解 | 编解码逻辑在 Schema 中内置 |

---

## 3.3 品牌类型：防止"原始类型滥用"

### 3.3.1 Java 中常见的坑

```java
// Java
public void saveSession(String sessionId, String userId) {
    // 两个参数都是 String，传反了编译器也不会报错
}

saveSession(userId, sessionId);  // 😱 编译器不提醒
```

### 3.3.2 Effect Schema 的品牌类型

```typescript
// TypeScript: 品牌类型让不同的 String 不再是同一类型

// packages/core/src/event.ts:6-9
export const ID = Schema.String.pipe(
  Schema.brand("Event.ID"),
  // withStatics: 附加静态方法
  withStatics((schema) => ({
    create: () => schema.make("evt_" + Identifier.ascending()),
  })),
)
```

**品牌类型的工作原理**：

```typescript
// 定义品牌类型
type AccountID = string & { readonly _brand: "AccountID" }
type ModelID = string & { readonly _brand: "ModelID" }

// 使用
function getAccount(id: AccountID) { ... }
function getModel(id: ModelID) { ... }

getAccount(modelID)  // ❌ 编译错误！ModelID 不能赋值给 AccountID
getAccount(accountID)  // ✅ 正确

// 用 Schema.brand 创建
const AccountID = Schema.String.pipe(Schema.brand("AccountID"))
const ModelID = Schema.String.pipe(Schema.brand("ModelID"))
```

**对 Java 开发者来说**：品牌类型类似 Java 中为不同含义的 String 创建包装类：

```java
// Java 模拟品牌类型
public class AccountID {
    private final String value;
    private AccountID(String value) { this.value = value; }
    public static AccountID of(String value) { return new AccountID(value); }
}

public class ModelID {
    private final String value;
    private ModelID(String value) { this.value = value; }
    public static ModelID of(String value) { return new ModelID(value); }
}

// 现在编译器能区分了
void getAccount(AccountID id) { ... }
void getModel(ModelID id) { ... }

getAccount(ModelID.of("xxx"));  // ❌ 编译错误
```

TypeScript 的品牌类型更轻量——它只是一个**编译期的幻影类型**，运行时仍然是普通的 `string`，没有对象包装开销。

### 3.3.3 在 OpenCode 中的实际使用

```typescript
// packages/core/src/auth.ts:10-17
// AuthV2 中使用的品牌类型
const AccountID = Schema.String.pipe(
  Schema.brand("AccountID"),
  withStatics((schema) => ({
    create: () => schema.make("acc_" + Identifier.ascending()),
  })),
)
export type AccountID = typeof AccountID.Type

export const ServiceID = Schema.String.pipe(Schema.brand("ServiceID"))
export type ServiceID = typeof ServiceID.Type

// 防止：
// AuthV2.Service.active(accountID)       // ✅ AccountID
// AuthV2.Service.active(modelID)         // ❌ ModelID 不能赋值
// AuthV2.Service.active("sk-ant-xxx")   // ❌ string 不能赋值
```

---

## 3.4 Schema.Class：定义复杂的嵌套结构

### 3.4.1 Java 的 Class 定义

```java
// Java
public class Account {
    private String id;
    private String serviceID;
    private String description;
    private Credential credential;

    // getters + setters + constructors = 数十行样板代码
}
```

### 3.4.2 Effect Schema.Class

```typescript
// packages/core/src/auth.ts:19-44
// Schema.Class 一行等同于 Java 的 class + 注解 + 校验 + 序列化配置
export class OAuthCredential extends Schema.Class<OAuthCredential>("AuthV2.OAuthCredential")({
  type: Schema.Literal("oauth"),         // 字面量类型
  refresh: Schema.String,
  access: Schema.String,
  expires: NonNegativeInt,               // 自定义 Schema
}) {}

export class ApiKeyCredential extends Schema.Class<ApiKeyCredential>("AuthV2.ApiKeyCredential")({
  type: Schema.Literal("api"),
  key: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
}) {}

// 联合类型（类似 Java 的继承体系）
export const Credential = Schema.Union([OAuthCredential, ApiKeyCredential])
  .pipe(Schema.toTaggedUnion("type"))    // 按 type 字段区分
```

**自动获得的能力**：

```typescript
const cred = new ApiKeyCredential({
  type: "api",
  key: "sk-ant-xxx",
})

// 1. JSON 序列化
const json = Schema.encodeSync(Credential)(cred)
// → { "type": "api", "key": "sk-ant-xxx" }

// 2. JSON 反序列化（自动校验）
const parsed = Schema.decodeSync(Credential)(json)
// → ApiKeyCredential { type: "api", key: "sk-ant-xxx" }

// 3. 使用 isTagged 判断类型
if (cred.type === "api") {
  console.log(cred.key)     // TypeScript 知道 cred 是 ApiKeyCredential
}
if (cred.type === "oauth") {
  console.log(cred.expires) // TypeScript 知道 cred 是 OAuthCredential
}
```

---

## 3.5 错误处理 Schema：TaggedError

### 3.5.1 Java 的异常类

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

### 3.5.2 Effect 的 TaggedError

```typescript
// packages/core/src/catalog.ts:16-26
export class ProviderNotFoundError extends Schema.TaggedErrorClass<ProviderNotFoundError>()(
  "CatalogV2.ProviderNotFound",
  { providerID: ProviderV2.ID },
) {}

export class ModelNotFoundError extends Schema.TaggedErrorClass<ModelNotFoundError>()(
  "CatalogV2.ModelNotFound",
  { providerID: ProviderV2.ID, modelID: ModelV2.ID },
) {}
```

**TaggedError 的优势**：
1. **可序列化**：错误可以 JSON 化，适合跨进程传输
2. **可模式匹配**：用 `"_tag"` 字段精确匹配错误类型
3. **自动 Schema**：继承 Schema 的所有能力

```typescript
// TaggedError 自动获得 Schema 能力
const err = new ProviderNotFoundError({ providerID: ProviderV2.ID.make("unknown") })

// 序列化
JSON.stringify(err)
// → {"_tag":"CatalogV2.ProviderNotFound","providerID":"unknown"}

// 反序列化
Schema.decodeSync(ProviderNotFoundError)(json)
// → ProviderNotFoundError { _tag: "CatalogV2.ProviderNotFound", providerID: "unknown" }

// 精确捕获（用 _tag 值）
Effect.catchTag("CatalogV2.ProviderNotFound", (err) => {
  console.log(`Provider ${err.providerID} not found`)
})
```

---

## 3.6 编解码全流程

```typescript
// 完整的 Schema 定义 + 使用流程

// 1. 定义 Schema
const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  createdAt: Schema.DateTimeUtc,     // Effect Schema 内置的 UTC 时间类型
})

// 2. 类型自动推导
type User = typeof UserSchema.Type
// = { id: string; name: string; createdAt: DateTime.Utc }

// 3. 编码（对象 → JSON）
const user: User = {
  id: "u_001",
  name: "Alice",
  createdAt: DateTime.unsafeMake(0),
}
const json = Schema.encodeSync(UserSchema)(user)
// → { "id": "u_001", "name": "Alice", "createdAt": "1970-01-01T00:00:00.000Z" }

// 4. 解码（JSON → 对象，自动校验）
const parsed = Schema.decodeSync(UserSchema)(json)
// → { id: "u_001", name: "Alice", createdAt: DateTime.Utc(...) }

// 5. 从未知 JSON 解码（来自 HTTP 请求）
const fromRequest = Schema.decodeUnknownSync(UserSchema)({
  id: "u_001",
  name: "Alice",
  createdAt: "1970-01-01T00:00:00.000Z",
})
```

---

## 3.7 OpenCode 中的 Schema 工具函数

### 3.7.1 withStatics：附加静态方法

```typescript
// packages/core/src/schema.ts:64-67
// 给 Schema 附加工厂方法
export const withStatics =
  <S extends object, M extends Record<string, unknown>>(
    methods: (schema: S) => M
  ) =>
  (schema: S): S & M =>
    Object.assign(schema, methods(schema))

// 使用示例
const ID = Schema.String.pipe(
  Schema.brand("Event.ID"),
  withStatics((schema) => ({
    create: () => schema.make("evt_" + Identifier.ascending()),
    from: (id: string) => schema.make(id),
  })),
)

// 现在 ID 不仅是 Schema，还有静态方法
ID.create()           // → "evt_01JQXR..."
ID.from("evt_abc")    // → "evt_abc"
```

### 3.7.2 Newtype：轻量包装类型

```typescript
// packages/core/src/schema.ts:88-106
// 用于创建类似 Java 包装类的类型
class QuestionID extends Newtype<QuestionID>()("QuestionID", Schema.String) {
  static make(id: string): QuestionID {
    return this.make(id)
  }
}

// 运行时就是 string，编译期是 QuestionID
const qid = QuestionID.make("q_001")
// typeof qid = QuestionID（不是 string）
```

---

## 3.8 本章小结

| Java 概念 | Effect Schema 对应 | 优势 |
|-----------|-------------------|------|
| `@Column`, `@JsonProperty` | `Schema.Struct({ field: Type })` | 一次定义，所有功能 |
| `@NotNull`, `@Email` | `Schema.pattern()` / `Schema.between()` | 编译期类型安全检查 |
| 包装类（如 `AccountID`） | `Schema.brand("AccountID")` | 零运行时开销 |
| `class + getters/setters` | `Schema.Class` | 没有样板代码 |
| `Exception` 类 | `Schema.TaggedErrorClass` | 可序列化、可模式匹配 |
| 静态工厂方法 | `withStatics()` | 类型安全的工厂函数 |

**下一章预告**：EventV2——基于 PubSub 的事件总线。我们将看到 Effect Stream 如何让事件驱动的架构变得类型安全且易于组合。