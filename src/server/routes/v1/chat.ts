import type { Context } from "hono";
import { ProxyService } from "../../services/ProxyService.js";
import { logger } from "../../../shared/logger.js";
import type { OpenAIChatRequest, ClaudeRequest, OpenAIResponsesRequest } from "../../../shared/index.js";

const proxyService = new ProxyService();

/**
 * OpenAI Chat Completions API
 * POST /v1/chat/completions
 */
export async function chatCompletions(c: Context) {
  try {
    const body = await c.req.json<OpenAIChatRequest>();

    if (body.stream) {
      return proxyService.handleStreamRequest(c, body, "openai-chat");
    } else {
      const response = await proxyService.handleRequest(body, "openai-chat");
      return c.json(response);
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err, "Error in chatCompletions");
    return c.json(
      {
        error: {
          message: err.message,
          type: "server_error",
          code: "internal_error",
        },
      },
      500
    );
  }
}

/**
 * OpenAI Responses API (新版)
 * POST /v1/responses
 */
export async function responses(c: Context) {
  try {
    const body = await c.req.json<OpenAIResponsesRequest>();

    if (body.stream) {
      return proxyService.handleStreamRequest(c, body, "openai-responses");
    } else {
      const response = await proxyService.handleRequest(body, "openai-responses");
      return c.json(response);
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err, "Error in responses");
    return c.json(
      {
        error: {
          message: err.message,
          type: "server_error",
          code: "internal_error",
        },
      },
      500
    );
  }
}

/**
 * Claude Messages API
 * POST /v1/messages
 */
export async function claudeMessages(c: Context) {
  try {
    const body = await c.req.json<ClaudeRequest>();

    if (body.stream) {
      // Claude 流式响应需要特殊的 Content-Type
      const response = await proxyService.handleStreamRequest(c, body, "claude");
      return response;
    } else {
      const response = await proxyService.handleRequest(body, "claude");
      return c.json(response);
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err, "Error in claudeMessages");

    // Claude API 错误格式
    return c.json(
      {
        type: "error",
        error: {
          type: "api_error",
          message: err.message,
        },
      },
      500
    );
  }
}
