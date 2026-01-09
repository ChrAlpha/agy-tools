import type { ModelFamily } from "../../shared/types.js";
import { tokenStore } from "./tokenStore.js";
import { logger } from "../../shared/logger.js";

/**
 * AccountManager handles selecting and rotating accounts for API requests.
 * Uses round-robin strategy with per-model rate-limit awareness.
 * Based on CLIProxyAPI's auth conductor/selector pattern.
 */
export class AccountManager {
  /**
   * Get a valid access token for API requests.
   * Automatically handles token refresh and account rotation.
   * Now supports per-model rate limit filtering.
   */
  async getAccessToken(
    family: ModelFamily = "gemini",
    model?: string
  ): Promise<{ token: string; projectId: string; accountId: string } | null> {
    await tokenStore.load();

    const result = await tokenStore.getValidAccessToken(family, model);

    if (!result) {
      logger.warn(`No valid account available for model ${model || "unknown"}`);
      return null;
    }

    return {
      token: result.token,
      projectId: result.projectId,
      accountId: result.accountId
    };
  }

  /**
   * Mark the last used account as rate-limited for a specific model.
   * Called when API returns 429 error.
   * Uses exponential backoff for repeated failures.
   */
  markRateLimited(accountId: string, retryAfterMs: number = 60000, model?: string): void {
    tokenStore.markRateLimited(accountId, retryAfterMs, model);
  }

  /**
   * Mark a successful request for an account and model.
   * Resets the per-model rate limit state and backoff level.
   */
  markSuccess(accountId: string, model?: string): void {
    tokenStore.markSuccess(accountId, model);
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
