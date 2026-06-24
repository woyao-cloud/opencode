// ── WebSearch Tool — Search the web ───────────────────────────
// Searches the web using whatever search provider is configured.
// Falls back to a Bing Web Search API when a key is available,
// or returns a configuration hint when no provider is set up.

import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./websearch.txt"

const Parameters = Schema.Struct({
  query: Schema.String.annotate({ description: "Websearch query" }),
  numResults: Schema.optional(Schema.Number).annotate({
    description: "Number of search results to return (default: 8)",
  }),
})

export const WebSearchTool = Tool.define(
  "websearch",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.ToolContext) =>
      Effect.gen(function* () {
        const apiKey = process.env["OPENCODE_SEARCH_API_KEY"] ?? process.env["BING_SEARCH_API_KEY"] ?? ""
        const endpoint =
          process.env["OPENCODE_SEARCH_ENDPOINT"] ?? "https://api.bing.microsoft.com/v7.0/search"

        if (!apiKey) {
          return {
            title: "Web search",
            output:
              "Web search is not configured. Set OPENCODE_SEARCH_API_KEY (or BING_SEARCH_API_KEY) environment variable with a Bing Web Search API key, or use webfetch to scrape specific URLs directly.",
          }
        }

        const count = Math.min(params.numResults ?? 8, 20)
        const url = `${endpoint}?q=${encodeURIComponent(params.query)}&count=${count}&textFormat=Raw`

        try {
          const response = yield* Effect.promise(() =>
            fetch(url, {
              headers: {
                "Ocp-Apim-Subscription-Key": apiKey,
                "User-Agent": "miniopencode/1.0",
              },
              signal: AbortSignal.timeout(15_000),
            }),
          )

          if (!response.ok) {
            return {
              title: "Web search",
              output: `Search API returned ${response.status}: ${response.statusText}. Check your OPENCODE_SEARCH_API_KEY.`,
            }
          }

          const data: any = yield* Effect.promise(() => response.json())

          const results = (data.webPages?.value ?? data.results ?? []) as Array<{
            name?: string
            url?: string
            snippet?: string
          }>

          if (results.length === 0) {
            return { title: "Web search", output: `No results found for "${params.query}".` }
          }

          const formatted = results
            .slice(0, count)
            .map(
              (r, i) =>
                `${i + 1}. ${r.name ?? "Untitled"}\n   URL: ${r.url ?? "N/A"}\n   ${r.snippet ?? ""}`,
            )
            .join("\n\n")

          return {
            title: `Web search: ${params.query}`,
            output: `Search results for "${params.query}" (${results.length} results):\n\n${formatted}`,
            metadata: { query: params.query, resultCount: results.length },
          }
        } catch (e) {
          return {
            title: "Web search",
            output: `Search failed: ${e instanceof Error ? e.message : String(e)}`,
          }
        }
      }),
  }),
)
