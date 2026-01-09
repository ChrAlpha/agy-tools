# 模型自动降级功能

## 概述

agy-tools 现在支持自动模型降级功能，这个功能借鉴自 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 的 `switch-preview-model` 机制。

当某个稳定模型的配额耗尽时，系统会自动切换到对应的 Preview 模型，确保服务的持续可用性。

## 功能特性

- **自动降级**：检测到 `QUOTA_EXHAUSTED` 错误时自动切换到 Preview 模型
- **可配置**：通过 `proxy.switchPreviewModel` 配置项控制是否启用（默认启用）
- **智能重试**：仅在配额耗尽时降级，常规限流错误会轮换账户
- **支持流式和非流式**：两种请求模式均支持模型降级
- **日志记录**：详细记录降级过程，方便调试

## 支持的模型映射

| 原始模型 | 降级到 |
|---------|--------|
| `gemini-2.5-pro` | `gemini-2.5-pro-preview` |
| `gemini-2.5-flash` | `gemini-2.5-flash-preview` |
| `gemini-2.5-flash-lite` | `gemini-2.5-flash-lite-preview` |
| `gemini-3-pro` | `gemini-3-pro-preview` |
| `gemini-3-pro-low` | `gemini-3-pro-preview` |
| `gemini-3-pro-high` | `gemini-3-pro-preview` |
| `gemini-3-flash` | `gemini-3-flash-preview` |

## 使用方法

### 查看当前配置

```bash
agy-tools config
```

### 启用模型降级（默认已启用）

```bash
agy-tools config set proxy.switchPreviewModel true
```

### 禁用模型降级

```bash
agy-tools config set proxy.switchPreviewModel false
```

## 工作原理

1. **正常请求流程**
   - 使用用户请求的模型（如 `gemini-2.5-pro`）
   - 轮换账户进行请求

2. **遇到配额错误**
   - 检测到 `QUOTA_EXHAUSTED` 或相关配额错误
   - 标记当前账户的该模型为不可用（1小时冷却）
   - 尝试切换到其他账户

3. **所有账户都配额耗尽**
   - 如果启用了 `switchPreviewModel`
   - 自动切换到对应的 Preview 模型
   - 使用相同的账户池重试

4. **响应处理**
   - 成功后记录实际使用的模型
   - 返回响应给客户端

## 实现细节

### 配置结构

```typescript
interface ProxyConfig {
  endpoints: AntigravityEndpoint[];
  defaultEndpoint: AntigravityEndpoint;
  switchPreviewModel: boolean; // 新增：自动降级开关
}
```

### 模型映射表

定义在 `src/shared/constants.ts`：

```typescript
export const MODEL_FALLBACK_MAP: Record<string, string[]> = {
  "gemini-2.5-pro": ["gemini-2.5-pro-preview"],
  "gemini-2.5-flash": ["gemini-2.5-flash-preview"],
  // ...
};
```

### 核心逻辑

在 `ProxyService` 中实现：

```typescript
// 构建模型尝试列表
const modelsToTry = enableFallback 
  ? [model, ...getModelFallbacks(model)]
  : [model];

// 依次尝试每个模型
for (const currentModel of modelsToTry) {
  // 尝试该模型的所有可用账户
  // 如果配额耗尽，继续下一个模型
}
```

## 错误检测

系统会检测以下错误模式来判断是否为配额耗尽：

- HTTP 429 状态码
- 错误消息包含 `QUOTA_EXHAUSTED`
- 错误消息包含 `quota`（不区分大小写）
- 错误消息包含 `exceeded`

## 日志示例

### 配额耗尽并降级

```
[WARN] Quota exhausted for account xxx on model gemini-2.5-pro. Marking and switching...
[INFO] Trying fallback model due to quota exhaustion...
[INFO] Successfully switched to fallback model: gemini-2.5-pro-preview
```

### 禁用降级时

```
[WARN] Quota exhausted for account xxx on model gemini-2.5-pro. Marking and switching...
[ERROR] All models exhausted for gemini-2.5-pro. Tried: gemini-2.5-pro
```

## 与 CLIProxyAPI 的对比

| 特性 | CLIProxyAPI | agy-tools |
|-----|------------|-----------|
| 配置方式 | YAML 配置文件 | JSON 配置 + CLI 命令 |
| 默认状态 | 需手动启用 | 默认启用 |
| 支持模型 | Gemini 系列 | Gemini 系列 |
| 账户轮换 | ✅ | ✅ |
| 流式支持 | ✅ | ✅ |
| 日志记录 | ✅ | ✅ |

## 最佳实践

1. **保持默认启用**：除非有特殊需求，建议保持 `switchPreviewModel` 启用
2. **监控日志**：关注降级日志，了解配额使用情况
3. **多账户配置**：配置多个账户以提高可用性
4. **定期刷新**：使用 `agy-tools accounts refresh` 刷新 Token

## 故障排查

### 降级未生效

1. 检查配置是否启用：`agy-tools config`
2. 确认错误是配额耗尽而非其他错误
3. 查看日志确认降级尝试

### 所有模型都失败

1. 检查账户状态：`agy-tools accounts`
2. 等待配额重置（通常为每日重置）
3. 考虑添加更多账户

## 参考资料

- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
- [Gemini API 配额文档](https://ai.google.dev/pricing)
