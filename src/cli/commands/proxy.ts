import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { ProxyServer } from '../../proxy/index.js';
import { getAllAccounts } from '../../auth/index.js';
import { DEFAULT_PROXY_PORT, DEFAULT_PROXY_HOST } from '../../config.js';

export const proxyCommand = new Command('proxy')
  .description('Start the Claude API proxy server')
  .option('-p, --port <port>', 'Port to listen on', String(DEFAULT_PROXY_PORT))
  .option('-h, --host <host>', 'Host to bind to', DEFAULT_PROXY_HOST)
  .option('-k, --api-key <key>', 'API key for authentication')
  .action(async (options) => {
    const accounts = getAllAccounts().filter((a) => !a.disabled);

    if (accounts.length === 0) {
      console.error(chalk.red('No accounts found. Run `agy-tools login` first.'));
      process.exit(1);
    }

    const spinner = ora('Starting proxy server...').start();

    try {
      const server = new ProxyServer({
        port: parseInt(options.port, 10),
        host: options.host,
        apiKey: options.apiKey,
      });

      await server.start();

      spinner.succeed(chalk.green(`Proxy server running at ${server.getUrl()}`));
      console.log('');
      console.log(chalk.bold('Usage with Claude Code:'));
      console.log(chalk.cyan(`  export ANTHROPIC_BASE_URL=${server.getUrl()}`));
      console.log(chalk.cyan('  export ANTHROPIC_API_KEY=any-key'));
      console.log(chalk.cyan('  claude'));
      console.log('');
      console.log(chalk.dim(`Available accounts: ${accounts.length}`));
      console.log(chalk.dim('Press Ctrl+C to stop'));

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await server.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await server.stop();
        process.exit(0);
      });
    } catch (error) {
      spinner.fail(chalk.red('Failed to start proxy server'));
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
