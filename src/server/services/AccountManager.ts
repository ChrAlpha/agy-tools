import type { ModelFamily } from "../../shared/types.js";
import { tokenStore } from "./tokenStore.js";
import { logger } from "../../shared/logger.js";

/**
 * AccountManager handles selecting and rotating accounts for API requests.
 * Uses round-robin strategy with rate-limit awareness.
 */
export class AccountManager {
  /**
   * Get a valid access token for API requests.
   * Automatically handles token refresh and account rotation.
   */
  async getAccessToken(
    family: ModelFamily = "gemini"
  ): Promise<{ token: string; projectId: string } | null> {
    await tokenStore.load();

    const result = await tokenStore.getValidAccessToken(family);

    if (!result) {
      logger.warn("No valid account available for API requests");
      return null;
    }

    return { token: result.token, projectId: result.projectId };
  }

  /**
   * Mark the last used account as rate-limited.
   * Called when API returns 429 error.
   */
  markRateLimited(accountId: string, retryAfterMs: number = 60000): void {
    tokenStore.markRateLimited(accountId, retryAfterMs);
  }

  /**
   * Mark an account as disabled (e.g., token revoked).
   */
  markDisabled(accountId: string, reason: string): void {
    tokenStore.markDisabled(accountId, reason);
  }

  /**
   * Get the number of available accounts.
   */
  getAccountCount(): number {
    return tokenStore.getAccounts().filter((a) => !a.disabled).length;
  }
}
