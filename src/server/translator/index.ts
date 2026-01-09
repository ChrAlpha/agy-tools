/**
 * Translator Module Entry Point
 *
 * 导出所有 translator 相关的类型和工具，
 * 并在导入时自动注册内置的 translators
 */

// 导出类型
export type {
  InputFormat,
  TranslateOptions,
  StreamTranslateOptions,
  StreamContext,
  RequestTranslator,
  ResponseTranslator,
  RequestTranslateResult,
  Translator,
} from "./types.js";

// 导出工具函数
export { createStreamContext } from "./types.js";

// 导出共享工具函数
export {
  generateProjectId,
  wrapInAntigravityEnvelope,
  unwrapAntigravityResponse
} from "./utils.js";

// 导出 Registry
export { registry, registerTranslator, registerTranslatorPair } from "./registry.js";

// 导出 thinking 工具
export {
  restoreThinkingSignatures,
  cacheThinkingSignaturesFromResponse,
  ensureToolIds,
  analyzeConversationState,
  needsThinkingRecovery,
  generateStableSessionId,
} from "./utils/thinkingUtils.js";

// 导出内置 translators
export { openaiChatTranslator } from "./openai-chat/index.js";
export { claudeTranslator } from "./claude/index.js";
export { openaiResponsesTranslator } from "./openai-responses/index.js";

// ============================================
// 自动注册内置 Translators
// ============================================

import { registry } from "./registry.js";
import { openaiChatTranslator } from "./openai-chat/index.js";
import { claudeTranslator } from "./claude/index.js";
import { openaiResponsesTranslator } from "./openai-responses/index.js";

// 注册 OpenAI Chat translator
registry.register(openaiChatTranslator);

// 注册 Claude translator
registry.register(claudeTranslator);

// 注册 OpenAI Responses translator
registry.register(openaiResponsesTranslator);

// TODO: 后续添加更多 translators
// registry.register(geminiTranslator);
// registry.register(acpTranslator);
