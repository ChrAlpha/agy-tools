import { cac } from "cac";
import { startCommand } from "./commands/start.js";
import { loginCommand } from "./commands/login.js";
import { accountsCommand } from "./commands/accounts.js";
import { configCommand } from "./commands/config.js";
import { modelsCommand } from "./commands/models.js";
import { setLogLevel } from "../shared/logger.js";

const cli = cac("agy-tools");

// Global options
cli.option("--debug", "Enable debug logging");

// Commands
cli
  .command("start", "Start the proxy server")
  .option("-p, --port <port>", "Server port", { default: 8080 })
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
  .command("config", "Show current configuration")
  .action(configCommand.show);

cli
  .command("config set <key> <value>", "Set a configuration value")
  .action(configCommand.set);

cli
  .command("config reset", "Reset configuration to defaults")
  .action(configCommand.reset);

cli
  .command("models", "List all available models")
  .action(modelsCommand);

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
