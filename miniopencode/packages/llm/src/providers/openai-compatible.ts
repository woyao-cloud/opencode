import { Provider } from "../provider"
import { ProviderID, ModelID } from "../schema/ids"

export const OpenAICompatibleProvider = Provider.make({
  id: ProviderID.make("openai-compatible"),
  model: (id, options) => ({
    providerID: ProviderID.make("openai-compatible"),
    modelID: typeof id === "string" ? ModelID.make(id) : id,
    apiKey: options?.apiKey,
    baseURL: options?.baseURL,
  }),
})

export const OpenAICompatible = OpenAICompatibleProvider
