# 术语表

> 本书中 Effect-TS 关键术语的中英文对照与简要解释。全书统一使用此表中的翻译。

| 英文术语 | 中文翻译 | 简要解释 |
|----------|----------|----------|
| Effect | Effect（不翻译） | Effect-TS 的核心数据类型，描述一个可能成功、可能失败、需要某些依赖的计算 |
| Effect.gen | Generator do-notation | 使用 `function*` + `yield*` 编写 Effect 的语法糖 |
| yield* | yield*（不翻译） | 展平嵌套 Effect 的操作符，类似 `await` 但保留类型信息 |
| pipe | pipe（不翻译） | 函数式链式组合操作符，将前一个结果传给下一个函数 |
| Layer | 层 | Effect 的依赖注入单元，类似 Spring 的 `@Configuration` |
| Fiber | 纤程 | 用户态轻量级绿色线程，Effect 的并发原语 |
| Stream | 流 | Effect 的异步数据流，支持背压、中断、资源安全 |
| Scope | 作用域 | 资源生命周期管理器，确保资源无论成败都会被释放 |
| SynchronizedRef | 同步引用 | 原子可变状态容器，保证并发安全 |
| Deferred | 延迟承诺 | 一次性异步协调原语，类似 Promise 但可中断且类型安全 |
| PubSub | 发布订阅 | 多播事件总线原语 |
| Schedule | 调度策略 | 重试/重复的策略抽象（指数退避、固定间隔等） |
| Semaphore | 信号量 | 并发许可控制原语 |
| Queue | 队列 | 并发安全的消息队列 |
| Context | 上下文 | Effect 的依赖容器，通过 Tag 进行类型安全访问 |
| Tag | 标签 | 依赖的类型标识符，用于从 Context 中提取服务 |
| Schema | Schema（不翻译） | Effect 的运行时类型验证系统，类似 Zod 但深度集成 |
| Cause | 错误原因 | Effect 的错误详情类型，区分预期错误、缺陷、中断 |
| Exit | 退出状态 | Effect 执行结果：Success 或 Failure |
| Config | 配置 | Effect 的环境配置读取原语 |
| ManagedRuntime | 托管运行时 | 从 Layer 构建的 Effect 执行器 |
| Branded Type | 品牌类型 | 通过 `Schema.brand` 创建的名义类型（如 SessionID） |
| Tagged Error | 标签错误 | 通过 `Schema.TaggedErrorClass` 创建的可精确匹配的错误类型 |
| Defect | 缺陷 | 未预期的程序错误（空指针、逻辑 bug），区别于预期的业务错误 |
| Interrupt | 中断 | Fiber 的取消信号，区别于错误 |
| Doom Loop | 死循环 | Agent 连续重复相同工具调用的检测机制 |
| Compaction | 压缩 | 长对话的上下文压缩，用 LLM 摘要替换历史消息 |
| ACP | Agent 通信协议 | Agent Communication Protocol，Agent 间通信的标准协议 |
