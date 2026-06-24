// ── WebFetch Tool — Fetch web content ─────────────────────────
// Uses Bun.fetch() for HTTP requests and htmlparser2 + turndown
// for HTML-to-markdown conversion when needed.

import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Parser } from "htmlparser2"
import TurndownService from "turndown"
import DESCRIPTION from "./webfetch.txt"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_TIMEOUT = 30_000
const MAX_TIMEOUT = 120_000

const Parameters = Schema.Struct({
  url: Schema.String.annotate({ description: "The URL to fetch content from" }),
  format: Schema.Literals(["text", "markdown", "html"])
    .annotate({
      description: "The format to return the content in (text, markdown, or html). Defaults to markdown.",
      default: "markdown",
    })
    .pipe(Schema.optional, Schema.withDecodingDefault(Effect.succeed("markdown" as const))),
  timeout: Schema.optional(Schema.Number).annotate({ description: "Optional timeout in seconds (max 120)" }),
})

export const WebFetchTool = Tool.define(
  "webfetch",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.ToolContext) =>
      Effect.gen(function* () {
        if (!params.url.startsWith("http://") && !params.url.startsWith("https://")) {
          return { title: "Error", output: "URL must start with http:// or https://" }
        }

        const timeout = Math.min((params.timeout ?? DEFAULT_TIMEOUT / 1000) * 1000, MAX_TIMEOUT)

        try {
          const response = yield* Effect.promise(() =>
            fetch(params.url, {
              signal: AbortSignal.timeout(timeout),
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
                Accept:
                  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
              },
            }),
          )

          const arrayBuffer = yield* Effect.promise(() => response.arrayBuffer())

          if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE) {
            return { title: params.url, output: "Response too large (exceeds 5MB limit)" }
          }

          const contentType = response.headers.get("content-type") ?? ""
          const content = new TextDecoder().decode(arrayBuffer)

          switch (params.format) {
            case "markdown":
              if (contentType.includes("text/html")) {
                return { title: params.url, output: convertHTMLToMarkdown(content) }
              }
              return { title: params.url, output: content }

            case "text":
              if (contentType.includes("text/html")) {
                return { title: params.url, output: extractTextFromHTML(content) }
              }
              return { title: params.url, output: content }

            case "html":
            default:
              return { title: params.url, output: content }
          }
        } catch (e) {
          return {
            title: "Error",
            output: `Error fetching ${params.url}: ${e instanceof Error ? e.message : String(e)}`,
          }
        }
      }),
  }),
)

function extractTextFromHTML(html: string): string {
  let text = ""
  let skipDepth = 0
  const parser = new Parser({
    onopentag(name) {
      if (skipDepth > 0 || ["script", "style", "noscript", "iframe", "object", "embed"].includes(name)) {
        skipDepth++
      }
    },
    ontext(input) {
      if (skipDepth === 0) text += input
    },
    onclosetag() {
      if (skipDepth > 0) skipDepth--
    },
  })
  parser.write(html)
  parser.end()
  return text.trim()
}

function convertHTMLToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  })
  turndownService.remove(["script", "style", "meta", "link"])
  return turndownService.turndown(html)
}
