import chalk from "chalk";
import { execSync, spawn } from "child_process";
import { randomBytes } from "crypto";
import { logger } from "../../shared/logger.js";
import { tokenStore } from "../../server/services/tokenStore.js";
import { loginCommand } from "./login.js";

// 支持的 coding agents
const SUPPORTED_AGENTS = {
    claude: {
        name: "Claude Code",
        executable: "claude",
        checkCommand: "claude --version",
        envVars: (apiKey: string, baseUrl: string) => ({
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ANTHROPIC_BASE_URL: baseUrl,
            ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-5-thinking",
            ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-5-thinking",
            ANTHROPIC_DEFAULT_HAIKU_MODEL: "gemini-2.5-flash",
        }),
    },
} as const;

type AgentType = keyof typeof SUPPORTED_AGENTS;

interface CodeOptions {
    port?: number;
    host?: string;
    apiKey?: string;
}

/**
 * 生成随机的 API Key
 */
function generateRandomKey(): string {
    return `sk-${randomBytes(32).toString("hex")}`;
}

/**
 * 查找一个可用的随机端口
 */
function getRandomPort(): number {
    // 使用 38000-39000 范围
    return Math.floor(Math.random() * 1000) + 38000;
}

/**
 * 检查是否已经安装了指定的 coding agent
 */
function checkAgentInstalled(agentType: AgentType): boolean {
    const agent = SUPPORTED_AGENTS[agentType];
    try {
        execSync(agent.checkCommand, { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

/**
 * 检查是否有正在运行的 agy-tools server
 */
async function checkServerRunning(
    host: string,
    port: number
): Promise<{ running: boolean; apiKey?: string }> {
    try {
        const response = await fetch(`http://${host}:${port}/v1/models`, {
            method: "GET",
        });

        if (response.ok) {
            // Server is running, try to extract API key from process
            // This is a simplified approach - in production you might want to store this in a config file
            return { running: true };
        }
    } catch {
        // Server not running or not accessible
    }

    return { running: false };
}

/**
 * 启动一个新的 agy-tools server 作为后台进程
 */
async function startBackgroundServer(
    host: string,
    port: number,
    apiKey: string
): Promise<void> {
    logger.info(
        `Starting agy-tools server in background on ${host}:${port}...`
    );

    // Load accounts first
    await tokenStore.load();
    if (tokenStore.getAccounts().length === 0) {
        logger.info("No accounts found. Starting login flow...");
        await loginCommand();
    }

    // Start server in a detached background process
    const child = spawn(
        process.argv[0],
        [
            process.argv[1],
            "start",
            "--port",
            port.toString(),
            "--host",
            host,
            "--api-key",
            apiKey,
        ],
        {
            detached: true,
            stdio: "ignore",
        }
    );

    child.unref();

    // Wait a bit to ensure server starts
    await new Promise((resolve) => setTimeout(resolve, 2000));

    logger.info(chalk.green("✓ Background server started successfully"));
}

/**
 * 启动指定的 coding agent 并配置环境变量
 */
function launchAgent(
    agentType: AgentType,
    apiKey: string,
    baseUrl: string,
    args: string[]
): void {
    const agent = SUPPORTED_AGENTS[agentType];
    const envVars = agent.envVars(apiKey, baseUrl);

    logger.info(chalk.bold(`\nLaunching ${agent.name}...`));
    logger.info(chalk.gray(`Configuration:`));
    logger.info(chalk.gray(`  Base URL: ${baseUrl}`));
    logger.info(
        chalk.gray(`  Opus Model: ${envVars.ANTHROPIC_DEFAULT_OPUS_MODEL}`)
    );
    logger.info(
        chalk.gray(`  Sonnet Model: ${envVars.ANTHROPIC_DEFAULT_SONNET_MODEL}`)
    );
    logger.info(
        chalk.gray(`  Haiku Model: ${envVars.ANTHROPIC_DEFAULT_HAIKU_MODEL}`)
    );
    logger.print("");

    // Launch the agent with environment variables
    const child = spawn(agent.executable, args, {
        env: { ...process.env, ...envVars },
        stdio: "inherit",
    });

    child.on("exit", (code) => {
        if (code !== 0) {
            logger.error(`${agent.name} exited with code ${code}`);
            process.exit(code || 1);
        }
    });
}

/**
 * Code command - 启动 coding agent 并自动配置 agy-tools server
 */
export async function codeCommand(
    agentType: string,
    args: string[],
    options: CodeOptions
): Promise<void> {
    // Validate agent type
    if (!Object.keys(SUPPORTED_AGENTS).includes(agentType)) {
        logger.error(
            `Unsupported agent: ${agentType}. Supported agents: ${Object.keys(SUPPORTED_AGENTS).join(", ")}`
        );
        process.exit(1);
    }

    const agent = agentType as AgentType;

    // Step 1: Check if agent is installed
    logger.info(`Checking if ${SUPPORTED_AGENTS[agent].name} is installed...`);
    if (!checkAgentInstalled(agent)) {
        logger.error(
            chalk.red(
                `${SUPPORTED_AGENTS[agent].name} is not installed. Please install it first.`
            )
        );
        logger.info(
            chalk.gray(
                `\nTo install Claude Code, visit: https://github.com/anthropics/claude-cli`
            )
        );
        process.exit(1);
    }
    logger.info(chalk.green(`✓ ${SUPPORTED_AGENTS[agent].name} is installed`));

    // Step 2: Determine server configuration
    let host = options.host || "127.0.0.1";
    let port = options.port || getRandomPort();
    let apiKey = options.apiKey || generateRandomKey();

    // Check if server is already running
    const serverStatus = await checkServerRunning(host, port);

    if (serverStatus.running) {
        logger.info(
            chalk.green(
                `✓ Found running agy-tools server on ${host}:${port}, reusing it`
            )
        );
        if (serverStatus.apiKey) {
            apiKey = serverStatus.apiKey;
        }
    } else {
        // No server running, start a new one
        logger.info("No running server found, starting a new one...");
        await startBackgroundServer(host, port, apiKey);
    }

    // Step 3: Launch the coding agent with configured environment
    const baseUrl = `http://${host}:${port}`;
    launchAgent(agent, apiKey, baseUrl, args);
}
