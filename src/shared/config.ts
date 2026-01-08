import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  CONFIG_DIR,
  CONFIG_FILE,
  DEFAULT_SERVER_CONFIG,
  DEFAULT_PROXY_CONFIG,
} from "./constants.js";
import type { AppConfig } from "./types.js";
import { logger } from "./logger.js";

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function getDefaultConfig(): AppConfig {
  return {
    server: { ...DEFAULT_SERVER_CONFIG },
    proxy: { ...DEFAULT_PROXY_CONFIG },
  };
}

export function loadConfig(): AppConfig {
  ensureConfigDir();

  if (!existsSync(CONFIG_FILE)) {
    const defaultConfig = getDefaultConfig();
    saveConfig(defaultConfig);
    return defaultConfig;
  }

  try {
    const content = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(content) as Partial<AppConfig>;

    // Merge with defaults to ensure all fields exist
    return {
      server: { ...DEFAULT_SERVER_CONFIG, ...parsed.server },
      proxy: { ...DEFAULT_PROXY_CONFIG, ...parsed.proxy },
    };
  } catch (error) {
    logger.warn("Failed to load config, using defaults:", error);
    return getDefaultConfig();
  }
}

export function saveConfig(config: AppConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function updateConfig(updates: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const updated: AppConfig = {
    server: { ...current.server, ...updates.server },
    proxy: { ...current.proxy, ...updates.proxy },
  };
  saveConfig(updated);
  return updated;
}
