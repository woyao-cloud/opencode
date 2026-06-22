# @opencode/Image — 图像处理服务
> 源文件: `opencode/packages/opencode/src/image/image.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/image/image.ts`

## 概述

`@opencode/Image` 负责对用户上传的 base64 图片进行规范化处理：验证数据 URL 格式、解码图片、按配置限制进行尺寸和质量压缩。它使用 Photon WASM 图像处理库进行实际的图片操作，基于 Effect 框架实现。

该服务被 Session 消息处理流程调用，在图片附件进入 AI 对话前自动调整其大小和质量，确保不超过模型和配置的限制。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 读取 `attachment.image` 配置（max_width、max_height、max_base64_bytes、auto_resize） |

```typescript
// image.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service
  // ...
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly normalize: (input: MessageV2.FilePart) => Effect.Effect<MessageV2.FilePart, Error>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Image") {}
```

使用示例：

```typescript
const filePart: MessageV2.FilePart = {
  type: "file",
  mime: "image/png",
  url: "data:image/png;base64,iVBORw0KGgo..."
}
const normalized = yield* Image.Service.normalize(filePart)
```

## 数据结构

| 类型 | 说明 |
|------|------|
| `Interface` | 服务接口，只有一个 `normalize` 方法 |
| `Error` | 联合错误类型：`ResizerUnavailableError \| InvalidDataUrlError \| DecodeError \| SizeError` |
| `MessageV2.FilePart` | 输入/输出类型（来自 `@/session/message-v2`） |

### 错误类型

| 错误 | 触发条件 |
|------|----------|
| `ResizerUnavailableError` | Photon WASM 库加载失败 |
| `InvalidDataUrlError` | URL 不是 `data:` 协议的 base64 格式 |
| `DecodeError` | Photon 无法解析图片字节 |
| `SizeError` | 图片尺寸/字节数超限且自动缩放失败 |

### 配置常量

```typescript
const MAX_BASE64_BYTES = 5 * 1024 * 1024   // 默认 5MB
const MAX_WIDTH = 2000                       // 默认 2000px
const MAX_HEIGHT = 2000                      // 默认 2000px
const AUTO_RESIZE = true                     // 默认启用自动缩放
const JPEG_QUALITIES = [80, 85, 70, 55, 40]  // JPEG 质量降级序列
```

## 关键实现细节

### normalize 处理流程

```
normalize(input)
  ├── 1. 读取 Config.attachment.image 配置（应用默认值）
  ├── 2. 验证 data URL 格式（data:*;base64,...）
  ├── 3. 计算 base64 字节数
  ├── 4. 加载 Photon WASM（惰性加载，全局缓存）
  ├── 5. 解码图片 → PhotonImage
  ├── 6. 检查是否超出限制（宽/高/字节）
  │     ├── 未超出 → 原样返回
  │     └── 已超出 + autoResize=false → SizeError
  └── 7. 缩放尝试（最多 32 级渐进缩小）
        ├── 按比例缩放（maxWidth/maxHeight 约束）
        ├── 每级生成 PNG + 5 种 JPEG 质量候选
        └── 选择第一个 ≤ maxBase64Bytes 的候选
```

### Photon WASM 加载

Photon WASM 模块通过惰性加载和全局缓存机制初始化：

```typescript
const loadPhoton = yield* Effect.cached(
  Effect.sync(() => {
    // 设置 WASM 路径，支持 Bun 编译后的二进制文件
    globalThis.__OPENCODE_PHOTON_WASM_PATH = path.isAbsolute(photonWasm)
      ? photonWasm
      : fileURLToPath(new URL(photonWasm, import.meta.url))
  }).pipe(
    Effect.andThen(() => Effect.tryPromise(() => import("@silvia-odwyer/photon-node"))),
    Effect.mapError(() => new ResizerUnavailableError()),
  ),
)
```

`Effect.cached` 确保 WASM 只加载一次，后续调用复用已加载的实例。

### 渐进式缩放策略

缩放采用 32 级迭代缩小策略：从原始尺寸按比例缩小开始，每级再缩小为上一级的 75%，对每个尺寸依次尝试 PNG 和多种 JPEG 质量编码，一旦找到 ≤ 字节限制的候选就立即返回。这确保了输出质量尽可能高。

### 内存管理

`PhotonImage` 对象在 finally 块中调用 `.free()` 释放 WASM 内存，防止内存泄漏。

## 关键设计决策

1. **惰性加载 WASM**：Photon WASM 文件较大，使用 `Effect.cached` 仅在首次 `normalize` 调用时加载，避免启动时开销

2. **渐进式质量降级**：不是一次性压缩到最低质量，而是逐级尝试，优先返回高质量结果。先尝试 PNG（无损），再依次尝试 JPEG 80/85/70/55/40 质量

3. **尺寸 + 质量双重压缩**：先按比例缩小分辨率，再对缩小后的图片尝试不同编码质量，两个维度同时优化以在字节限制内达到最佳视觉效果

4. **全局 WASM 路径注入**：通过 `globalThis.__OPENCODE_PHOTON_WASM_PATH` 注入路径，兼容 Bun 编译后的二进制文件（此时 WASM 文件作为编译资源嵌入）

5. **最小依赖**：仅依赖 `Config` 一个 Service，保持模块独立性和可测试性
