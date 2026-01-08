import chalk from "chalk";
import { logger, loadConfig, saveConfig, updateConfig } from "../../shared/index.js";
import type { AppConfig } from "../../shared/index.js";
import {
  DEFAULT_SERVER_CONFIG,
  DEFAULT_PROXY_CONFIG,
} from "../../shared/index.js";

export const configCommand = {
  show(): void {
    const config = loadConfig();

    logger.print(chalk.bold("\nCurrent Configuration:\n"));
    logger.print(chalk.cyan("Server:"));
    logger.print(`  host: ${config.server.host}`);
    logger.print(`  port: ${config.server.port}`);
    logger.print(`  apiKey: ${config.server.apiKey ? "***" : "(not set)"}`);

    logger.print(chalk.cyan("\nProxy:"));
    logger.print(`  defaultEndpoint: ${config.proxy.defaultEndpoint}`);
    logger.print(`  endpoints: ${config.proxy.endpoints.join(", ")}`);
    logger.print("");
  },

  set(key: string, value: string): void {
    const config = loadConfig();

    // Parse key path (e.g., "server.port")
    const parts = key.split(".");

    if (parts.length !== 2) {
      logger.error(`Invalid key format. Use: section.key (e.g., server.port)`);
      process.exit(1);
    }

    const [section, field] = parts;

    if (section !== "server" && section !== "proxy") {
      logger.error(`Unknown section: ${section}. Use 'server' or 'proxy'.`);
      process.exit(1);
    }

    // Type-safe update
    const updates: Partial<AppConfig> = {};

    if (section === "server") {
      if (field === "port") {
        const port = parseInt(value, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          logger.error("Port must be a number between 1 and 65535");
          process.exit(1);
        }
        updates.server = { ...config.server, port };
      } else if (field === "host") {
        updates.server = { ...config.server, host: value };
      } else if (field === "apiKey") {
        updates.server = { ...config.server, apiKey: value || undefined };
      } else {
        logger.error(`Unknown server field: ${field}`);
        process.exit(1);
      }
    } else if (section === "proxy") {
      if (field === "defaultEndpoint") {
        if (!["daily", "autopush", "prod"].includes(value)) {
          logger.error("Endpoint must be: daily, autopush, or prod");
          process.exit(1);
        }
        updates.proxy = {
          ...config.proxy,
          defaultEndpoint: value as "daily" | "autopush" | "prod",
        };
      } else {
        logger.error(`Unknown proxy field: ${field}`);
        process.exit(1);
      }
    }

    updateConfig(updates);
    logger.success(`Set ${key} = ${value}`);
  },

  reset(): void {
    const defaultConfig: AppConfig = {
      server: { ...DEFAULT_SERVER_CONFIG },
      proxy: { ...DEFAULT_PROXY_CONFIG },
    };

    saveConfig(defaultConfig);
    logger.success("Configuration reset to defaults");
  },
};
