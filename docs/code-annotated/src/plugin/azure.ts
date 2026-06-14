/**
 * plugin/azure - Azure OpenAI 认证插件：处理 Azure OpenAI 的资源认证
 *
 * 功能概述：
 * - 通过交互式提示获取 Azure 资源名称
 * - 返回认证 Hook 集成到插件系统
 *
 * 核心导出：
 * - AzureAuthPlugin：Azure 认证插件工厂函数
 *
 * 架构位置：Plugin 模块认证插件层，被 plugin/index.ts 加载。
 */
import type { Hooks, PluginInput } from "@opencode-ai/plugin"

export async function AzureAuthPlugin(_input: PluginInput): Promise<Hooks> {
  const prompts = []
  if (!process.env.AZURE_RESOURCE_NAME) {
    prompts.push({
      type: "text" as const,
      key: "resourceName",
      message: "Enter Azure Resource Name",
      placeholder: "e.g. my-models",
    })
  }

  return {
    auth: {
      provider: "azure",
      methods: [
        {
          type: "api",
          label: "API key",
          prompts,
        },
      ],
    },
  }
}
