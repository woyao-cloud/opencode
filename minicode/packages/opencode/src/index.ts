import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import * as Log from "@minicode/core/util/log"
import { InstallationVersion } from "@minicode/core/installation/version"
import { UI } from "./cli/ui"
import { runCommand } from "./cli/cmd/run"
import { serveCommand } from "./cli/cmd/serve"
import { planCommand } from "./cli/cmd/plan"
import { buildCommand } from "./cli/cmd/build"
import { reviewCommand } from "./cli/cmd/review"
process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", {
    e: e instanceof Error ? e.message : String(e),
  })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", {
    e: e instanceof Error ? e.message : String(e),
  })
})
const args = hideBin(process.argv)
yargs(args)
  .scriptName("minicode")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
  .alias("version", "v")
  .command(
    "run",
    "Run minicode with a prompt",
    (y) =>
      y
        .option("prompt", {
          type: "string",
          alias: "p",
          describe: "prompt to send",
        })
        .option("interactive", {
          type: "boolean",
          alias: "i",
          describe: "interactive mode",
        })
        .option("model", { type: "string", describe: "model id" })
        .option("base-url", {
          type: "string",
          describe: "base URL for OpenAI-compatible",
        })
        .option("api-key", { type: "string", describe: "API key" }),
    (argv) => {
      process.stderr.write(UI.logo())
      runCommand({
        prompt: argv.prompt as string | undefined,
        interactive: argv.interactive as boolean | undefined,
        model: argv.model as string | undefined,
        baseURL: argv["base-url"] as string | undefined,
        apiKey: argv["api-key"] as string | undefined,
      }).catch((e) => {
        console.error("Error:", e instanceof Error ? e.message : String(e))
        process.exit(1)
      })
    },
  )

  .command(
    "serve",
    "Start the minicode HTTP server",
    (y) =>
      y
        .option("port", {
          type: "number",
          default: 4096,
          describe: "port",
        })
        .option("hostname", {
          type: "string",
          default: "localhost",
          describe: "hostname",
        }),
    (argv) => {
      void serveCommand({ port: argv.port as number, hostname: argv.hostname as string })
    },
  )
  .command(
    "plan",
    "Generate a structured build plan from a prompt",
    (y) =>
      y
        .option("prompt", {
          type: "string",
          alias: "p",
          describe: "prompt describing what to build",
        })
        .option("build", {
          type: "boolean",
          alias: "b",
          describe: "execute the plan after generating it",
        })
        .option("review", {
          type: "boolean",
          alias: "r",
          describe: "enable review loop (plan → build → review → re-plan)",
        })
        .option("model", { type: "string", describe: "model id" })
        .option("base-url", {
          type: "string",
          describe: "base URL for OpenAI-compatible",
        })
        .option("api-key", { type: "string", describe: "API key" }),
    (argv) => {
      process.stderr.write(UI.logo())
      planCommand({
        prompt: argv.prompt as string | undefined,
        build: argv.build as boolean | undefined,
        review: argv.review as boolean | undefined,
        model: argv.model as string | undefined,
        baseURL: argv["base-url"] as string | undefined,
        apiKey: argv["api-key"] as string | undefined,
      }).catch((e) => {
        console.error("Error:", e instanceof Error ? e.message : String(e))
        process.exit(1)
      })
    },
  )
  .command(
    "build",
    "Execute a build plan from a JSON file or string",
    (y) =>
      y
        .option("plan", {
          type: "string",
          describe: "plan JSON string",
        })
        .option("plan-file", {
          type: "string",
          describe: "path to plan JSON file",
        })
        .option("model", { type: "string", describe: "model id" })
        .option("base-url", {
          type: "string",
          describe: "base URL for OpenAI-compatible",
        })
        .option("api-key", { type: "string", describe: "API key" }),
    (argv) => {
      process.stderr.write(UI.logo())
      buildCommand({
        plan: argv.plan as string | undefined,
        planFile: argv["plan-file"] as string | undefined,
        model: argv.model as string | undefined,
        baseURL: argv["base-url"] as string | undefined,
        apiKey: argv["api-key"] as string | undefined,
      }).catch((e) => {
        console.error("Error:", e instanceof Error ? e.message : String(e))
        process.exit(1)
      })
    },
  )
  .command(
    "review",
    "Review a build result against a plan",
    (y) =>
      y
        .option("plan", {
          type: "string",
          describe: "plan JSON string",
        })
        .option("plan-file", {
          type: "string",
          describe: "path to plan JSON file",
        })
        .option("build-result", {
          type: "string",
          describe: "build result JSON string",
        })
        .option("build-result-file", {
          type: "string",
          describe: "path to build result JSON file",
        })
        .option("model", { type: "string", describe: "model id" })
        .option("base-url", {
          type: "string",
          describe: "base URL for OpenAI-compatible",
        })
        .option("api-key", { type: "string", describe: "API key" }),
    (argv) => {
      process.stderr.write(UI.logo())
      reviewCommand({
        plan: argv.plan as string | undefined,
        planFile: argv["plan-file"] as string | undefined,
        buildResult: argv["build-result"] as string | undefined,
        buildResultFile: argv["build-result-file"] as string | undefined,
        model: argv.model as string | undefined,
        baseURL: argv["base-url"] as string | undefined,
        apiKey: argv["api-key"] as string | undefined,
      }).catch((e) => {
        console.error("Error:", e instanceof Error ? e.message : String(e))
        process.exit(1)
      })
    },
  )
  .demandCommand(1)
  .strict()
  .parse()
