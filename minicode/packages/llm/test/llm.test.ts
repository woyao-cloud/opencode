import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import * as LLM from "@minicode/llm"
import { OpenAI } from "@minicode/llm/providers"
import { OpenAICompatible } from "@minicode/llm/providers"

describe("llm/provider", () => {
  it("OpenAI.model creates a ModelRef", () => {
    const m = OpenAI.model("gpt-4o-mini")
    expect(m.providerID as string).toBe("openai")
    expect(m.modelID as string).toBe("gpt-4o-mini")
  })

  it("OpenAICompatible.model requires baseURL", () => {
    const m = OpenAICompatible.model("llama3", { baseURL: "http://localhost:11434/v1" })
    expect(m.providerID as string).toBe("openai-compatible")
    expect(m.baseURL).toBe("http://localhost:11434/v1")
  })
})

describe("llm/tool", () => {
  it("make creates a tool with definition", () => {
    const t = LLM.Tool.make({
      description: "get weather",
      parameters: Schema.Struct({ city: Schema.String }),
      success: Schema.Struct({ temperature: Schema.Number }),
    })
    expect(t.description).toBe("get weather")
    expect(t._definition.description).toBe("get weather")
  })

  it("toDefinitions converts tools record", () => {
    const tools = {
      weather: LLM.Tool.make({
        description: "get weather",
        parameters: Schema.Struct({ city: Schema.String }),
        success: Schema.Struct({ temperature: Schema.Number }),
      }),
    }
    const defs = LLM.Tool.toDefinitions(tools)
    expect(defs.length).toBe(1)
    expect(defs[0]?.name).toBe("weather")
  })
})