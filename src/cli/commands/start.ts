import chalk from "chalk";
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

  // Refresh accounts and quotas before starting
  const accounts = tokenStore.getAccounts();
  if (accounts.length > 0) {
    logger.info(`Refreshing ${accounts.length} account(s)...`);
    for (const account of accounts) {
      try {
        await tokenStore.refreshAccount(account.id);
        await tokenStore.refreshQuota(account.id);
      } catch (error) {
        logger.warn(`Failed to refresh account ${account.email}`);
      }
    }

    // Print quota summary
    logger.print(chalk.bold("\nAccount Quotas:"));
    for (const account of tokenStore.getAccounts()) {
      const status = account.disabled
        ? chalk.red("disabled")
        : account.rateLimitedUntil && account.rateLimitedUntil > Date.now()
          ? chalk.yellow("rate-limited")
          : chalk.green("active");

      logger.print(`  ${chalk.cyan(account.email)}  [${status}] [tier: ${account.tier || "FREE"}]`);

      if (account.quota && account.quota.models.length > 0) {
        const groups: Record<string, { sum: number; count: number }> = {};

        for (const m of account.quota.models) {
          let family = "";
          if (m.name.includes("claude")) {
            family = "Claude";
          } else if (m.name.includes("gemini-3")) {
            family = "Gemini 3";
          } else if (m.name.includes("gemini-2.5")) {
            family = "Gemini 2.5";
          } else if (m.name.includes("gemini-1.5")) {
            family = "Gemini 1.5";
          }

          if (family) {
            if (!groups[family]) groups[family] = { sum: 0, count: 0 };
            groups[family].sum += m.percentage;
            groups[family].count += 1;
          }
        }

        const quotaDisplay = Object.entries(groups).map(
          ([name, data]) => `${name}: ${(data.sum / data.count).toFixed(0)}%`
        );

        if (quotaDisplay.length > 0) {
          logger.print(chalk.gray(`    Quota: ${quotaDisplay.join(" | ")}`));
        }
      }
    }
    logger.print("");
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
