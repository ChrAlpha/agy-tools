import chalk from "chalk";
import ora from "ora";
import { logger } from "../../shared/index.js";
import { tokenStore } from "../../server/services/tokenStore.js";

export const accountsCommand = {
  async list(): Promise<void> {
    await tokenStore.load();
    const accounts = tokenStore.getAccounts();

    if (accounts.length === 0) {
      logger.info("No accounts found. Use 'agy login' to add an account.");
      return;
    }

    logger.print(chalk.bold(`\nAccounts (${accounts.length}):\n`));

    for (const account of accounts) {
      const status = account.disabled
        ? chalk.red("disabled")
        : account.rateLimitedUntil && account.rateLimitedUntil > Date.now()
          ? chalk.yellow("rate-limited")
          : chalk.green("active");

      const isExpired = account.tokens.expiresAt < Date.now();
      const tokenStatus = isExpired
        ? chalk.red("expired")
        : chalk.green("valid");

      logger.print(
        `  ${chalk.cyan(account.id.slice(0, 8))}  ${account.email}  [${status}] [token: ${tokenStatus}]`
      );

      if (account.disabled && account.disabledReason) {
        logger.print(chalk.gray(`    Reason: ${account.disabledReason}`));
      }
    }

    logger.print("");
  },

  async remove(id: string): Promise<void> {
    await tokenStore.load();
    const accounts = tokenStore.getAccounts();

    // Find account by ID prefix
    const account = accounts.find((a) => a.id.startsWith(id));

    if (!account) {
      logger.error(`Account not found: ${id}`);
      process.exit(1);
    }

    await tokenStore.removeAccount(account.id);
    logger.success(`Removed account: ${account.email}`);
  },

  async refresh(id?: string): Promise<void> {
    await tokenStore.load();
    const accounts = tokenStore.getAccounts();

    if (accounts.length === 0) {
      logger.info("No accounts to refresh.");
      return;
    }

    const spinner = ora("Refreshing tokens...").start();

    try {
      if (id) {
        // Refresh specific account
        const account = accounts.find((a) => a.id.startsWith(id));
        if (!account) {
          spinner.fail(`Account not found: ${id}`);
          process.exit(1);
        }

        await tokenStore.refreshAccount(account.id);
        spinner.succeed(`Refreshed token for: ${account.email}`);
      } else {
        // Refresh all accounts
        let refreshed = 0;
        let failed = 0;

        for (const account of accounts) {
          try {
            await tokenStore.refreshAccount(account.id);
            refreshed++;
          } catch {
            failed++;
            logger.warn(`Failed to refresh: ${account.email}`);
          }
        }

        spinner.succeed(
          `Refreshed ${refreshed} account(s)` +
            (failed > 0 ? `, ${failed} failed` : "")
        );
      }
    } catch (error) {
      spinner.fail("Refresh failed");
      logger.error("Error:", error);
      process.exit(1);
    }
  },
};
