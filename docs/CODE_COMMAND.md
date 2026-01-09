# Code Command

The `code` command allows you to launch coding agents with automatic agy-tools proxy configuration.

## Usage

```bash
agy-tools code <agent> [...args]
```

## Supported Agents

### Claude Code (`claude`)

Launch Claude Code with automatic proxy configuration:

```bash
agy-tools code claude
```

The command will:

1. Check if Claude Code is installed
2. Check if an agy-tools server is already running
   - If yes: Reuse the existing server
   - If no: Start a new server with random port and API key
3. Configure Claude Code with the following environment variables:
   - `ANTHROPIC_AUTH_TOKEN`: Random API key
   - `ANTHROPIC_BASE_URL`: agy-tools proxy URL
   - `ANTHROPIC_DEFAULT_OPUS_MODEL`: claude-opus-4-5-thinking
   - `ANTHROPIC_DEFAULT_SONNET_MODEL`: claude-sonnet-4-5-thinking
   - `ANTHROPIC_DEFAULT_HAIKU_MODEL`: gemini-2.5-flash
4. Launch Claude Code directly

### Passing Arguments to the Agent

You can pass additional arguments to the coding agent:

```bash
agy-tools code claude --help
agy-tools code claude --version
```

## Options

- `-p, --port <port>` - Server port (random if not specified)
- `-H, --host <host>` - Server host (default: 127.0.0.1)
- `-k, --api-key <key>` - API key for authentication (random if not specified)

## Examples

### Use custom port and API key

```bash
agy-tools code claude -p 38080 -k my-secret-key
```

### Use specific host

```bash
agy-tools code claude -H 0.0.0.0 -p 38080
```

## Installation Requirements

Before using the `code` command, make sure you have the required coding agent installed:

- **Claude Code**: <https://github.com/anthropics/claude-cli>

## How It Works

The `code` command creates a seamless workflow:

1. **Agent Detection**: Verifies that the coding agent is installed on your system
2. **Server Management**:
   - Checks for existing agy-tools servers to avoid resource waste
   - Starts a new background server if none exists
   - Uses random ports and API keys for security
3. **Environment Configuration**: Automatically sets all required environment variables
4. **Agent Launch**: Starts the coding agent with proper configuration

This eliminates the need for manual configuration and multiple command executions.
