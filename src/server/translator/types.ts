/**
 * Translator Types
 *
 * 单向转换架构：多种输入格式 → Gemini → Antigravity
 *                          Gemini ← Antigravity → 多种输出格式
 */

import type { GeminiRequest, GeminiResponse } from "../../shared/types.js";

// ============================================
// Format Types
// ============================================

/**
 * 支持的 API 格式
 */
export type InputFormat =
  | "openai-chat" // OpenAI Chat Completions API
  | "openai-responses" // OpenAI Responses API (新版)
  | "claude" // Anthropic Claude Messages API
  | "gemini" // Google Gemini API (直接透传)
  | "acp"; // Anthropic Claude Protocol (Agent)

// ============================================
// Translator Options
// ============================================

/**
 * 转换选项
 */
export interface TranslateOptions {
  /** 模型 ID */
  model: string;
  /** 请求 ID */
  requestId: string;
  /** 会话 ID (用于 thinking 缓存) */
  sessionId: string;
  /** 是否流式请求 */
  stream?: boolean;
  /** 原始请求体 (用于响应转换时参考) */
  originalRequest?: unknown;
}

/**
 * 流式转换选项
 */
export interface StreamTranslateOptions extends TranslateOptions {
  /** 流式处理上下文 (有状态) */
  context: StreamContext;
}

/**
 * 流式处理上下文
 * 用于在多个 chunk 之间保持状态
 */
export interface StreamContext {
  /** 工具调用计数器 */
  toolCallCounter: number;
  /** 待匹配的工具调用 ID (name -> id) */
  pendingToolCalls: Map<string, string>;
  /** 是否已发送 role */
  roleSent: boolean;
  /** 累积的 content 用于后处理 */
  accumulatedContent: string;
  /** 自定义状态 */
  custom: Record<string, unknown>;
}

/**
 * 创建新的流式上下文
 */
export function createStreamContext(): StreamContext {
  return {
    toolCallCounter: 0,
    pendingToolCalls: new Map(),
    roleSent: false,
    accumulatedContent: "",
    custom: {},
  };
}

// ============================================
// Translator Interfaces
// ============================================

/**
 * 请求转换器接口
 * 将各种格式转换为 Gemini 格式
 */
export interface RequestTranslator {
  /**
   * 将输入格式转换为 Gemini 请求
   * @param body 原始请求体
   * @param options 转换选项
   * @returns Gemini 请求和额外元数据
   */
  toGemini(body: unknown, options: TranslateOptions): RequestTranslateResult;
}

/**
 * 请求转换结果
 */
export interface RequestTranslateResult {
  /** 转换后的 Gemini 请求 */
  request: GeminiRequest;
  /** 解析后的模型 ID */
  model: string;
  /** 是否为 thinking 模型 */
  isThinking: boolean;
  /** thinking budget (如果适用) */
  thinkingBudget?: number;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 响应转换器接口
 * 将 Gemini 响应转换为目标格式
 */
export interface ResponseTranslator {
  /**
   * 转换非流式响应
   * @param response Gemini 响应
   * @param options 转换选项
   * @returns 转换后的响应对象
   */
  fromGemini(response: GeminiResponse, options: TranslateOptions): unknown;

  /**
   * 转换流式响应的单个 chunk
   * @param chunk Gemini 响应 chunk
   * @param options 流式转换选项 (包含上下文)
   * @returns SSE 格式的字符串数组 (可能为空或多条)
   */
  fromGeminiStream(
    chunk: GeminiResponse,
    options: StreamTranslateOptions
  ): string[];

  /**
   * 流结束时的处理
   * @param options 流式转换选项
   * @returns 最终的 SSE 字符串数组 (如 [DONE])
   */
  finishStream(options: StreamTranslateOptions): string[];
}

/**
 * 完整的 Translator (请求 + 响应)
 */
export interface Translator {
  /** 格式标识 */
  format: InputFormat;
  /** 请求转换器 */
  request: RequestTranslator;
  /** 响应转换器 */
  response: ResponseTranslator;
}
