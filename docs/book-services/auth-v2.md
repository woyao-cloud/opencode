# @opencode/v2/Auth — 认证服务

## 概述

Auth 服务封装 OAuth/API Key 认证回调流程。它依赖 `@open-code-ai-v2/auth` 包的 `AuthProvider`，提供 `callback()` 方法处理第三方认证服务的回调请求（如 OAuth redirect URI 的回调处理）。

### 依赖的 Services

| Service | 用途 |
|---|---|
| `Log` | 记录认证回调的开始和完成日志 |
| `AuthProvider` | 底层认证提供者（来自 `@open-code-ai-v2/auth`），执行实际的回调逻辑 |

## 核心接口

```ts
// --- 接口定义 ---
export class Auth extends Service<Auth>() {
  readonly [AuthProvide] = AuthProvide
  callback(): Effect<never, never, void>
}
```

`Auth` 通过 `layer` 函数注册到 `Service`：

```ts
// 构建层
const authLayer = Auth.layer() // = Auth.provide()

// 服务访问
const auth = yield* Auth
yield* auth.callback()
```

## 数据结构

本服务无自定义数据结构。`callback()` 不接收参数——认证所需的参数（如 OAuth code、state）由底层 `AuthProvider` 从请求上下文中提取。

## 关键实现细节

- **纯委托模式**: `callback()` 仅做日志记录 + 委托给 `AuthProvider.callback()`，自身不含任何认证逻辑
- **日志埋点**: 在回调开始和完成时分别记录日志，便于追踪认证流程
- **layer 最简实现**: `static layer()` 仅调用 `this.provide()`

## 关键设计决策

1. 认证逻辑完全下沉到 `@open-code-ai-v2/auth` 包，Auth 服务只做薄封装
2. `callback()` 不接收参数——所有认证参数由底层 Provider 自行从 HTTP 上下文获取
3. 不暴露 `login`、`logout` 等方法——当前版本仅封装回调流程
4. 日志记录使用 `effect.log`，输出到 Effect 日志系统而非 console
