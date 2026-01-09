import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  ACCOUNTS_FILE,
  CONFIG_DIR,
  logger,
} from "../../shared/index.js";
import type { Account, AccountIndex, ModelFamily } from "../../shared/index.js";
import { refreshTokens, fetchQuota } from "./auth.js";
import { generateProjectId } from "../translator/utils.js";

/**
 * Constants for quota backoff (matching CLIProxyAPI's approach).
 */
const QUOTA_BACKOFF_BASE_MS = 1000; // 1 second
const QUOTA_BACKOFF_MAX_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Calculate next cooldown duration using exponential backoff.
 */
function nextQuotaCooldown(prevLevel: number): { cooldown: number; nextLevel: number } {
  if (prevLevel < 0) prevLevel = 0;

  const cooldown = QUOTA_BACKOFF_BASE_MS * Math.pow(2, prevLevel);

  if (cooldown >= QUOTA_BACKOFF_MAX_MS) {
    return { cooldown: QUOTA_BACKOFF_MAX_MS, nextLevel: prevLevel };
  }

  return { cooldown, nextLevel: prevLevel + 1 };
}

/**
 * Check if an account is blocked for a specific model.
 * Based on CLIProxyAPI's isAuthBlockedForModel function.
 */
function isAccountBlockedForModel(
  account: Account,
  model: string,
  now: number
): { blocked: boolean; nextRetry?: number } {
  if (account.disabled) {
    return { blocked: true };
  }

  // Check per-model state first
  if (model && account.modelStates) {
    const state = account.modelStates[model];
    if (state) {
      if (state.unavailable) {
        if (!state.nextRetryAfter) {
          // Unavailable with no retry time = not blocked (will reset)
          return { blocked: false };
        }
        if (state.nextRetryAfter > now) {
          return { blocked: true, nextRetry: state.nextRetryAfter };
        }
        // Cooldown expired, not blocked
      }
    }
  }

  // Fallback to global rate limit
  if (account.rateLimitedUntil && account.rateLimitedUntil > now) {
    return { blocked: true, nextRetry: account.rateLimitedUntil };
  }

  return { blocked: false };
}

class TokenStore {
  private accounts: Account[] = [];
  private currentAccountIndex: Record<ModelFamily, number> = {
    claude: 0,
    gemini: 0,
  };
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;

    this.ensureConfigDir();

    if (!existsSync(ACCOUNTS_FILE)) {
      this.accounts = [];
      this.loaded = true;
      return;
    }

    try {
      const content = readFileSync(ACCOUNTS_FILE, "utf-8");
      const data = JSON.parse(content) as AccountIndex;
      this.accounts = data.accounts || [];
      this.loaded = true;
      logger.debug(`Loaded ${this.accounts.length} account(s)`);
    } catch (error) {
      logger.warn("Failed to load accounts:", error);
      this.accounts = [];
      this.loaded = true;
    }
  }

  private ensureConfigDir(): void {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  private save(): void {
    this.ensureConfigDir();
    const data: AccountIndex = { accounts: this.accounts };
    writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2), "utf-8");
  }

  getAccounts(): Account[] {
    return [...this.accounts];
  }

  getAccountById(id: string): Account | undefined {
    return this.accounts.find((a) => a.id === id);
  }

  async addAccount(account: Omit<Account, "id" | "createdAt">): Promise<Account> {
    await this.load();

    // Check if account with same email already exists
    const existing = this.accounts.find((a) => a.email === account.email);
    if (existing) {
      // Update existing account
      existing.tokens = account.tokens;
      existing.name = account.name;
      existing.disabled = false;
      existing.disabledReason = undefined;
      this.save();
      logger.debug(`Updated existing account: ${account.email}`);
      return existing;
    }

    const newAccount: Account = {
      ...account,
      id: randomUUID(),
      createdAt: Date.now(),
    };

    this.accounts.push(newAccount);
    this.save();
    logger.debug(`Added new account: ${account.email}`);
    return newAccount;
  }

  async removeAccount(id: string): Promise<boolean> {
    await this.load();
    const index = this.accounts.findIndex((a) => a.id === id);
    if (index === -1) return false;

    this.accounts.splice(index, 1);
    this.save();
    return true;
  }

  async refreshAccount(id: string): Promise<void> {
    await this.load();
    const account = this.accounts.find((a) => a.id === id);
    if (!account) {
      throw new Error(`Account not found: ${id}`);
    }

    try {
      const tokens = await refreshTokens(account.tokens.refreshToken);
      account.tokens = tokens;
      account.disabled = false;
      account.disabledReason = undefined;
      this.save();
    } catch (error) {
      // Mark as disabled if refresh fails (likely revoked)
      account.disabled = true;
      account.disabledReason =
        error instanceof Error ? error.message : "Token refresh failed";
      this.save();
      throw error;
    }
  }

  async refreshQuota(id: string): Promise<void> {
    await this.load();
    const account = this.accounts.find((a) => a.id === id);
    if (!account || !account.projectId) return;

    try {
      // Ensure token is valid before fetching quota
      const now = Date.now();
      if (account.tokens.expiresAt - now < 30000) {
        await this.refreshAccount(id);
      }

      const quota = await fetchQuota(account.tokens.accessToken, account.projectId);
      account.quota = quota;
      this.save();
    } catch (error) {
      logger.warn(`Failed to refresh quota for ${account.email}:`, error);
    }
  }

  /**
   * Get a valid access token for the specified model family.
   * Implements round-robin rotation with per-model rate-limit awareness.
   */
  async getValidAccessToken(
    family: ModelFamily,
    model?: string
  ): Promise<{ token: string; accountId: string; projectId: string } | null> {
    await this.load();

    const getTierPriority = (tier: string | undefined): number => {
      switch (tier) {
        case "ULTRA": return 0;
        case "PRO": return 1;
        case "FREE": return 2;
        default: return 3;
      }
    };

    const now = Date.now();

    // Filter accounts: not disabled and not blocked for this specific model
    const eligibleAccounts = this.accounts
      .filter((a) => {
        if (a.disabled) return false;
        const { blocked } = isAccountBlockedForModel(a, model || "", now);
        return !blocked;
      })
      .sort((a, b) => getTierPriority(a.tier) - getTierPriority(b.tier));

    if (eligibleAccounts.length === 0) {
      // Check if all accounts are just in cooldown (vs disabled)
      const cooldownAccounts = this.accounts.filter((a) => {
        if (a.disabled) return false;
        const { blocked, nextRetry } = isAccountBlockedForModel(a, model || "", now);
        return blocked && nextRetry;
      });

      if (cooldownAccounts.length > 0) {
        // Find the earliest cooldown reset time
        let earliestReset = Infinity;
        for (const acc of cooldownAccounts) {
          const { nextRetry } = isAccountBlockedForModel(acc, model || "", now);
          if (nextRetry && nextRetry < earliestReset) {
            earliestReset = nextRetry;
          }
        }
        const resetIn = Math.ceil((earliestReset - now) / 1000);
        logger.warn(
          `All ${cooldownAccounts.length} account(s) are cooling down for model ${model || "unknown"}. ` +
          `Earliest reset in ${resetIn}s`
        );
      }

      return null;
    }

    // Round-robin selection
    const startIndex = (this.currentAccountIndex[family] || 0) % eligibleAccounts.length;
    let account = eligibleAccounts[startIndex];
    this.currentAccountIndex[family] = (startIndex + 1) % Math.max(eligibleAccounts.length, 1);

    // Check if token is expired or about to expire (5 min buffer)
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes

    if (account.tokens.expiresAt - now < expiryBuffer) {
      try {
        await this.refreshAccount(account.id);
        // Re-fetch the account after refresh
        account = this.accounts.find((a) => a.id === account.id)!;
      } catch {
        // Try next account if refresh fails
        return this.getValidAccessToken(family, model);
      }
    }

    // Update last used
    account.lastUsedAt = now;
    this.save();

    return {
      token: account.tokens.accessToken,
      accountId: account.id,
      // Generate random projectId if account doesn't have one
      // Based on CLIProxyAPI's implementation to avoid 404 errors
      projectId: account.projectId || generateProjectId(),
    };
  }

  /**
   * Mark an account as rate-limited for a specific model.
   */
  markRateLimited(
    accountId: string,
    retryAfterMs: number = 60000,
    model?: string
  ): void {
    const account = this.accounts.find((a) => a.id === accountId);
    if (!account) return;

    const now = Date.now();

    if (model) {
      // Per-model rate limiting with exponential backoff
      if (!account.modelStates) {
        account.modelStates = {};
      }

      const existingState = account.modelStates[model] || {};
      const prevLevel = existingState.backoffLevel || 0;

      // If retryAfterMs wasn't explicitly provided (using default), calculate with backoff
      let cooldown = retryAfterMs;
      let nextLevel = prevLevel;

      if (retryAfterMs === 60000) {
        // Default value - use exponential backoff
        const backoffResult = nextQuotaCooldown(prevLevel);
        cooldown = backoffResult.cooldown;
        nextLevel = backoffResult.nextLevel;
      }

      account.modelStates[model] = {
        unavailable: true,
        nextRetryAfter: now + cooldown,
        backoffLevel: nextLevel,
        lastError: "rate_limited",
      };

      this.save();
      logger.warn(
        `Account ${account.email} rate-limited for model ${model} for ${cooldown / 1000}s ` +
        `(backoff level: ${nextLevel})`
      );
    } else {
      // Fallback: global rate limit (legacy behavior)
      account.rateLimitedUntil = now + retryAfterMs;
      this.save();
      logger.warn(
        `Account ${account.email} rate-limited globally for ${retryAfterMs / 1000}s`
      );
    }
  }

  /**
   * Mark a successful request for an account and model.
   * Resets the per-model rate limit state.
   */
  markSuccess(accountId: string, model?: string): void {
    const account = this.accounts.find((a) => a.id === accountId);
    if (!account) return;

    if (model && account.modelStates && account.modelStates[model]) {
      // Reset the per-model state on success
      account.modelStates[model] = {
        unavailable: false,
        nextRetryAfter: undefined,
        backoffLevel: 0,
        lastError: undefined,
      };
      this.save();
      logger.debug(`Account ${account.email} model ${model} rate limit cleared on success`);
    }

    // Also clear global rate limit if set
    if (account.rateLimitedUntil) {
      account.rateLimitedUntil = undefined;
      this.save();
    }
  }

  /**
   * Clear rate limit state for all accounts
   */
  async clearAllRateLimits(): Promise<void> {
    await this.load();
    for (const account of this.accounts) {
      account.rateLimitedUntil = undefined;
    }
    this.save();
    logger.debug("Cleared rate limits for all accounts");
  }

  /**
   * Mark an account as disabled (e.g., invalid_grant)
   */
  markDisabled(accountId: string, reason: string): void {
    const account = this.accounts.find((a) => a.id === accountId);
    if (account) {
      account.disabled = true;
      account.disabledReason = reason;
      this.save();
      logger.warn(`Account ${account.email} disabled: ${reason}`);
    }
  }

  /**
   * Clear all accounts
   */
  async clearAll(): Promise<void> {
    this.accounts = [];
    this.save();
  }
}

export const tokenStore = new TokenStore();
