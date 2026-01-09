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
   */
  async handleRequest(
    body: unknown,
    format: InputFormat = "openai-chat"
  ): Promise<unknown> {
    const { geminiRequest, model, options, sessionId, responseTranslator } =
      this.prepareRequest(body, format, false);

    // 获取有效 token
    let accountInfo = await this.accountManager.getAccessToken();
    if (!accountInfo) {
      throw new Error("No available accounts/tokens");
    }

    let geminiResponse;
    const maxRetries = this.accountManager.getAccountCount() * 2;
    let attempts = 0;

    while (attempts < maxRetries) {
      attempts++;
      const { token, projectId, accountId } = accountInfo;

      try {
        // 调用 API
        geminiResponse = await this.client.generateContent(
          model,
          geminiRequest,
          token,
          projectId
        );
        break; // Success
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Check for 429 Rate Limit
        if (
          error.message.includes("429") ||
          error.message.includes("RESOURCE_EXHAUSTED")
        ) {
          logger.warn(
            `Rate limit encountered for account ${accountId}. Switching account...`
          );

          // Parse actual retry delay if available, otherwise default to 1 min
          const retryDelay = parseRetryDelay(error.message) || 60000;
          this.accountManager.markRateLimited(accountId, retryDelay);

          // Try to get next account
          accountInfo = await this.accountManager.getAccessToken();
          if (!accountInfo) {
            throw new Error("No more available accounts after rate limit");
          }
          continue; // Retry with new account
        }

        throw error; // Other errors
      }
    }

    if (!geminiResponse) {
      throw new Error("Failed to generate content after retries");
    }

    // 缓存 thinking 签名
    cacheThinkingSignaturesFromResponse(geminiResponse, sessionId);

    // 转换响应
    return responseTranslator.fromGemini(geminiResponse, options);
  }

  /**
   * 处理流式请求
   */
  async handleStreamRequest(
    c: Context,
    body: unknown,
    format: InputFormat = "openai-chat"
  ): Promise<Response> {
    const { geminiRequest, model, options, sessionId, responseTranslator } =
      this.prepareRequest(body, format, true);

    // 获取有效 token
    let accountInfo = await this.accountManager.getAccessToken();
    if (!accountInfo) {
      throw new Error("No available accounts/tokens");
    }

    // 创建流式上下文
    const streamContext = createStreamContext();
    const streamOptions: StreamTranslateOptions = {
      ...options,
      context: streamContext,
    };

    return streamSSE(c, async (stream) => {
      const maxRetries = this.accountManager.getAccountCount() * 2;
      let attempts = 0;

      while (attempts < maxRetries) {
        attempts++;
        if (!accountInfo) break;
        const { token, projectId, accountId } = accountInfo;

        try {
          const geminiStream = this.client.streamGenerateContent(
            model,
            geminiRequest,
            token,
            projectId
          );

          for await (const chunk of geminiStream) {
            // 缓存 thinking 签名
            cacheThinkingSignaturesFromResponse(chunk, sessionId);

            // 转换响应 chunk
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

          break; // Success
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));

          // Check for 429 Rate Limit
          if (
            error.message.includes("429") ||
            error.message.includes("RESOURCE_EXHAUSTED")
          ) {
            logger.warn(
              `Rate limit encountered (stream) for account ${accountId}. Switching account...`
            );

            // Parse actual retry delay if available, otherwise default to 1 min
            const retryDelay = parseRetryDelay(error.message) || 60000;
            this.accountManager.markRateLimited(accountId, retryDelay);

            // Try to get next account
            accountInfo = await this.accountManager.getAccessToken();
            if (!accountInfo) {
              logger.error("No more available accounts after rate limit");
              throw new Error("No more available accounts after rate limit");
            }
            continue; // Retry with new account
          }

          logger.error(error.message, "Stream error");
          throw error;
        }
      }
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
