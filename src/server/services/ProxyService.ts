import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import {
  registry,
  createStreamContext,
  restoreThinkingSignatures,
  cacheThinkingSignaturesFromResponse,
  ensureToolIds,
  type InputFormat,
  type TranslateOptions,
  type StreamTranslateOptions,
} from "../translator/index.js";
import { AntigravityClient } from "./AntigravityClient.js";
import { AccountManager } from "./AccountManager.js";
import { logger } from "../../shared/logger.js";

/**
 * 生成唯一的会话 ID
 */
function generateSessionId(): string {
  return `agy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
   * 处理非流式请求
   */
  async handleRequest(
    body: unknown,
    format: InputFormat = "openai-chat"
  ): Promise<unknown> {
    const sessionId = generateSessionId();
    const requestId = generateRequestId();

    // 获取 translator
    const requestTranslator = registry.getRequestTranslator(format);
    const responseTranslator = registry.getResponseTranslator(format);

    // 转换请求
    const options: TranslateOptions = {
      model: "",
      requestId,
      sessionId,
      stream: false,
      originalRequest: body,
    };

    const translateResult = requestTranslator.toGemini(body, options);
    let geminiRequest = translateResult.request;
    const model = translateResult.model;

    // 更新 options 中的 model
    options.model = model;

    // 处理 thinking 签名恢复
    if (geminiRequest.contents) {
      geminiRequest = {
        ...geminiRequest,
        contents: restoreThinkingSignatures(geminiRequest.contents, sessionId),
      };
      // 确保工具 ID 匹配
      geminiRequest.contents = ensureToolIds(geminiRequest.contents);
    }

    // 获取有效 token
    let accountInfo = await this.accountManager.getAccessToken();
    if (!accountInfo) {
      throw new Error("No available accounts/tokens");
    }

    let geminiResponse;
    const maxRetries = this.accountManager.getAccountCount() * 2; // Allow 2 attempts per account (approx)
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
        if (error.message.includes("429") || error.message.includes("RESOURCE_EXHAUSTED")) {
          logger.warn(`Rate limit encountered for account ${accountId}. Switching account...`);

          // Mark current account as rate limited (default 1 min)
          this.accountManager.markRateLimited(accountId);

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
    const sessionId = generateSessionId();
    const requestId = generateRequestId();

    // 获取 translator
    const requestTranslator = registry.getRequestTranslator(format);
    const responseTranslator = registry.getResponseTranslator(format);

    // 转换请求
    const baseOptions: TranslateOptions = {
      model: "",
      requestId,
      sessionId,
      stream: true,
      originalRequest: body,
    };

    const translateResult = requestTranslator.toGemini(body, baseOptions);
    let geminiRequest = translateResult.request;
    const model = translateResult.model;

    // 更新 options 中的 model
    baseOptions.model = model;

    // 处理 thinking 签名恢复
    if (geminiRequest.contents) {
      geminiRequest = {
        ...geminiRequest,
        contents: restoreThinkingSignatures(geminiRequest.contents, sessionId),
      };
      geminiRequest.contents = ensureToolIds(geminiRequest.contents);
    }

    // 获取有效 token
    let accountInfo = await this.accountManager.getAccessToken();
    if (!accountInfo) {
      throw new Error("No available accounts/tokens");
    }

    // 创建流式上下文
    const streamContext = createStreamContext();
    const streamOptions: StreamTranslateOptions = {
      ...baseOptions,
      context: streamContext,
    };

    return streamSSE(c, async (stream) => {
      const maxRetries = this.accountManager.getAccountCount() * 2;
      let attempts = 0;

      while (attempts < maxRetries) {
        attempts++;
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
            const sseChunks = responseTranslator.fromGeminiStream(chunk, streamOptions);

            for (const sseChunk of sseChunks) {
              // sseChunk 已经是 "data: {...}\n\n" 格式
              // streamSSE 的 writeSSE 需要 { data: string } 格式
              // 我们需要提取 JSON 部分
              const match = sseChunk.match(/^data: (.+)\n\n$/);
              if (match) {
                await stream.writeSSE({ data: match[1] });
              }
            }
          }

          // 发送完成信号
          const finishChunks = responseTranslator.finishStream(streamOptions);
          for (const chunk of finishChunks) {
            const match = chunk.match(/^data: (.+)\n\n$/);
            if (match) {
              await stream.writeSSE({ data: match[1] });
            }
          }

          break; // Success
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));

          // Check for 429 Rate Limit
          if (error.message.includes("429") || error.message.includes("RESOURCE_EXHAUSTED")) {
            logger.warn(`Rate limit encountered (stream) for account ${accountId}. Switching account...`);

            // Mark current account as rate limited
            this.accountManager.markRateLimited(accountId);

            // Try to get next account
            accountInfo = await this.accountManager.getAccessToken();
            if (!accountInfo) {
              logger.error("No more available accounts after rate limit");
              throw new Error("No more available accounts after rate limit");
            }
            continue; // Retry with new account
          }

          logger.error(error, "Stream error");
          // If we've already started streaming, we can't do much but log.
          // But if it failed at the start (e.g. 429), we haven't sent chunks yet?
          // Actually streamSSE might have sent headers.
          // But we can just stop.
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
      throw new Error("Streaming not supported in legacy mode, use handleStreamRequest");
    }
    return this.handleRequest(body, "openai-chat");
  }
}
