# agy-tools

Antigravity API 反向代理工具，支持多账户管理和多种 API 格式转换。

## 功能特性

- **多账户管理** - 支持添加多个 Google 账户，自动轮换和 Token 刷新
- **多 API 格式** - 同时暴露 OpenAI Chat、OpenAI Responses、Claude Messages 等 API 格式
- **Thinking 模式支持** - 完整支持 Claude thinking blocks 和签名缓存
- **流式响应** - 支持 SSE 流式输出，兼容各客户端
- **本地代理** - 在本地运行，无需部署服务器

## 安装

```bash
# 使用 pnpm (推荐)
pnpm add -g agy-tools

# 或使用 npm
npm install -g agy-tools
```

## 快速开始

### 1. 登录 Google 账户

```bash
agy-tools login
```

这会打开浏览器进行 Google OAuth 认证，授权后账户信息会保存到本地。

### 2. 启动代理服务器

```bash
agy-tools start
```

默认监听 `http://127.0.0.1:38080`。

### 3. 配置客户端

将你的 AI 客户端（如 Cursor、Continue 等）的 API Base URL 指向本地代理：

```text
http://127.0.0.1:38080/v1
```

## API 端点

| 端点                          | 格式             | 说明                                      |
| ----------------------------- | ---------------- | ----------------------------------------- |
| `POST /v1/chat/completions`   | OpenAI Chat      | 兼容 OpenAI Chat Completions API          |
| `POST /v1/responses`          | OpenAI Responses | 兼容 OpenAI Responses API (支持 reasoning) |
| `POST /v1/messages`           | Claude           | 兼容 Anthropic Claude Messages API        |
| `GET /v1/models`              | -                | 获取可用模型列表                          |
| `GET /health`                 | -                | 健康检查                                  |

## 支持的模型

### Claude 系列

- `claude-sonnet-4-5` - Claude Sonnet 4.5
- `claude-sonnet-4-5-thinking` - Claude Sonnet 4.5 (Thinking, medium budget)
- `claude-sonnet-4-5-thinking-high` - Claude Sonnet 4.5 (Thinking, high budget)
- `claude-sonnet-4-5-thinking-low` - Claude Sonnet 4.5 (Thinking, low budget)
- `claude-opus-4-5-thinking` - Claude Opus 4.5 (Thinking)
- `claude-opus-4-5-thinking-high` - Claude Opus 4.5 (Thinking, high budget)

### Gemini 系列

- `gemini-2.5-pro` - Gemini 2.5 Pro
- `gemini-2.5-flash` - Gemini 2.5 Flash
- `gemini-3-pro` - Gemini 3 Pro
- `gemini-3-flash` - Gemini 3 Flash

## CLI 命令

```bash
agy-tools --help
```

### 服务器

```bash
# 启动代理服务器
agy-tools start

# 指定端口和主机
agy-tools start --port 3000 --host 0.0.0.0

# 设置 API Key 认证
agy-tools start --api-key your-secret-key
```

### 账户管理

```bash
# 登录新账户
agy-tools login

# 列出所有账户
agy-tools accounts
agy-tools ls

# 移除账户
agy-tools accounts remove <account-id>

# 刷新账户 Token
agy-tools accounts refresh [account-id]
```

### 配置

```bash
# 查看当前配置
agy-tools config

# 设置配置项
agy-tools config set <key> <value>

# 重置为默认配置
agy-tools config reset
```

### 模型

```bash
# 列出所有可用模型
agy-tools models
```

## 配置文件

配置文件存储在 `~/.agy-tools/` 目录：

```text
~/.agy-tools/
├── accounts.json  # 账户信息
└── config.json    # 配置信息
```

## Thinking 模式

对于 Claude thinking 模型，支持以下特性：

- **Thinking Budget** - 通过模型名称后缀控制 (low/medium/high)
- **Signature 缓存** - 自动缓存 thinking block 签名，支持多轮对话
- **OpenAI Responses API** - 通过 `reasoning.effort` 参数控制 thinking level

### 使用示例

**OpenAI Chat API:**

```json
{
  "model": "claude-sonnet-4-5-thinking-high",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true
}
```

**OpenAI Responses API:**

```json
{
  "model": "claude-sonnet-4-5-thinking",
  "input": "Solve this problem step by step",
  "reasoning": {"effort": "high"}
}
```

**Claude Messages API:**

```json
{
  "model": "claude-sonnet-4-5-thinking",
  "messages": [{"role": "user", "content": "Think carefully"}],
  "thinking": {"type": "enabled", "budget_tokens": 16384}
}
```

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 运行测试
pnpm test

# 测试覆盖率
pnpm test:coverage

# 类型检查
pnpm typecheck
```

## 技术架构

```text
┌─────────────────────────────────────────────────────┐
│                    agy-tools                        │
├─────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ OpenAI Chat │  │  Responses  │  │   Claude    │  │
│  │    API      │  │    API      │  │ Messages API│  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
│         │                │                │         │
│         └────────────────┼────────────────┘         │
│                          ▼                          │
│              ┌───────────────────────┐              │
│              │  Translator Registry  │              │
│              │  (Format Conversion)  │              │
│              └───────────┬───────────┘              │
│                          ▼                          │
│              ┌───────────────────────┐              │
│              │    Proxy Service      │              │
│              │  (Account Rotation)   │              │
│              └───────────┬───────────┘              │
│                          ▼                          │
│              ┌───────────────────────┐              │
│              │   Antigravity API     │              │
│              │   (Gemini Backend)    │              │
│              └───────────────────────┘              │
└─────────────────────────────────────────────────────┘
```

## License

MIT
