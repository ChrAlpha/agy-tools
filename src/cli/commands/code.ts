import { Command } from 'commander';
import { spawn } from 'node:child_process';
import ora from 'ora';
import chalk from 'chalk';
import { ProxyServer } from '../../proxy/index.js';
import { getAllAccounts } from '../../auth/index.js';
import { DEFAULT_PROXY_PORT, DEFAULT_PROXY_HOST } from '../../config.js';

export const codeCommand = new Command('code')
  .description('Start proxy and launch AI coding tool')
  .argument('[tool]', 'Tool to launch (claude, cursor, etc.)', 'claude')
  .option('-p, --port <port>', 'Proxy port', String(DEFAULT_PROXY_PORT))
  .option('-m, --model <model>', 'Model to use', 'claude-sonnet-4')
  .option('--no-launch', 'Only start proxy, do not launch tool')
  .action(async (tool: string, options) => {
    const accounts = getAllAccounts().filter((a) => !a.disabled);

    if (accounts.length === 0) {
      console.error(chalk.red('No accounts found. Run `agy-tools login` first.'));
      process.exit(1);
    }

    const port = parseInt(options.port, 10);
    const proxyUrl = `http://${DEFAULT_PROXY_HOST}:${port}`;

    const spinner = ora('Starting proxy server...').start();

    const server = new ProxyServer({
      port,
      host: DEFAULT_PROXY_HOST,
    });

    try {
      await server.start();
      spinner.succeed(chalk.green(`Proxy running at ${proxyUrl}`));
    } catch (error) {
      spinner.fail(chalk.red('Failed to start proxy'));
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }

    if (!options.launch) {
      console.log('');
      console.log(chalk.bold('Proxy ready. Set these environment variables:'));
      console.log(chalk.cyan(`  export ANTHROPIC_BASE_URL=${proxyUrl}`));
      console.log(chalk.cyan('  export ANTHROPIC_API_KEY=agy-tools'));
      console.log('');
      console.log(chalk.dim('Press Ctrl+C to stop'));

      process.on('SIGINT', async () => {
        await server.stop();
        process.exit(0);
      });
      return;
    }

    // Launch the specified tool
    console.log('');
    console.log(chalk.bold(`Launching ${tool}...`));

    const env = {
      ...process.env,
      ANTHROPIC_BASE_URL: proxyUrl,
      ANTHROPIC_API_KEY: 'agy-tools',
    };

    let command: string;
    let args: string[] = [];

    switch (tool.toLowerCase()) {
      case 'claude':
      case 'claude-code':
        command = 'claude';
        break;
      case 'cursor':
        command = 'cursor';
        break;
      case 'code':
      case 'vscode':
        command = 'code';
        break;
      default:
        command = tool;
    }

    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
      shell: true,
    });

    child.on('error', (error) => {
      console.error(chalk.red(`Failed to launch ${tool}: ${error.message}`));
      console.log('');
      console.log(chalk.yellow('Make sure the tool is installed and in your PATH.'));
      console.log(chalk.dim('The proxy is still running. Press Ctrl+C to stop.'));
    });

    child.on('exit', async (code) => {
      console.log('');
      console.log(chalk.dim(`${tool} exited with code ${code}`));
      await server.stop();
      process.exit(code || 0);
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      child.kill('SIGINT');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      child.kill('SIGTERM');
      await server.stop();
      process.exit(0);
    });
  });
