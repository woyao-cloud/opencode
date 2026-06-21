# @opencode/v2/Catalog — 目录索引服务
> 婧愭枃浠? `opencode/packages/core/src/catalog.ts`

## 概述

Catalog 服务负责运行代码库目录索引。它调用 `@open-code-ai-v2/catalog` 包的 `runCatalog` 函数，对项目的 `.opencode` 目录进行扫描和索引构建，为代码理解和上下文检索提供结构化数据。

### 依赖的 Services

| Service | 用途 |
|---|---|
| `Config` | 读取项目配置（传递给底层 `runCatalog`） |
| `Instance` | 获取运行时实例 |
| `Log` | 日志记录（传递给底层 `runCatalog`） |
| `PathMaker` | 获取 `.opencode` 目录的绝对路径 |

## 核心接口

```ts
// --- 接口定义 ---
export class Catalog extends Service<Catalog>() {
  readonly [CatalogProvide] = CatalogProvide
  run(): Effect<never, never, void>
}
```

`Catalog` 通过 `layer` 函数注册到 `Service`：

```ts
// 构建层
const catalogLayer = Catalog.layer() // = Catalog.provide()

// 服务访问
const catalog = yield* Catalog
yield* catalog.run()
```

## 数据结构

本服务无自定义数据结构。`run()` 方法不接收参数，所有上下文通过依赖注入获取。

## 关键实现细节

- **目录固定为 `.opencode`**: 索引目标路径硬编码为 `path.project.dir(".opencode")`，即项目工作目录下的 `.opencode` 子目录
- **纯委托模式**: `Catalog` 本身不做任何索引逻辑，只负责组装依赖（Config、Log、PathMaker）并传递给底层的 `runCatalog`
- **layer 最简实现**: `static layer()` 仅调用 `this.provide()`，无额外 Tag 注册

## 关键设计决策

1. 索引目标固定为 `.opencode` 目录，不接受外部路径参数，保持调用简单
2. 不暴露索引结果——`run()` 返回 `void`，索引导出的数据由底层 `@open-code-ai-v2/catalog` 包自行管理
3. 通过 Config 和 Log 的透传，允许底层 `runCatalog` 读取项目配置和输出日志
4. 不监听文件变更（与 Config 的文件监听不同），Catalog 的运行由上层调度触发
