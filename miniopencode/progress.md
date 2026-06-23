
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