#!/usr/bin/env node
import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { accountsCommand } from './commands/accounts.js';
import { codeCommand } from './commands/code.js';
import { proxyCommand } from './commands/proxy.js';

const program = new Command();

program
  .name('agy-tools')
  .description('Use Claude Code with Antigravity account quota')
  .version('0.1.0');

program.addCommand(loginCommand);
program.addCommand(accountsCommand);
program.addCommand(codeCommand);
program.addCommand(proxyCommand);

program.parse();
