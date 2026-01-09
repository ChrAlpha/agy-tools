# agy-tools

Antigravity API 多账户管理与格式转换工具。

## 功能特性

- **多账户轮换** - 支持添加多个 Google 账户，自动负载均衡和 Token 刷新
- **全格式支持** - 同时暴露 OpenAI Chat、OpenAI Responses、Claude Messages 等 API 格式
- **Thinking 智能支持** - 完整支持 Claude/Gemini thinking blocks，自动处理签名缓存和多轮对话
- **Coding Agent 集成** - 一键启动并自动配置 Claude Code 等开发助手

## 安装

```bash
# 使用 pnpm (推荐)
pnpm add -g agy-tools

# 或使用 npm
npm install -g agy-tools
```

## 快速开始

### 1. 登录账户

```bash
agy-tools login
```

这会启动 OAuth 流程进行 Google 认证。你可以多次运行该命令来添加多个账户，`agy-tools` 会在请求时自动轮换。

### 2. 启动服务

```bash
agy-tools start
```

默认监听 `http://127.0.0.1:38080`。

### 3. 配置客户端

将你的 AI 客户端（如 Alma 等）的 API Base URL 指向本地代理：

```text
http://127.0.0.1:38080/v1
```

---

## Coding Agent 一键集成 (推荐)

如果你使用 **Claude Code**，可以直接通过 `agy-tools` 启动，它会自动完成所有配置：

```bash
agy-tools code claude
```

这将自动启动一个临时的代理服务器，并在配置好环境变量（Auth Token, Base URL, Model Mappings）后启动 `claude` 命令行工具。

---

## 支持的模型

### Claude 系列 (Antigravity 增强)

- `claude-sonnet-4-5`
- `claude-sonnet-4-5-thinking` (提供 `-low` / `-high` 变体控制预算)
- `claude-opus-4-5-thinking` (提供 `-low` / `-high` 变体控制预算)

### Gemini 系列

- `gemini-2.5-pro` / `gemini-2.5-flash`
- `gemini-2.5-flash-lite`
- `gemini-2.5-flash-thinking`
- `gemini-3-pro` (提供 `-low` / `-high` 变体)
- `gemini-3-flash`

---

## API 端点

| 端点 | 格式 | 说明 |
| --- | --- | --- |
| `POST /v1/chat/completions` | OpenAI Chat | 绝大多数客户端通用 |
| `POST /v1/responses` | OpenAI Responses | 支持原生的 `reasoning.effort` |
| `POST /v1/messages` | Claude | 完全兼容 Anthropic 协议 |
| `GET /v1/models` | OpenAI | 获取可用模型列表 |
| `GET /health` | - | 健康检查 |

---

## CLI 命令详解

### 服务器

- `agy-tools start`: 启动代理服务器
  - `--port`: 指定端口 (默认 38080)
  - `--host`: 指定主机 (默认 127.0.0.1)
  - `--api-key`: 设置认证密钥

### 账户管理

- `agy-tools login`: 登录新账户
- `agy-tools accounts [ls]`: 列出所有账户
- `agy-tools accounts remove <id>`: 移除指定账户
- `agy-tools accounts refresh`: 强制刷新所有 Token

### 配置

- `agy-tools config`: 查看当前配置
- `agy-tools config set <key> <value>`: 修改配置项
- `agy-tools config reset`: 恢复默认配置

### 工具

- `agy-tools models`: 查看支持的模型详细信息
- `agy-tools code <agent>`: 启动 Coding Agent (目前支持 `claude`)

---

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
```

## License

MIT

## 致谢

- [alma-plugin / antigravity-auth](https://github.com/yetone/alma-plugins/tree/main/plugins/antigravity-auth)
- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
