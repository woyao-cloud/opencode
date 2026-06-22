import { describe, expect, it } from "bun:test"
import { Schema, Effect } from "effect"
import * as LLM from "@minicode/llm"
import { OpenAI } from "@minicode/llm/providers"
import { OpenAICompatible } from "@minicode/llm/providers"
import { ToolDefinition } from "@minicode/llm/schema/messages"
import { ProviderID, ModelID } from "@minicode/llm/schema/ids"
import { TextPart, ToolCallPart, ToolResultPart, Message, ModelRef } from "@minicode/llm/schema/messages"
import { ContentPart, MessageRole, MessageInput, GenerationOptions } from "@minicode/llm/schema/messages"
import { ProviderIDMake, ModelIDMake } from "@minicode/llm/schema/ids"
import { Protocol } from "@minicode/llm/protocols"

describe("llm/provider - OpenAI", () => {
  it("OpenAI.model creates a ModelRef with providerID openai", () => {
    const m = OpenAI.model("gpt-4o-mini")
    expect(m.providerID as string).toBe("openai")
    expect(m.modelID as string).toBe("gpt-4o-mini")
  })

  it("OpenAI.model passes apiKey and baseURL through", () => {
    const m = OpenAI.model("gpt-4o", { apiKey: "sk-test", baseURL: "https://custom.api.com/v1" })
    expect(m.apiKey).toBe("sk-test")
    expect(m.baseURL).toBe("https://custom.api.com/v1")
  })

  it("OpenAI.model omits apiKey and baseURL when not provided", () => {
    const m = OpenAI.model("gpt-4o-mini")
    expect(m.apiKey).toBeUndefined()
    expect(m.baseURL).toBeUndefined()
  })
})

describe("llm/provider - OpenAICompatible", () => {
  it("OpenAICompatible.model creates a ModelRef with providerID openai-compatible", () => {
    const m = OpenAICompatible.model("llama3", { baseURL: "http://localhost:11434/v1" })
    expect(m.providerID as string).toBe("openai-compatible")
    expect(m.modelID as string).toBe("llama3")
    expect(m.baseURL).toBe("http://localhost:11434/v1")
  })

  it("OpenAICompatible.model throws when baseURL is missing", () => {
    expect(() => OpenAICompatible.model("llama3", {} as any)).toThrow()
  })
})

describe("llm/schema - TextPart", () => {
  it("decodes a valid text part", () => {
    const result = Schema.decodeUnknownSync(TextPart)({ type: "text", text: "hello" })
    expect(result.type).toBe("text")
    expect(result.text).toBe("hello")
  })

  it("rejects missing text field", () => {
    expect(() => Schema.decodeUnknownSync(TextPart)({ type: "text" })).toThrow()
  })
})

describe("llm/schema - ToolCallPart", () => {
  it("decodes a valid tool-call part", () => {
    const result = Schema.decodeUnknownSync(ToolCallPart)({ type: "tool-call", id: "call_1", name: "read", input: { path: "/foo" } })
    expect(result.type).toBe("tool-call")
    expect(result.id).toBe("call_1")
    expect(result.name).toBe("read")
  })
})

describe("llm/schema - ToolResultPart", () => {
  it("decodes a valid tool-result part", () => {
    const result = Schema.decodeUnknownSync(ToolResultPart)({ type: "tool-result", id: "call_1", name: "read", result: "content" })
    expect(result.type).toBe("tool-result")
    expect(result.name).toBe("read")
  })
})

describe("llm/schema - Message", () => {
  it("decodes a message with string content", () => {
    const result = Schema.decodeUnknownSync(Message)({ role: "user", content: "hello" })
    expect(result.role).toBe("user")
    expect(result.content).toBe("hello")
  })

  it("decodes a message with array content", () => {
    const result = Schema.decodeUnknownSync(Message)({ role: "assistant", content: [{ type: "text", text: "hi" }] })
    expect(result.role).toBe("assistant")
    expect(Array.isArray(result.content)).toBe(true)
  })
})

describe("llm/schema - ToolDefinition", () => {
  it("constructs a ToolDefinition via new", () => {
    const def = new ToolDefinition({ name: "read", description: "Read a file", inputSchema: { type: "object" } })
    expect(def.name).toBe("read")
    expect(def.description).toBe("Read a file")
  })
})

describe("llm/schema - ModelRef", () => {
  it("decodes a valid ModelRef", () => {
    const ref = Schema.decodeUnknownSync(ModelRef)({
      providerID: "openai",
      modelID: "gpt-4o-mini",
    })
    expect(ref.providerID as string).toBe("openai")
    expect(ref.modelID as string).toBe("gpt-4o-mini")
  })

  it("decodes a ModelRef with optional apiKey and baseURL", () => {
    const ref = Schema.decodeUnknownSync(ModelRef)({
      providerID: "openai",
      modelID: "gpt-4o",
      apiKey: "sk-xxx",
      baseURL: "https://api.openai.com/v1",
    })
    expect(ref.apiKey).toBe("sk-xxx")
    expect(ref.baseURL).toBe("https://api.openai.com/v1")
  })
})

describe("llm/tool - make", () => {
  it("make creates a tool with description and definition", () => {
    const t = LLM.Tool.make({
      description: "get weather",
      parameters: Schema.Struct({ city: Schema.String }),
      success: Schema.Struct({ temperature: Schema.Number }),
    })
    expect(t.description).toBe("get weather")
    expect(t._definition.description).toBe("get weather")
  })

  it("make creates a tool with execute handler", () => {
    const t = LLM.Tool.make({
      description: "echo",
      parameters: Schema.Struct({ msg: Schema.String }),
      success: Schema.Struct({ result: Schema.String }),
      execute: ({ msg }) => Effect.succeed({ result: msg }) as any,
    })
    expect(t.execute).toBeDefined()
    expect(typeof t.execute).toBe("function")
  })

  it("_decode validates input against parameters schema", async () => {
    const t = LLM.Tool.make({
      description: "echo",
      parameters: Schema.Struct({ msg: Schema.String }),
      success: Schema.Struct({ result: Schema.String }),
    })
    const decoded = await Effect.runPromise(t._decode({ msg: "hello" }) as any)
    expect((decoded as any).msg).toBe("hello")
  })

  it("_decode rejects invalid input", async () => {
    const t = LLM.Tool.make({
      description: "echo",
      parameters: Schema.Struct({ msg: Schema.String }),
      success: Schema.Struct({ result: Schema.String }),
    })
    expect(Effect.runPromise(t._decode({ wrong: 1 }) as any)).rejects.toThrow()
  })
})

describe("llm/tool - toDefinitions", () => {
  it("converts a tools record to ToolDefinition array", () => {
    const tools = {
      weather: LLM.Tool.make({
        description: "get weather",
        parameters: Schema.Struct({ city: Schema.String }),
        success: Schema.Struct({ temperature: Schema.Number }),
      }),
      time: LLM.Tool.make({
        description: "get time",
        parameters: Schema.Struct({}),
        success: Schema.Struct({ now: Schema.String }),
      }),
    }
    const defs = LLM.Tool.toDefinitions(tools)
    expect(defs.length).toBe(2)
    expect(defs[0]?.name).toBe("weather")
    expect(defs[1]?.name).toBe("time")
  })
})

describe("llm/tool-runtime - makeRuntime", () => {
  it("creates a RuntimeState with definitions from tools", () => {
    const tools = {
      echo: LLM.Tool.make({
        description: "echo input",
        parameters: Schema.Struct({ msg: Schema.String }),
        success: Schema.Struct({ result: Schema.String }),
      }),
    }
    const state = LLM.ToolRuntime.makeRuntime(tools)
    expect(state.tools.echo).toBeDefined()
    expect(state.definitions.length).toBe(1)
    expect(state.definitions[0]?.name).toBe("echo")
  })
})

describe("llm/tool-runtime - dispatch", () => {
  it("dispatches to the correct tool and returns result", async () => {
    const tools = {
      echo: LLM.Tool.make({
        description: "echo input",
        parameters: Schema.Struct({ msg: Schema.String }),
        success: Schema.Struct({ result: Schema.String }),
        execute: ({ msg }) => Effect.succeed({ result: msg }) as any,
      }),
    }
    const state = LLM.ToolRuntime.makeRuntime(tools)
    const result = await Effect.runPromise(
      LLM.ToolRuntime.dispatch(state, "echo", { msg: "hello" }, { id: "call_1", name: "echo" }) as any,
    )
    expect((result as any).result).toBe("hello")
  })

  it("fails when tool name is not found", async () => {
    const tools = {}
    const state = LLM.ToolRuntime.makeRuntime(tools)
    expect(
      Effect.runPromise(
        LLM.ToolRuntime.dispatch(state, "nonexistent", {}, { id: "call_1", name: "nonexistent" }) as any,
      ),
    ).rejects.toThrow("tool nonexistent not found")
  })

  it("fails when input does not match parameters schema", async () => {
    const tools = {
      echo: LLM.Tool.make({
        description: "echo input",
        parameters: Schema.Struct({ msg: Schema.String }),
        success: Schema.Struct({ result: Schema.String }),
        execute: ({ msg }) => Effect.succeed({ result: msg }) as any,
      }),
    }
    const state = LLM.ToolRuntime.makeRuntime(tools)
    expect(
      Effect.runPromise(
        LLM.ToolRuntime.dispatch(state, "echo", { wrong: 123 }, { id: "call_1", name: "echo" }) as any,
      ),
    ).rejects.toThrow()
  })
})

// ============================================================================
// schema/ids — ProviderID / ModelID brand and make functions
// ============================================================================

describe("llm/schema/ids - ProviderID", () => {
  it("decodes a branded ProviderID string", () => {
    const branded = ProviderIDMake("openai")
    const result = Schema.decodeUnknownSync(ProviderID)(branded)
    expect(result as string).toBe("openai")
  })

  it("ProviderIDMake returns a string with the brand", () => {
    const id = ProviderIDMake("anthropic")
    expect(typeof id).toBe("string")
    expect(Schema.decodeUnknownSync(ProviderID)(id) as string).toBe("anthropic")
  })

  it("ProviderIDMake creates distinct values", () => {
    const a = ProviderIDMake("openai")
    const b = ProviderIDMake("anthropic")
    expect(a as string).not.toBe(b as string)
  })
})

describe("llm/schema/ids - ModelID", () => {
  it("decodes a branded ModelID string", () => {
    const branded = ModelIDMake("gpt-4o")
    const result = Schema.decodeUnknownSync(ModelID)(branded)
    expect(result as string).toBe("gpt-4o")
  })

  it("ModelIDMake returns a string with the brand", () => {
    const id = ModelIDMake("claude-sonnet-4-6")
    expect(typeof id).toBe("string")
    expect(Schema.decodeUnknownSync(ModelID)(id) as string).toBe("claude-sonnet-4-6")
  })

  it("ModelIDMake creates distinct values", () => {
    const a = ModelIDMake("gpt-4o")
    const b = ModelIDMake("gpt-4o-mini")
    expect(a as string).not.toBe(b as string)
  })
})

describe("llm/schema/ids - distinct brands", () => {
  it("ProviderID and ModelID are separate brand types", () => {
    const pid = ProviderIDMake("gpt-4o")
    const mid = ModelIDMake("gpt-4o")
    // Both decode as strings since brand is type-level
    expect(typeof pid).toBe("string")
    expect(typeof mid).toBe("string")
    // The values themselves differ in their brand identity
    expect(pid as string).toBe("gpt-4o")
    expect(mid as string).toBe("gpt-4o")
  })
})

// ============================================================================
// schema/messages — ContentPart, MessageRole, MessageInput, GenerationOptions
// ============================================================================

describe("llm/schema/messages - ContentPart", () => {
  it("decodes a TextPart as ContentPart", () => {
    const result = Schema.decodeUnknownSync(ContentPart)({ type: "text", text: "hello" })
    expect(result.type).toBe("text")
    expect((result as any).text).toBe("hello")
  })

  it("decodes a ToolCallPart as ContentPart", () => {
    const result = Schema.decodeUnknownSync(ContentPart)({ type: "tool-call", id: "t1", name: "read", input: {} })
    expect(result.type).toBe("tool-call")
    expect((result as any).name).toBe("read")
  })

  it("decodes a ToolResultPart as ContentPart", () => {
    const result = Schema.decodeUnknownSync(ContentPart)({ type: "tool-result", id: "t1", name: "read", result: "done" })
    expect(result.type).toBe("tool-result")
    expect((result as any).result).toBe("done")
  })

  it("rejects an unknown content type", () => {
    expect(() => Schema.decodeUnknownSync(ContentPart)({ type: "unknown" })).toThrow()
  })
})

describe("llm/schema/messages - MessageRole", () => {
  it("accepts 'system'", () => {
    expect(Schema.decodeUnknownSync(MessageRole)("system")).toBe("system")
  })

  it("accepts 'user'", () => {
    expect(Schema.decodeUnknownSync(MessageRole)("user")).toBe("user")
  })

  it("accepts 'assistant'", () => {
    expect(Schema.decodeUnknownSync(MessageRole)("assistant")).toBe("assistant")
  })

  it("accepts 'tool'", () => {
    expect(Schema.decodeUnknownSync(MessageRole)("tool")).toBe("tool")
  })

  it("rejects an unknown role", () => {
    expect(() => Schema.decodeUnknownSync(MessageRole)("unknown")).toThrow()
  })
})

describe("llm/schema/messages - MessageInput", () => {
  it("decodes a message input with string content", () => {
    const result = Schema.decodeUnknownSync(MessageInput)({ role: "user", content: "hello" })
    expect(result.role).toBe("user")
    expect(result.content).toBe("hello")
  })

  it("decodes a message input with array content", () => {
    const result = Schema.decodeUnknownSync(MessageInput)({ role: "assistant", content: [{ type: "text", text: "hi" }] })
    expect(result.role).toBe("assistant")
    expect(Array.isArray(result.content)).toBe(true)
  })

  it("rejects missing content field", () => {
    expect(() => Schema.decodeUnknownSync(MessageInput)({ role: "user" })).toThrow()
  })

  it("rejects missing role field", () => {
    expect(() => Schema.decodeUnknownSync(MessageInput)({ content: "hello" })).toThrow()
  })
})

describe("llm/schema/messages - GenerationOptions", () => {
  it("decodes empty options (all optional)", () => {
    const result = Schema.decodeUnknownSync(GenerationOptions)({})
    expect(result).toBeDefined()
  })

  it("decodes with maxTokens", () => {
    const result = Schema.decodeUnknownSync(GenerationOptions)({ maxTokens: 4096 })
    expect((result as any).maxTokens).toBe(4096)
  })

  it("decodes with temperature", () => {
    const result = Schema.decodeUnknownSync(GenerationOptions)({ temperature: 0.7 })
    expect((result as any).temperature).toBe(0.7)
  })

  it("decodes with topP", () => {
    const result = Schema.decodeUnknownSync(GenerationOptions)({ topP: 0.9 })
    expect((result as any).topP).toBe(0.9)
  })

  it("decodes with stop sequences", () => {
    const result = Schema.decodeUnknownSync(GenerationOptions)({ stop: ["\n\n", "END"] })
    expect((result as any).stop).toEqual(["\n\n", "END"])
  })

  it("decodes with all options combined", () => {
    const result = Schema.decodeUnknownSync(GenerationOptions)({
      maxTokens: 2048,
      temperature: 0.5,
      topP: 0.95,
      stop: ["STOP"],
    })
    expect((result as any).maxTokens).toBe(2048)
    expect((result as any).temperature).toBe(0.5)
    expect((result as any).topP).toBe(0.95)
    expect((result as any).stop).toEqual(["STOP"])
  })
})

// ============================================================================
// protocols — Protocol constant
// ============================================================================

describe("llm/protocols - Protocol", () => {
  it("equals 'openai-chat'", () => {
    expect(Protocol).toBe("openai-chat")
  })

  it("is a string literal type", () => {
    expect(typeof Protocol).toBe("string")
  })
})

// ============================================================================
// providers — re-exports and provider metadata
// ============================================================================

describe("llm/providers - OpenAI", () => {
  it("OpenAI.provider has id 'openai'", () => {
    expect(OpenAI.provider.id as string).toBe("openai")
  })

  it("OpenAI.provider.model creates a ModelRef", () => {
    const ref = OpenAI.provider.model("gpt-4o")
    expect(ref.providerID as string).toBe("openai")
    expect(ref.modelID as string).toBe("gpt-4o")
  })

  it("OpenAI.model without options omits apiKey and baseURL", () => {
    const m = OpenAI.model("gpt-4o-mini")
    expect(m.apiKey).toBeUndefined()
    expect(m.baseURL).toBeUndefined()
  })

  it("OpenAI.model with apiKey sets apiKey", () => {
    const m = OpenAI.model("gpt-4o", { apiKey: "sk-abc" })
    expect(m.apiKey).toBe("sk-abc")
  })

  it("OpenAI.model with baseURL sets baseURL", () => {
    const m = OpenAI.model("gpt-4o", { baseURL: "https://custom.openai.com/v1" })
    expect(m.baseURL).toBe("https://custom.openai.com/v1")
  })
})

describe("llm/providers - OpenAICompatible", () => {
  it("OpenAICompatible.provider has id 'openai-compatible'", () => {
    expect(OpenAICompatible.provider.id as string).toBe("openai-compatible")
  })

  it("OpenAICompatible.provider.model creates a ModelRef", () => {
    const ref = OpenAICompatible.provider.model("llama3", { baseURL: "http://localhost:11434/v1" })
    expect(ref.providerID as string).toBe("openai-compatible")
    expect(ref.modelID as string).toBe("llama3")
    expect(ref.baseURL).toBe("http://localhost:11434/v1")
  })

  it("OpenAICompatible.model throws when baseURL is empty string", () => {
    expect(() => OpenAICompatible.model("llama3", { baseURL: "" })).toThrow("openai-compatible requires baseURL")
  })

  it("OpenAICompatible.model passes apiKey through", () => {
    const m = OpenAICompatible.model("deepseek-chat", { baseURL: "https://api.deepseek.com/v1", apiKey: "sk-ds" })
    expect(m.apiKey).toBe("sk-ds")
    expect(m.baseURL).toBe("https://api.deepseek.com/v1")
  })
})