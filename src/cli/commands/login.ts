import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { login, saveAccount, getAllAccounts } from '../../auth/index.js';

export const loginCommand = new Command('login')
  .description('Login to Antigravity with Google OAuth')
  .action(async () => {
    const spinner = ora('Starting OAuth flow...').start();

    try {
      spinner.text = 'Waiting for authorization in browser...';

      const { token, userInfo } = await login();

      spinner.text = 'Saving account...';
      const account = saveAccount(token, userInfo.name);

      spinner.succeed(chalk.green(`Logged in as ${account.email}`));

      const accounts = getAllAccounts();
      console.log(chalk.dim(`Total accounts: ${accounts.length}`));
    } catch (error) {
      spinner.fail(chalk.red('Login failed'));
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
