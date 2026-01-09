import chalk from "chalk";
import ora from "ora";
import { logger } from "../../shared/index.js";
import { tokenStore } from "../../server/services/tokenStore.js";

export const accountsCommand = {
  async list(): Promise<void> {
    await tokenStore.load();
    const accounts = tokenStore.getAccounts();

    if (accounts.length === 0) {
      logger.info("No accounts found. Use 'agy-tools login' to add an account.");
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
        `  ${chalk.cyan(account.id.slice(0, 8))}  ${account.email}  [${status}] [token: ${tokenStatus}] [tier: ${account.tier || "FREE"}]`
      );

      if (account.quota && account.quota.models.length > 0) {
        const models = account.quota.models;

        // logger.print(chalk.gray(`    Models:`));
        // for (const m of models) {
        //   logger.print(
        //     chalk.gray(
        //       `      - ${m.name}: ${m.percentage.toFixed(0)}% used`
        //     )
        //   );
        // }

        const groups: Record<string, { sum: number, count: number }> = {};

        for (const m of models) {
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

        const quotaDisplay = Object.entries(groups)
          .map(([name, data]) => `${name}: ${(data.sum / data.count).toFixed(0)}%`);

        if (quotaDisplay.length > 0) {
          logger.print(chalk.gray(`    Quota: ${quotaDisplay.join(" | ")}`));
        }
      }

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
        await tokenStore.refreshQuota(account.id);
        spinner.succeed(`Refreshed token and quota for: ${account.email}`);
      } else {
        // Refresh all accounts
        let refreshed = 0;
        let failed = 0;

        for (const account of accounts) {
          try {
            await tokenStore.refreshAccount(account.id);
            await tokenStore.refreshQuota(account.id);
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

  async clearRateLimits(): Promise<void> {
    await tokenStore.load();
    const count = tokenStore.getAccounts().length;

    if (count === 0) {
      logger.info("No accounts found.");
      return;
    }

    await tokenStore.clearAllRateLimits();
    logger.success(`Cleared rate limits for all ${count} account(s).`);
  },
};
