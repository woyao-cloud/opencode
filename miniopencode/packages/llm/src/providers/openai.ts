import { Provider } from "../provider"
import { ProviderID, ModelID } from "../schema/ids"

export const OpenAIProvider = Provider.make({
  id: ProviderID.make("openai"),
  model: (id, options) => ({
    providerID: ProviderID.make("openai"),
    modelID: typeof id === "string" ? ModelID.make(id) : id,
    apiKey: options?.apiKey,
    baseURL: options?.baseURL ?? "https://api.openai.com/v1",
  }),
})

export const OpenAI = OpenAIProvider
