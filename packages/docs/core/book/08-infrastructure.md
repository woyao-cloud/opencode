# 基础设施模块：路径、文件、标志

> **目标读者**：熟悉 `System.getProperty("user.dir")`、`java.nio.file`、Spring `@Value` 的开发者。
> **本章目标**：理解 OpenCode 如何管理文件路径、封装文件操作、使用环境变量控制行为。

---

## 8.1 Global：路径管理

### 8.1.1 Java 中的路径问题

```java
// Java：不同项目有不同的路径管理方式
// 项目 A：用 user.dir
String dataDir = System.getProperty("user.dir") + "/data";

// 项目 B：用环境变量
String dataDir = System.getenv("MY_APP_DATA");

// 项目 C：硬编码
String dataDir = "/var/lib/myapp";
```

问题是：**没有一个标准的方式决定"文件应该放在哪里"**。迁移到新环境时经常出现路径问题。

### 8.1.2 XDG Base Directory 规范

OpenCode 遵循 [XDG Base Directory 规范](https://specifications.freedesktop.org/basedir-spec/latest/)：

```typescript
// packages/core/src/global.ts:10-15
const app = "opencode"
const data = path.join(xdgData!, app)     // ~/.local/share/opencode
const cache = path.join(xdgCache!, app)   // ~/.cache/opencode
const config = path.join(xdgConfig!, app) // ~/.config/opencode
const state = path.join(xdgState!, app)   // ~/.local/state/opencode
```

**各路径的实际用途**：

```typescript
export const Path = {
  home:  process.env.HOME,                    // 用户主目录
  data:  "~/.local/share/opencode",           // 数据库、日志、Git 仓库
  bin:   "~/.cache/opencode/bin",              // 下载的二进制文件
  log:   "~/.local/share/opencode/log",        // 日志文件
  repos: "~/.local/share/opencode/repos",      // Git 仓库缓存
  cache: "~/.cache/opencode",                  // 缓存数据
  config: "~/.config/opencode",                // opencode.json
  state: "~/.local/state/opencode",            // 运行时状态
  tmp: "/tmp/opencode",                       // 临时文件
}
```

**Windows 上的对应路径**：

| 属性 | Linux | Windows |
|------|-------|---------|
| data | `~/.local/share/opencode` | `C:\Users\xxx\AppData\Local\opencode` |
| config | `~/.config/opencode` | `C:\Users\xxx\AppData\Roaming\opencode` |
| cache | `~/.cache/opencode` | `C:\Users\xxx\AppData\Local\opencode\cache` |

### 8.1.3 自动创建目录

```typescript
// 模块加载时自动创建所有目录
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

**对比 Spring Boot**：

```java
// Spring Boot 通常在启动脚本中创建目录
// 或者在 @PostConstruct 方法中
@Component
public class DirectoryInitializer {
    @PostConstruct
    public void init() {
        new File("/var/lib/myapp/data").mkdirs();
    }
}

// OpenCode: 直接在顶层代码中并行创建
```

### 8.1.4 Effect Service 封装

```typescript
// 通过 Effect Service 提供全局路径
export class Service extends Context.Service<Service, Interface>()("@opencode/Global") {}

export interface Interface {
  readonly home: string
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
  readonly bin: string
  readonly log: string
  readonly repos: string
}

// 使用
const global = yield* Global.Service
const dbPath = path.join(global.data, "opencode.db")
```

---

## 8.2 AppFileSystem：文件系统抽象

### 8.2.1 为什么封装

Effect 自带的 `FileSystem.FileSystem` 提供了基础的文件操作，但缺少一些高频使用的操作：

```typescript
// 不封装的话，代码会变成这样：
const content = yield* fs.readFileString(path).pipe(
  Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined))
)
const json = yield* Effect.try(() => JSON.parse(content ?? "{}"))

// 封装后：
const json = yield* fsys.readJson(path).pipe(
  Effect.catchAll(() => Effect.succeed({}))
)
```

### 8.2.2 方法速查

```typescript
interface AppFileSystem {
  // 基础检查
  isDir(path): Effect<boolean>           // 是目录？不存在返回 false
  isFile(path): Effect<boolean>          // 是文件？不存在返回 false
  existsSafe(path): Effect<boolean>      // 存在？捕获所有错误不抛异常

  // 安全读取
  readFileStringSafe(path): Effect<string | undefined>  // 不存在返回 undefined

  // JSON 操作
  readJson(path): Effect<unknown>                      // 读取 JSON
  writeJson(path, data, mode?): Effect<void>           // 写入 JSON

  // 目录
  ensureDir(path): Effect<void>                        // mkdir -p
  writeWithDirs(path, content): Effect<void>           // 写入 + 自动创建父目录

  // 查找
  findUp(target, start, stop?): Effect<string[]>       // 向上搜索
  glob(pattern, options?): Effect<string[]>            // 模式匹配
}
```

### 8.2.3 在 OpenCode 中的实际使用

```typescript
// 模式 1：安全读取配置文件
// 从用户配置目录读取 opencode.json，如果不存在则用默认值
const config: unknown = yield* AppFileSystem.Service.use(
  (fs) => fs.readJson(path.join(global.config, "opencode.json"))
).pipe(
  Effect.catchAll(() => Effect.succeed({}))
)

// 模式 2：向上查找 opencode.json
// 从当前工作目录开始，向上找到最近的 opencode.json
const opencodeJson = yield* AppFileSystem.Service.use(
  (fs) => fs.findUp("opencode.json", process.cwd())
)
// → ["/home/user/project/opencode.json"]

// 模式 3：安全写入 JSON
yield* AppFileSystem.Service.use(
  (fs) => fs.writeJson(
    path.join(global.state, "auth-v2.json"),
    authData,
    0o600  // 只有 owner 可读写
  )
)
```

---

## 8.3 Flag：环境变量标志系统

### 8.3.1 为什么用环境变量

有些配置需要在**进程启动前**就确定，不能等到读取配置文件：

```
进程启动 → 读环境变量（Flag） → 读配置文件 → 启动服务
```

例如：测试时需要覆盖数据目录，如果用配置文件，启动后才知道配置文件路径——鸡生蛋问题。

### 8.3.2 工作原理

```typescript
// packages/core/src/flag/flag.ts
export const Flag = {
  OPENCODE_CONFIG_DIR,          // 覆盖配置目录路径
  OPENCODE_PLUGIN_META_FILE,    // 覆盖插件元数据文件路径
  OPENCODE_PURE,                // "1" 禁用外部插件
  OPENCODE_AUTH_CONTENT,        // 注入认证数据（CI/CD 用）
  // ... 20+ 标志
}
```

### 8.3.3 使用示例

```bash
# 禁用所有外部插件（排查插件问题）
OPENCODE_PURE=1 opencode run

# 覆盖认证数据（CI 环境无需持久化文件）
OPENCODE_AUTH_CONTENT='{"version":2,"accounts":{...}}' opencode run

# 自定义配置目录（测试环境）
OPENCODE_CONFIG_DIR=/tmp/test-config opencode run
```

### 8.3.4 vs Spring @Value

```java
// Java Spring
@Component
public class AppConfig {
    @Value("${app.pure:false}")
    private boolean pure;         // 从 application.properties 读取
}

// 比较：
// Spring: 配置文件驱动，启动后生效
// Flag:   环境变量驱动，启动前生效
```

---

## 8.4 Location：事件位置上下文

### 8.4.1 解决什么问题

在多工作区场景下，每个事件需要知道自己的来源位置：

```
用户同时打开两个项目：
  /home/user/project-a/
  /home/user/project-b/

project-a 中创建的会话事件，应该标记为来自 project-a
```

### 8.4.2 实现

```typescript
// packages/core/src/location.ts
export const Ref = Schema.Struct({
  directory: Schema.String,                  // 事件产生的目录
  workspaceID: Schema.optional(Schema.String), // 工作区 ID
})

// 在 Event 发布时自动注入
function publish(definition, data, options?) {
  const location = yield* Effect.serviceOption(Location.Service)
  return publishEvent({
    ...data,
    location: location ?? undefined,
  })
}
```

---

## 8.5 Docker Compose 示例

以下是一个简单的部署配置，展示 OpenCode Server + Web UI 的组成：

```yaml
# docker-compose.yml
version: "3.8"

services:
  opencode-server:
    image: opencode/opencode:latest
    ports:
      - "8080:8080"
    environment:
      - OPENCODE_CONFIG_DIR=/etc/opencode
      - OPENCODE_AUTH_CONTENT=${OPENCODE_AUTH_CONTENT}
    volumes:
      - opencode-data:/home/opencode/.local/share/opencode
      - ./opencode.json:/etc/opencode/opencode.json:ro
      - ./projects:/projects:ro
    command: ["opencode", "serve"]

  opencode-web:
    image: opencode/opencode-web:latest
    ports:
      - "3000:3000"
    environment:
      - OPENCODE_SERVER_URL=http://opencode-server:8080
    depends_on:
      - opencode-server

volumes:
  opencode-data:
```

**对应到 Java 部署**：

| Java 应用 | OpenCode 对应 | 区别 |
|-----------|-------------|------|
| Spring Boot JAR | `opencode serve` | 单二进制（Bun 打包） |
| `application.yml` | `opencode.json` | JSON 格式 |
| `@Value("${...}")` | `Flag.*` + 环境变量 | 环境变量优先级更高 |
| `java -jar app.jar` | `bun run src/index.ts` | 无需编译步骤 |

---

## 8.6 Flag 系统完整参考

| 环境变量 | 类型 | 什么时候用 | 效果 |
|----------|------|-----------|------|
| `OPENCODE_PURE` | `"1"` | 排查插件问题 | 不加载任何外部插件 |
| `OPENCODE_CONFIG_DIR` | 路径 | 测试/CI | 覆盖配置路径 |
| `OPENCODE_AUTH_CONTENT` | JSON | CI/CD | 注入认证数据 |
| `OPENCODE_PLUGIN_META_FILE` | 路径 | 测试 | 覆盖插件元数据文件 |
| `OPENCODE_LOG_LEVEL` | `"DEBUG"` / `"INFO"` | 调试 | 控制日志级别 |

---

## 8.7 ⚠️ 常见错误

**错误 1：用 fs 直接操作路径而不是通过 AppFileSystem**

```typescript
// ❌ 错误：直接用 fs（没有错误包装、没有 JSON 自动解析）
const content = await fs.readFile(path, "utf-8")
const data = JSON.parse(content)

// ✅ 正确：用 AppFileSystem（自动错误处理、自动 JSON 解析）
const data = yield* AppFileSystem.Service.use(
  (fs) => fs.readJson(path)
).pipe(
  Effect.catchAll(() => Effect.succeed({}))  // 不存在就用默认值
)
```

**错误 2：在测试中忘记覆盖 Global 路径导致误删数据**

```typescript
// ❌ 错误：测试中使用了真实的 Global 路径
const config = yield* Global.Service
const path = path.join(config.data, "test.json")
// → 操作真实数据目录！测试结束后文件还在

// ✅ 正确：用 layerWith 覆盖测试路径
const testLayer = Global.layerWith({
  data: "/tmp/test-opencode/data",
  config: "/tmp/test-opencode/config",
})
// → 所有操作都在 /tmp 下，测试结束自动清理
```

---

## 8.8 试试看

**练习**：用 AppFileSystem 实现一个"配置文件管理器"。

需求：
1. 从 `~/.config/myapp/config.json` 读取配置（不存在则用默认值）
2. 更新配置后写回
3. 确保写入权限为 600（仅 owner 可读）

**期望代码结构**：

```typescript
// 提示：用 AppFileSystem.Service 的 readJson / writeJson 方法
// readJson 不存在时会返回错误——用 catchAll 兜底
```

---

## 8.9 本章小结

| Java 概念 | OpenCode 对应 | 优势 |
|-----------|-------------|------|
| `System.getProperty("user.dir")` | `Global.Path.*` | XDG 规范，跨平台统一 |
| `java.nio.file.Files` | `AppFileSystem.Service` | JSON 操作内置、向上查找 |
| `@Value("${...}")` | `Flag.*` | 启动前即可生效 |
| `application.properties` | `opencode.json` | JSON 格式，Effect Schema 校验 |
| Spring `@PostConstruct` | 模块顶层 `await` | 加载时自动执行 |

**下一章预告**：Effect 运行时——makeRuntime、MemoMap、Layer 组合。这是理解整个应用如何启动和执行的关键。