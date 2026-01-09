import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  ACCOUNTS_FILE,
  CONFIG_DIR,
  logger,
} from "../../shared/index.js";
import type { Account, AccountIndex, ModelFamily } from "../../shared/index.js";
import { refreshTokens } from "./auth.js";

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

  /**
   * Get a valid access token for the specified model family.
   * Implements round-robin rotation with rate-limit awareness.
   */
  async getValidAccessToken(
    family: ModelFamily
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

    const eligibleAccounts = this.accounts
      .filter(
        (a) =>
          !a.disabled &&
          (!a.rateLimitedUntil || a.rateLimitedUntil < Date.now())
      )
      .sort((a, b) => getTierPriority(a.tier) - getTierPriority(b.tier));

    if (eligibleAccounts.length === 0) {
      return null;
    }

    // Round-robin selection
    const startIndex = this.currentAccountIndex[family] % eligibleAccounts.length;
    let account = eligibleAccounts[startIndex];
    this.currentAccountIndex[family] = (startIndex + 1) % eligibleAccounts.length;

    // Check if token is expired or about to expire (5 min buffer)
    const now = Date.now();
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes

    if (account.tokens.expiresAt - now < expiryBuffer) {
      try {
        await this.refreshAccount(account.id);
        // Re-fetch the account after refresh
        account = this.accounts.find((a) => a.id === account.id)!;
      } catch {
        // Try next account if refresh fails
        return this.getValidAccessToken(family);
      }
    }

    // Update last used
    account.lastUsedAt = now;
    this.save();

    return {
      token: account.tokens.accessToken,
      accountId: account.id,
      projectId: account.projectId || "rising-fact-p41fc", // Fallback default
    };
  }

  /**
   * Mark an account as rate-limited
   */
  markRateLimited(accountId: string, retryAfterMs: number = 60000): void {
    const account = this.accounts.find((a) => a.id === accountId);
    if (account) {
      account.rateLimitedUntil = Date.now() + retryAfterMs;
      this.save();
      logger.warn(
        `Account ${account.email} rate-limited for ${retryAfterMs / 1000}s`
      );
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
