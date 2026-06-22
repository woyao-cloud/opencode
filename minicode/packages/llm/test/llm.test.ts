import { describe, expect, it } from "bun:test"
import { Schema, Effect } from "effect"
import * as LLM from "@minicode/llm"
import { OpenAI } from "@minicode/llm/providers"
import { OpenAICompatible } from "@minicode/llm/providers"
import { ToolDefinition } from "@minicode/llm/schema/messages"
import { ProviderID, ModelID } from "@minicode/llm/schema/ids"
import { TextPart, ToolCallPart, ToolResultPart, Message, ModelRef } from "@minicode/llm/schema/messages"

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