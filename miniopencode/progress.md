
# 增加provider 路由
方案 C 完成。以下是实现总结：
新增文件
- src/provider/schema.ts — ResolvedModel 接口（modelID, providerID, apiKey, baseURL）和 ProviderConfig/ProviderEntry 配置类型
- src/provider/index.ts — ProviderService，核心方法：
  - resolve(modelID?, providerID?) — 根据配置解析模型
  - defaultModel() — 获取配置的默认模型
修改文件
- config/config.ts — ProviderConfig schema 增加了 default 字段；defaultConfig 默认从 OpenAI 改为 ollama cloud（qwen2.5:latest + https://ollama.com/v1）
- project/bootstrap.ts — 预计算 ProviderService 并加入 Layer.mergeAll
- cli/cmd/run.ts — 去掉硬编码的 resolveModel()，改为通过 ProviderService.resolve() 读取配置
优先级链（由高到低）
| 优先级 | 来源 | 示例 |
|---|---|---|
| 1 | CLI --base-url / --api-key | miniopencode run -p "hello" --base-url https://xxx.com/v1 |
| 2 | CLI --model | miniopencode run -p "hello" --model glm-5.1:cloud |
| 3 | MINICODE_MODEL env var | set MINICODE_MODEL=glm-5.1:cloud |
| 4 | miniopencode.json provider 配置 | 见下方 |
| 5 | 默认 ollama cloud | qwen2.5:latest + https://ollama.com/v1 |
配置 ollama cloud 到 miniopencode.json
项目根目录创建 miniopencode.json：
{
  provider: {
    default: ollama,
    providers: {
      ollama: {
        baseURL: https://ollama.com/v1,
        apiKey: your-api-key
      },
      openai: {
        baseURL: https://api.openai.com/v1,
        apiKey: sk-...
      }
    }
  }
}
之后直接 miniopencode run -p "你的问题" 
即可，不再需要传 --base-url


# workwell on 火山plan

bun run packages/opencode/src/index.ts run -p "hello"
2026-06-23T14:31:34.481Z [INFO] [bootstrap] miniopencode initialized {"home":"C:\\Users\\laido\\AppData\\Roaming\\miniopencode"}
2026-06-23T14:31:34.483Z [INFO] [provider] resolve {"provider":"volces","model":"glm-5.1:cloud","baseURL":"https://ark.cn-beijing.volces.com/api/coding/v3"}
2026-06-23T14:31:34.484Z [INFO] [cli.run] calling LLM {"model":"glm-5.1:cloud","prompt":"hello"}
2026-06-23T14:31:34.485Z [INFO] [llm] generate {"model":"glm-5.1:cloud","messages":1}
AI SDK Warning System: To turn off warning logging, set the AI_SDK_LOG_WARNINGS global to false.
AI SDK Warning (miniopencode.chat / glm-5.1:cloud): The feature "specificationVersion" is used in a compatibility mode. Using v2 specification compatibility mode. Some features may not be available.
'pwd' is not recognized as an internal or external command,
operable program or batch file.
2026-06-23T14:31:36.453Z [INFO] [llm] generate done {"length":39}
Hello! Let me explore what we have here


## refactory

重构路线图（5 阶段）
Phase A — 底层架构对齐（核心依赖）
> 不改功能，只改架构模式。每步确保 typecheck + run -p "hello" 仍然通过。
| # | 任务 | 参考父目录 | 关键改动 |
|---|---|---|---|
| A1 | EventBus 重写 — Map → Effect PubSub + Stream | bus/index.ts (74 行) | 替换同步 Map，用 PubSub.unbounded + Stream.fromPubSub |
| A2 | Tool 系统重写 — 引入 Effect Schema 参数 + ExecuteResult | tool/tool.ts (165 行) | Def<P> 泛型、Schema.decodeUnknownEffect 校验、Context 传 sessionID/abort |
| A3 | Effect 运行时完善 — 加 InstanceState, bridge, run-service | effect/*.ts | 增加 makeRuntime、InstanceState.make、EffectBridge |
| A4 | Layer 逐步迁移 — 部分 Layer.succeed → Layer.effect + Layer.provide | project/bootstrap.ts | 从无依赖的 Service 开始迁移（Bus→Tool→Session→Provider） |
Phase B — Session 系统重构
> 与父目录 session 结构对齐，增加 parts、message-v2、完整状态机。
| # | 任务 | 参考父目录 |
|---|---|---|
| B1 | Session Schema 重构 — 引入 SessionID/MessageID/PartID brand types | session/schema.ts |
| B2 | MessageV2 系统 — 实现 ContentPart/FilePart/ToolCallPart/ToolResultPart | session/message-v2.ts |
| B3 | session.ts 扩展 — 增加 parentID, fork, session status 状态机 | session/session.ts |
| B4 | DB 层 — 切换到 drizzle-orm（修 in-memory bug 后） | storage/*.ts + session/session.sql.ts |
Phase C — Prompt 引擎（核心）
> 这是 opencode 最复杂的部分（父目录 2157 行）。
| # | 任务 | 参考父目录 |
|---|---|---|
| C1 | Prompt 基础 — PromptInput/PromptOutput/解析 parts | session/prompt.ts |
| C2 | System Prompt 构建 — agent + instruction + tools | session/system.ts |
| C3 | 工具循环 — LLM.generate → tool execute → 继续 → maxSteps | session/prompt.ts |
| C4 | 错误处理 — 重试/回退/取消 | session/prompt.ts |
Phase D — 模块补齐
> 按 PLAN.md 优先级补充缺失模块。
| # | 任务 | 参考父目录 |
|---|---|---|
| D1 | SubAgent (task tool) + BackgroundJob | tool/task.ts, background/job.ts |
| D2 | 多 Provider + 路由 + 协议层 | provider/*.ts, protocols/*, route/* |
| D3 | 文件系统 + Git 集成 | file/*, git/* |
| D4 | LSP + Shell/PTY + Format | lsp/*, shell/*, format/* |
Phase E — 外围功能
> MCP/ACP/存储迁移/安装/TUI/测试/文档