import { cac } from "cac";
import { startCommand } from "./commands/start.js";
import { loginCommand } from "./commands/login.js";
import { accountsCommand } from "./commands/accounts.js";
import { configCommand } from "./commands/config.js";
import { modelsCommand } from "./commands/models.js";
import { codeCommand } from "./commands/code.js";
import { setLogLevel } from "../shared/logger.js";

const cli = cac("agy-tools");

// Global options
cli.option("--debug", "Enable debug logging");

// Commands
cli
  .command("start", "Start the proxy server")
  .option("-p, --port <port>", "Server port", { default: 38080 })
  .option("-H, --host <host>", "Server host", { default: "127.0.0.1" })
  .option("-k, --api-key <key>", "API key for authentication")
  .action(startCommand);

cli
  .command("login", "Login with Google account (OAuth2)")
  .action(loginCommand);

cli
  .command("accounts", "List all accounts")
  .alias("ls")
  .action(accountsCommand.list);

cli
  .command("accounts add", "Add a new account (alias for login)")
  .action(loginCommand);

cli
  .command("accounts remove <id>", "Remove an account")
  .action(accountsCommand.remove);

cli
  .command("accounts refresh [id]", "Refresh account tokens")
  .action(accountsCommand.refresh);

cli
  .command("accounts clear-rate-limits", "Clear rate limit state for all accounts")
  .action(accountsCommand.clearRateLimits);

cli
  .command("config [action] [key] [value]", "Manage configuration")
  .action((action?: string, key?: string, value?: string) => {
    if (!action || action === "show") {
      configCommand.show();
    } else if (action === "set") {
      if (!key || !value) {
        console.error("Usage: agy-tools config set <key> <value>");
        process.exit(1);
      }
      configCommand.set(key, value);
    } else if (action === "reset") {
      configCommand.reset();
    } else {
      console.error(`Unknown config action: ${action}`);
      process.exit(1);
    }
  });

cli
  .command("models", "List all available models")
  .action(modelsCommand);

cli
  .command("code <agent> [...args]", "Launch a coding agent with agy-tools proxy")
  .option("-p, --port <port>", "Server port (random if not specified)")
  .option("-H, --host <host>", "Server host", { default: "127.0.0.1" })
  .option("-k, --api-key <key>", "API key for authentication (random if not specified)")
  .action(codeCommand);

// Help and version
cli.help();
cli.version("0.1.0");

// Parse and run
export function run(): void {
  const parsed = cli.parse();

  // Handle global options
  if (parsed.options.debug) {
    setLogLevel("debug");
  }
}
