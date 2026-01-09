import { logger, loadConfig } from "../../shared/index.js";
import { startServer } from "../../server/app.js";
import { tokenStore } from "../../server/services/tokenStore.js";
import { loginCommand } from "./login.js";

interface StartOptions {
  port: number;
  host: string;
  apiKey?: string;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const config = loadConfig();

  // Load accounts and check if any exist
  await tokenStore.load();
  if (tokenStore.getAccounts().length === 0) {
    logger.info("No accounts found. Starting login flow...");
    await loginCommand();
  }

  // Override config with CLI options
  const host = options.host || config.server.host;
  const port = options.port || config.server.port;
  const apiKey = options.apiKey || config.server.apiKey;

  logger.info(`Starting agy-tools server on ${host}:${port}`);

  try {
    await startServer({ host, port, apiKey });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}
