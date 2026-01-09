import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import {
  registry,
  createStreamContext,
  restoreThinkingSignatures,
  cacheThinkingSignaturesFromResponse,
  ensureToolIds,
  generateStableSessionId,
  type InputFormat,
  type TranslateOptions,
  type StreamTranslateOptions,
} from "../translator/index.js";
import { AntigravityClient } from "./AntigravityClient.js";
import { AccountManager } from "./AccountManager.js";
import { logger } from "../../shared/logger.js";
import { parseRetryDelay } from "../utils/errorParser.js";
import { loadConfig } from "../../shared/config.js";
import { getModelFallbacks } from "../../shared/constants.js";

/**
 * 生成请求 ID
 */
function generateRequestId(): string {
  return `chatcmpl-${Date.now()}`;
}

export class ProxyService {
  private client: AntigravityClient;
  private accountManager: AccountManager;

  constructor() {
    this.client = new AntigravityClient();
    this.accountManager = new AccountManager();
  }

  /**
   * 准备请求 options 和转换后的请求
   */
  private prepareRequest(body: any, format: InputFormat, stream: boolean) {
    const requestId = generateRequestId();

    // 获取 translator
    const requestTranslator = registry.getRequestTranslator(format);
    const responseTranslator = registry.getResponseTranslator(format);

    // 转换请求
    const options: TranslateOptions = {
      model: "",
      requestId,
      sessionId: "", // 稍后设置
      stream,
      originalRequest: body,
    };

    const translateResult = requestTranslator.toGemini(body, options);
    let geminiRequest = translateResult.request;
    const model = translateResult.model;

    // 生成稳定的 sessionId
    const sessionId = generateStableSessionId(geminiRequest.contents || []);

    // 更新 options 和 request 中的 sessionId
    options.model = model;
    options.sessionId = sessionId;
    geminiRequest.sessionId = sessionId;

    // 处理 thinking 签名恢复
    if (geminiRequest.contents) {
      geminiRequest = {
        ...geminiRequest,
        contents: restoreThinkingSignatures(geminiRequest.contents, sessionId),
      };
      // 确保工具 ID 匹配
      geminiRequest.contents = ensureToolIds(geminiRequest.contents);
    }

    return { geminiRequest, model, options, sessionId, responseTranslator };
  }

  /**
   * 处理非流式请求
   * Uses model-aware account selection and tracks success/failure per model.
   * Supports automatic model fallback when quota is exceeded.
   */
  async handleRequest(
    body: unknown,
    format: InputFormat = "openai-chat"
  ): Promise<unknown> {
    const { geminiRequest, model, options, sessionId, responseTranslator } =
      this.prepareRequest(body, format, false);

    // Check if model fallback is enabled
    const config = loadConfig();
    const enableFallback = config.proxy.switchPreviewModel;

    // Build model attempt list: [original, ...fallbacks]
    const modelsToTry = enableFallback
      ? [model, ...getModelFallbacks(model)]
      : [model];

    logger.debug(`Models to try: ${modelsToTry.join(" -> ")}`);

    let lastError: Error | null = null;

    // Try each model in the fallback chain
    for (const currentModel of modelsToTry) {
      // 获取有效 token (now with model-aware filtering)
      let accountInfo = await this.accountManager.getAccessToken("gemini", currentModel);
      if (!accountInfo) {
        logger.warn(`No available accounts/tokens for model ${currentModel}, trying next...`);
        continue;
      }

      let geminiResponse;
      const maxRetries = this.accountManager.getAccountCount() * 2;
      let attempts = 0;
      let quotaExhausted = false;

      while (attempts < maxRetries) {
        attempts++;
        const { token, projectId, accountId } = accountInfo;

        try {
          // 调用 API (use current model in fallback chain)
          geminiResponse = await this.client.generateContent(
            currentModel,
            geminiRequest,
            token,
            projectId
          );

          // Mark success to reset backoff level for this model
          this.accountManager.markSuccess(accountId, currentModel);

          // Log if we switched to a fallback model
          if (currentModel !== model) {
            logger.info(`Successfully switched to fallback model: ${currentModel}`);
          }

          break; // Success
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          lastError = error;

          // Check for 429 Rate Limit
          if (
            error.message.includes("429") ||
            error.message.includes("RESOURCE_EXHAUSTED")
          ) {
            // Parse retry delay first (used for both quota and rate limit)
            const retryDelay = parseRetryDelay(error.message);

            // Check if it's quota exhausted specifically (not just rate limit)
            // Note: "Resource has been exhausted" is the generic rate limit message,
            // only match explicit QUOTA mentions for actual quota exhaustion
            const isQuotaExhausted =
              error.message.includes("QUOTA_EXHAUSTED") ||
              error.message.toUpperCase().includes("QUOTA");

            if (isQuotaExhausted) {
              logger.warn(
                `Quota exhausted for account ${accountId} on model ${currentModel}. Marking and switching...`
              );
              quotaExhausted = true;

              // Mark this model as quota exhausted with 1 hour cooldown (or longer if specified)
              this.accountManager.markRateLimited(accountId, Math.max(retryDelay || 0, 3600000), currentModel);
            } else {
              logger.warn(
                `Rate limit encountered for account ${accountId} on model ${currentModel}. Switching account...`
              );
              // Use parsed retry delay or exponential backoff (60s default triggers backoff)
              this.accountManager.markRateLimited(accountId, retryDelay || 60000, currentModel);
            }

            // Try to get next account (model-aware)
            accountInfo = await this.accountManager.getAccessToken("gemini", currentModel);
            if (!accountInfo) {
              logger.warn(`No more available accounts for model ${currentModel}`);
              break; // Move to next fallback model
            }
            continue; // Retry with new account
          }

          throw error; // Other errors
        }
      }

      if (geminiResponse) {
        // Success! Cache thinking signatures and return
        cacheThinkingSignaturesFromResponse(geminiResponse, sessionId);

        // Update options with actual model used
        options.model = currentModel;

        return responseTranslator.fromGemini(geminiResponse, options);
      }

      // If quota exhausted, try next model in fallback chain
      if (quotaExhausted && currentModel !== modelsToTry[modelsToTry.length - 1]) {
        logger.info(`Trying fallback model due to quota exhaustion...`);
        continue;
      }
    }

    // All models failed
    logger.error(`All models exhausted for ${model}. Original: ${model}, Tried: ${modelsToTry.join(", ")}`);
    throw lastError || new Error(`Failed to generate content for model ${model} after trying all fallbacks`);
  }

  /**
   * 处理流式请求
   * Uses model-aware account selection and tracks success/failure per model.
   * Supports automatic model fallback when quota is exceeded.
   */
  async handleStreamRequest(
    c: Context,
    body: unknown,
    format: InputFormat = "openai-chat"
  ): Promise<Response> {
    const { geminiRequest, model, options, sessionId, responseTranslator } =
      this.prepareRequest(body, format, true);

    // Check if model fallback is enabled
    const config = loadConfig();
    const enableFallback = config.proxy.switchPreviewModel;

    // Build model attempt list: [original, ...fallbacks]
    const modelsToTry = enableFallback
      ? [model, ...getModelFallbacks(model)]
      : [model];

    logger.debug(`Stream models to try: ${modelsToTry.join(" -> ")}`);

    // 创建流式上下文
    const streamContext = createStreamContext();
    const streamOptions: StreamTranslateOptions = {
      ...options,
      context: streamContext,
    };

    return streamSSE(c, async (stream) => {
      let lastError: Error | null = null;

      // Try each model in the fallback chain
      for (const currentModel of modelsToTry) {
        // 获取有效 token (now with model-aware filtering)
        let accountInfo = await this.accountManager.getAccessToken("gemini", currentModel);
        if (!accountInfo) {
          logger.warn(`No available accounts/tokens for model ${currentModel}, trying next...`);
          continue;
        }

        const maxRetries = this.accountManager.getAccountCount() * 2;
        let attempts = 0;
        let quotaExhausted = false;
        let streamSuccess = false;

        while (attempts < maxRetries) {
          attempts++;
          if (!accountInfo) break;
          const { token, projectId, accountId } = accountInfo;

          try {
            const geminiStream = this.client.streamGenerateContent(
              currentModel,
              geminiRequest,
              token,
              projectId
            );

            for await (const chunk of geminiStream) {
              // 缓存 thinking 签名
              cacheThinkingSignaturesFromResponse(chunk, sessionId);

              // 转换响应 chunk (use current model)
              streamOptions.model = currentModel;
              const sseChunks = responseTranslator.fromGeminiStream(
                chunk,
                streamOptions
              );

              for (const sseChunk of sseChunks) {
                // 修复正则解析逻辑，使其兼容 OpenAI 和 Claude 格式
                const lines = sseChunk.split("\n");
                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr) {
                      await stream.writeSSE({ data: dataStr });
                    }
                  }
                }
              }
            }

            // 发送完成信号
            const finishChunks = responseTranslator.finishStream(streamOptions);
            for (const chunk of finishChunks) {
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const dataStr = line.slice(6).trim();
                  if (dataStr) {
                    await stream.writeSSE({ data: dataStr });
                  }
                }
              }
            }

            // Mark success to reset backoff level for this model
            this.accountManager.markSuccess(accountId, currentModel);

            // Log if we switched to a fallback model
            if (currentModel !== model) {
              logger.info(`Successfully switched to fallback model (stream): ${currentModel}`);
            }

            streamSuccess = true;
            break; // Success
          } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            lastError = error;

            // Check for 429 Rate Limit
            if (
              error.message.includes("429") ||
              error.message.includes("RESOURCE_EXHAUSTED")
            ) {
              // Parse retry delay first (used for both quota and rate limit)
              const retryDelay = parseRetryDelay(error.message);

              // Check if it's quota exhausted specifically
              // Note: "Resource has been exhausted" is the generic rate limit message,
              // only match explicit QUOTA mentions for actual quota exhaustion
              const isQuotaExhausted =
                error.message.includes("QUOTA_EXHAUSTED") ||
                error.message.toUpperCase().includes("QUOTA");

              if (isQuotaExhausted) {
                logger.warn(
                  `Quota exhausted (stream) for account ${accountId} on model ${currentModel}. Marking and switching...`
                );
                quotaExhausted = true;
                // Mark this model as quota exhausted with 1 hour cooldown (or longer if specified)
                this.accountManager.markRateLimited(accountId, Math.max(retryDelay || 0, 3600000), currentModel);
              } else {
                logger.warn(
                  `Rate limit encountered (stream) for account ${accountId} on model ${currentModel}. Switching account...`
                );
                // Use parsed retry delay or exponential backoff (60s default triggers backoff)
                this.accountManager.markRateLimited(accountId, retryDelay || 60000, currentModel);
              }

              // Try to get next account (model-aware)
              accountInfo = await this.accountManager.getAccessToken("gemini", currentModel);
              if (!accountInfo) {
                logger.warn(`No more available accounts for model ${currentModel}`);
                break; // Move to next fallback model
              }
              continue; // Retry with new account
            }

            logger.error(error.message, "Stream error");
            throw error; // Other errors - will be caught by outer handler
          }
        }

        if (streamSuccess) {
          return; // Stream completed successfully
        }

        // If quota exhausted, try next model in fallback chain
        if (quotaExhausted && currentModel !== modelsToTry[modelsToTry.length - 1]) {
          logger.info(`Trying fallback model (stream) due to quota exhaustion...`);
          continue;
        }
      }

      // All models failed
      logger.error(`All models exhausted (stream) for ${model}. Tried: ${modelsToTry.join(", ")}`);
      throw lastError || new Error(`Failed to stream content for model ${model} after trying all fallbacks`);
    });
  }

  /**
   * 处理请求 (自动检测 format)
   *
   * @deprecated 使用 handleRequest 或 handleStreamRequest 并明确指定 format
   */
  async handleLegacyRequest(body: unknown): Promise<unknown> {
    // 保持向后兼容
    const request = body as { stream?: boolean };
    if (request.stream) {
      throw new Error(
        "Streaming not supported in legacy mode, use handleStreamRequest"
      );
    }
    return this.handleRequest(body, "openai-chat");
  }
}
