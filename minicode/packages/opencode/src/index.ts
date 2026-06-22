import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import * as Log from "@minicode/core/util/log"
import { InstallationVersion } from "@minicode/core/installation/version"
import { UI } from "./cli/ui"
import { runCommand } from "./cli/cmd/run"
import { serveCommand } from "./cli/cmd/serve"
process.on("unhandledRejection", (e) => { Log.Default.error("rejection", { e: e instanceof Error ? e.message : String(e) }) })
process.on("uncaughtException", (e) => { Log.Default.error("exception", { e: e instanceof Error ? e.message : String(e) }) })
const args = hideBin(process.argv)
yargs(args)
  .scriptName("minicode")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
  .alias("version", "v")
  .command("run", "Run minicode with a prompt", 
    (y) => 
      y.option("prompt", 
        { type: "string", alias: "p", describe: "prompt to send" }
      ).option("interactive", 
        { type: "boolean", alias: "i", describe: "interactive mode" }
      ).option("model",
         { type: "string", describe: "model id" }
        ).option("base-url", { type: "string", describe: "base URL for OpenAI-compatible" }).option("api-key", { type: "string", describe: "API key" }),     (argv) => { process.stderr.write(UI.logo()); runCommand({ prompt: argv.prompt as string | undefined, interactive: argv.interactive as boolean | undefined, model: argv.model as string | undefined, baseURL: argv["base-url"] as string | undefined, apiKey: argv["api-key"] as string | undefined }).catch((e) => { console.error("Error:", e instanceof Error ? e.message : String(e)); process.exit(1) }) })
  .command("serve", "Start the minicode HTTP server", (y) => y.option("port", { type: "number", default: 4096, describe: "port" }).option("hostname", { type: "string", default: "localhost", describe: "hostname" }), (argv) => { void serveCommand({ port: argv.port as number, hostname: argv.hostname as string }) })
  .demandCommand(1)
  .strict()
  .parse()
