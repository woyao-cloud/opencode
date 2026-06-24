# ch06-scope — Scope 资源生命周期管理

Scope 是 Effect-TS 中管理资源生命周期的核心机制。通过 Scope，你可以确保：

- **acquireRelease** — 资源获取和释放成对管理，类似 try-finally
- **Scope.fork** — 创建子作用域，实现资源隔离
- **addFinalizer** — 注册清理钩子，在 Scope 关闭时执行
- **文件句柄管理** — 实际场景：使用 Scope 确保文件正确关闭

## 安装

```bash
cd docs/Effect-ts/demos/ch06-scope
bun install
```

## 运行

```bash
# 场景 1: acquireRelease 模式
bun run demo:acquire

# 场景 2: Scope.fork 子作用域
bun run demo:fork

# 场景 3: addFinalizer 清理钩子
bun run demo:finalizer

# 场景 4: 文件句柄管理实战
bun run demo:file
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/01-acquire-release.ts` | acquireRelease 的基本用法：正常/异常/并行场景 |
| `src/02-scope-fork.ts` | Scope.fork 创建子 Scope：隔离/错误隔离/嵌套 |
| `src/03-finalizer.ts` | addFinalizer 注册清理钩子：LIFO 顺序/临时文件/错误场景 |
| `src/04-file-handle-demo.ts` | 文件句柄管理实战：基本操作/错误处理/并行/子 Scope 隔离 |
