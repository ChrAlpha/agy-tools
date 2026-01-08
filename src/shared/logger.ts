import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatTimestamp(): string {
  const now = new Date();
  return chalk.gray(
    `[${now.toLocaleTimeString("en-US", { hour12: false })}]`
  );
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (shouldLog("debug")) {
      console.log(
        formatTimestamp(),
        chalk.magenta("[DEBUG]"),
        message,
        ...args
      );
    }
  },

  info(message: string, ...args: unknown[]): void {
    if (shouldLog("info")) {
      console.log(formatTimestamp(), chalk.blue("[INFO]"), message, ...args);
    }
  },

  warn(message: string, ...args: unknown[]): void {
    if (shouldLog("warn")) {
      console.log(formatTimestamp(), chalk.yellow("[WARN]"), message, ...args);
    }
  },

  error(message: string, ...args: unknown[]): void {
    if (shouldLog("error")) {
      console.error(formatTimestamp(), chalk.red("[ERROR]"), message, ...args);
    }
  },

  success(message: string, ...args: unknown[]): void {
    console.log(formatTimestamp(), chalk.green("[OK]"), message, ...args);
  },

  // Plain output without formatting (for CLI output)
  print(message: string): void {
    console.log(message);
  },
};
