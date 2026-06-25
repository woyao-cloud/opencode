import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import * as Log from "@miniopencode/core/util/log"
import { InstallationVersion } from "@miniopencode/core/installation/version"
import { runCommand } from "./cli/cmd/run"
import { sessionListCommand, sessionGetCommand, sessionDeleteCommand } from "./cli/cmd/session"
import { serveCommand } from "./cli/cmd/serve"
import { mcpListCommand } from "./cli/cmd/mcp"

process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", { e: e instanceof Error ? e.message : String(e) })
})
process.on("uncaughtException", (e) => {
  Log.Default.error("exception", { e: e instanceof Error ? e.message : String(e) })
})

const args = hideBin(process.argv)
yargs(args)
  .scriptName("miniopencode")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
  .alias("version", "v")
  .command(
    "run",
    "Run miniopencode with a prompt",
    (y) =>
      y
        .option("prompt", { type: "string", alias: "p", describe: "prompt to send" })
        .option("model", { type: "string", describe: "model id" })
        .option("base-url", { type: "string", describe: "base URL for OpenAI-compatible" })
        .option("api-key", { type: "string", describe: "API key" })
        .option("interactive", { type: "boolean", alias: "i", describe: "interactive REPL mode" }),
    (argv) => {
      runCommand({
        prompt: argv.prompt as string | undefined,
        model: argv.model as string | undefined,
        baseURL: argv["base-url"] as string | undefined,
        apiKey: argv["api-key"] as string | undefined,
        interactive: argv.interactive as boolean | undefined,
      }).catch((e) => {
        console.error("Error:", e instanceof Error ? e.message : String(e))
        process.exit(1)
      })
    },
  )
  .command(
    "session",
    "Session management commands",
    (y) =>
      y
        .command(
          "list",
          "List all sessions",
          (y2) => y2.option("limit", { type: "number", describe: "max results", default: 20 }),
          (argv) => {
            sessionListCommand({ limit: argv.limit as number }).catch((e) => {
              console.error("Error:", e instanceof Error ? e.message : String(e))
              process.exit(1)
            })
          },
        )
        .command(
          "get <id>",
          "Show session details and messages",
          (y2) => y2.positional("id", { type: "string", describe: "session id", demandOption: true }),
          (argv) => {
            sessionGetCommand({ id: argv.id as string }).catch((e) => {
              console.error("Error:", e instanceof Error ? e.message : String(e))
              process.exit(1)
            })
          },
        )
        .command(
          "delete <id>",
          "Delete a session and its messages",
          (y2) => y2.positional("id", { type: "string", describe: "session id", demandOption: true }),
          (argv) => {
            sessionDeleteCommand({ id: argv.id as string }).catch((e) => {
              console.error("Error:", e instanceof Error ? e.message : String(e))
              process.exit(1)
            })
          },
        ),
  )
  .command(
    "serve",
    "Start HTTP server with session API",
    (y) =>
      y
        .option("port", { type: "number", describe: "port to listen on", default: 8080 })
        .option("host", { type: "string", describe: "host to bind to", default: "127.0.0.1" })
        .option("model", { type: "string", describe: "model id for prompts" }),
    (argv) => {
      serveCommand({
        port: argv.port as number,
        host: argv.host as string,
        model: argv.model as string | undefined,
      }).catch((e) => {
        console.error("Error:", e instanceof Error ? e.message : String(e))
        process.exit(1)
      })
    },
  )
  .command(
    "mcp",
    "List MCP servers and tools",
    () => {},
    () => {
      mcpListCommand().catch((e) => {
        console.error("Error:", e instanceof Error ? e.message : String(e))
        process.exit(1)
      })
    },
  )
  .demandCommand(1)
  .strict()
  .parse()
