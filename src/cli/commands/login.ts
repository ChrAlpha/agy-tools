import ora from "ora";
import { logger } from "../../shared/index.js";
import { startOAuthFlow } from "../../server/services/auth.js";
import { tokenStore } from "../../server/services/tokenStore.js";

export async function loginCommand(): Promise<void> {
  const spinner = ora("Starting OAuth flow...").start();

  try {
    // Start OAuth server and get auth URL
    const { authUrl, waitForCallback } = await startOAuthFlow();

    spinner.stop();

    // Print the URL first for remote/SSH users
    console.log("\n请在浏览器中打开以下链接完成登录:\n");
    console.log(`  ${authUrl}\n`);
    console.log("等待认证回调... (按 Ctrl+C 取消)\n");

    spinner.start("Waiting for authentication...");

    // Wait for callback
    const account = await waitForCallback();

    spinner.succeed(`Successfully logged in as ${account.email}`);

    // Show account info
    logger.info(`Account ID: ${account.id}`);
    logger.info(`Total accounts: ${tokenStore.getAccounts().length}`);
  } catch (error) {
    spinner.fail("Login failed");
    logger.error("OAuth error:", error);
    process.exit(1);
  }
}
