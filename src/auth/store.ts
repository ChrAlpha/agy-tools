import Conf from 'conf';
import crypto from 'node:crypto';
import type { Account, TokenData } from '../types.js';
import { refreshToken } from './oauth.js';

interface StoreSchema {
  accounts: Record<string, Account>;
  activeAccountId: string | null;
}

const store = new Conf<StoreSchema>({
  projectName: 'agy-tools',
  defaults: {
    accounts: {},
    activeAccountId: null,
  },
});

export function getAllAccounts(): Account[] {
  const accounts = store.get('accounts');
  return Object.values(accounts);
}

export function getAccount(id: string): Account | undefined {
  const accounts = store.get('accounts');
  return accounts[id];
}

export function getActiveAccount(): Account | undefined {
  const activeId = store.get('activeAccountId');
  if (!activeId) return undefined;
  return getAccount(activeId);
}

export function setActiveAccount(id: string): void {
  store.set('activeAccountId', id);
}

export function saveAccount(token: TokenData, name?: string): Account {
  const accounts = store.get('accounts');

  // Check if account with same email exists
  const existingAccount = Object.values(accounts).find((a) => a.email === token.email);

  const account: Account = {
    id: existingAccount?.id || crypto.randomUUID(),
    email: token.email,
    name: name || token.email,
    token,
    disabled: false,
    createdAt: existingAccount?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  accounts[account.id] = account;
  store.set('accounts', accounts);

  // Set as active if no active account
  if (!store.get('activeAccountId')) {
    store.set('activeAccountId', account.id);
  }

  return account;
}

export function removeAccount(id: string): boolean {
  const accounts = store.get('accounts');
  if (!accounts[id]) return false;

  delete accounts[id];
  store.set('accounts', accounts);

  // Clear active account if removed
  if (store.get('activeAccountId') === id) {
    const remaining = Object.keys(accounts);
    store.set('activeAccountId', remaining.length > 0 ? remaining[0] : null);
  }

  return true;
}

export function disableAccount(id: string): void {
  const accounts = store.get('accounts');
  if (accounts[id]) {
    accounts[id].disabled = true;
    accounts[id].updatedAt = Date.now();
    store.set('accounts', accounts);
  }
}

export function enableAccount(id: string): void {
  const accounts = store.get('accounts');
  if (accounts[id]) {
    accounts[id].disabled = false;
    accounts[id].updatedAt = Date.now();
    store.set('accounts', accounts);
  }
}

export async function getValidToken(): Promise<{ token: TokenData; accountId: string } | null> {
  const accounts = getAllAccounts().filter((a) => !a.disabled);

  if (accounts.length === 0) return null;

  // Try active account first
  const activeAccount = getActiveAccount();
  if (activeAccount && !activeAccount.disabled) {
    const token = await ensureValidToken(activeAccount);
    if (token) return { token, accountId: activeAccount.id };
  }

  // Try other accounts
  for (const account of accounts) {
    if (account.id === activeAccount?.id) continue;
    const token = await ensureValidToken(account);
    if (token) return { token, accountId: account.id };
  }

  return null;
}

async function ensureValidToken(account: Account): Promise<TokenData | null> {
  const { token } = account;

  // Check if token is expired or about to expire (5 min buffer)
  const expiryBuffer = 5 * 60 * 1000;
  if (token.expiryTimestamp - Date.now() > expiryBuffer) {
    return token;
  }

  // Try to refresh
  try {
    const newToken = await refreshToken(token.refreshToken);
    updateAccountToken(account.id, newToken);
    return newToken;
  } catch (error) {
    console.error(`Failed to refresh token for ${account.email}:`, error);
    disableAccount(account.id);
    return null;
  }
}

function updateAccountToken(id: string, token: TokenData): void {
  const accounts = store.get('accounts');
  if (accounts[id]) {
    accounts[id].token = token;
    accounts[id].updatedAt = Date.now();
    store.set('accounts', accounts);
  }
}

export function getConfigPath(): string {
  return store.path;
}
