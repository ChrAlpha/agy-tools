import { Command } from 'commander';
import chalk from 'chalk';
import {
  getAllAccounts,
  getActiveAccount,
  setActiveAccount,
  removeAccount,
  enableAccount,
  disableAccount,
  getConfigPath,
} from '../../auth/index.js';

export const accountsCommand = new Command('accounts')
  .description('Manage Antigravity accounts')
  .action(() => {
    const accounts = getAllAccounts();
    const activeAccount = getActiveAccount();

    if (accounts.length === 0) {
      console.log(chalk.yellow('No accounts found. Run `agy-tools login` to add one.'));
      return;
    }

    console.log(chalk.bold('\nAntigravity Accounts:\n'));

    for (const account of accounts) {
      const isActive = account.id === activeAccount?.id;
      const status = account.disabled ? chalk.red('[disabled]') : chalk.green('[active]');
      const marker = isActive ? chalk.cyan('→ ') : '  ';

      console.log(`${marker}${account.email} ${status}`);
      console.log(`    ID: ${chalk.dim(account.id)}`);
      console.log(`    Project: ${chalk.dim(account.token.projectId || 'N/A')}`);
      console.log('');
    }

    console.log(chalk.dim(`Config: ${getConfigPath()}`));
  });

accountsCommand
  .command('list')
  .description('List all accounts')
  .action(() => {
    accountsCommand.action(undefined as never);
  });

accountsCommand
  .command('use <email-or-id>')
  .description('Set active account')
  .action((emailOrId: string) => {
    const accounts = getAllAccounts();
    const account = accounts.find(
      (a) => a.email === emailOrId || a.id === emailOrId
    );

    if (!account) {
      console.error(chalk.red(`Account not found: ${emailOrId}`));
      process.exit(1);
    }

    setActiveAccount(account.id);
    console.log(chalk.green(`Active account set to: ${account.email}`));
  });

accountsCommand
  .command('remove <email-or-id>')
  .description('Remove an account')
  .action((emailOrId: string) => {
    const accounts = getAllAccounts();
    const account = accounts.find(
      (a) => a.email === emailOrId || a.id === emailOrId
    );

    if (!account) {
      console.error(chalk.red(`Account not found: ${emailOrId}`));
      process.exit(1);
    }

    removeAccount(account.id);
    console.log(chalk.green(`Account removed: ${account.email}`));
  });

accountsCommand
  .command('enable <email-or-id>')
  .description('Enable a disabled account')
  .action((emailOrId: string) => {
    const accounts = getAllAccounts();
    const account = accounts.find(
      (a) => a.email === emailOrId || a.id === emailOrId
    );

    if (!account) {
      console.error(chalk.red(`Account not found: ${emailOrId}`));
      process.exit(1);
    }

    enableAccount(account.id);
    console.log(chalk.green(`Account enabled: ${account.email}`));
  });

accountsCommand
  .command('disable <email-or-id>')
  .description('Disable an account')
  .action((emailOrId: string) => {
    const accounts = getAllAccounts();
    const account = accounts.find(
      (a) => a.email === emailOrId || a.id === emailOrId
    );

    if (!account) {
      console.error(chalk.red(`Account not found: ${emailOrId}`));
      process.exit(1);
    }

    disableAccount(account.id);
    console.log(chalk.yellow(`Account disabled: ${account.email}`));
  });
