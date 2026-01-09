/**
 * Thinking Utilities
 *
 * 处理 Claude thinking blocks 的签名恢复和缓存
 */

import { thinkingCache } from "../../services/thinkingCache.js";
import type { GeminiContent, GeminiPart, GeminiResponse } from "../../../shared/types.js";

/**
 * 恢复 conversation history 中 thinking blocks 的 signature
 *
 * Claude 要求历史消息中的 thinking blocks 必须有有效的 signature，
 * 否则会返回 400 错误。当客户端发送历史消息时，
 * signature 可能已丢失（很多客户端不保存），需要从缓存中恢复。
 *
 * 如果找不到 signature，则移除该 thinking block（Claude 可以接受无 thinking 的历史）
 */
export function restoreThinkingSignatures(
  contents: GeminiContent[],
  sessionId: string
): GeminiContent[] {
  return contents.map((content) => {
    if (!content.parts) return content;

    const processedParts: GeminiPart[] = [];

    for (const part of content.parts) {
      // 不是 thinking block，保持不变
      if (part.thought !== true) {
        processedParts.push(part);
        continue;
      }

      // 已有 signature，保持不变
      if (part.thoughtSignature) {
        processedParts.push(part);
        continue;
      }

      // 尝试从缓存恢复 signature
      const thinkingText = part.text || "";
      if (thinkingText) {
        const cachedSig = thinkingCache.get(sessionId, thinkingText);
        if (cachedSig) {
          processedParts.push({
            ...part,
            thoughtSignature: cachedSig,
          });
          continue;
        }
      }

      // 没有 signature 且缓存中也没有 - 跳过这个 thinking block
      // (Claude 会拒绝没有签名的 thinking block)
    }

    // 如果所有 parts 都被过滤掉了，保留一个空 text
    if (processedParts.length === 0) {
      return { ...content, parts: [{ text: "" }] };
    }

    return { ...content, parts: processedParts };
  });
}

/**
 * 从 Gemini 响应中缓存 thinking signatures
 *
 * 当收到包含 thinking blocks 的响应时，
 * 将其 signature 缓存起来，以便后续请求使用
 */
export function cacheThinkingSignaturesFromResponse(
  response: GeminiResponse,
  sessionId: string
): void {
  if (!response.candidates || !sessionId) return;

  for (const candidate of response.candidates) {
    if (!candidate.content?.parts) continue;

    for (const part of candidate.content.parts) {
      if (part.thought === true && part.text && part.thoughtSignature) {
        thinkingCache.set(sessionId, part.text, part.thoughtSignature);
      }
    }
  }
}

/**
 * 确保 functionCall 和 functionResponse 有匹配的 ID
 *
 * Claude 要求 tool_use.id 与 tool_result.tool_use_id 匹配，
 * 但有些客户端可能不传递 ID。使用 FIFO 队列来匹配。
 */
export function ensureToolIds(contents: GeminiContent[]): GeminiContent[] {
  let toolCallCounter = 0;
  // 按函数名追踪待匹配的 call IDs (FIFO 队列)
  const pendingCallIdsByName = new Map<string, string[]>();

  // 第一遍：为所有 functionCall 分配 ID 并收集
  const firstPassContents = contents.map((content) => {
    if (!content.parts) return content;

    const processedParts = content.parts.map((part) => {
      if (part.functionCall) {
        const call = { ...part.functionCall };
        if (!call.id) {
          call.id = `tool-call-${++toolCallCounter}`;
        }
        const nameKey = call.name || `tool-${toolCallCounter}`;
        // 压入队列
        const queue = pendingCallIdsByName.get(nameKey) || [];
        queue.push(call.id);
        pendingCallIdsByName.set(nameKey, queue);
        return { ...part, functionCall: call };
      }
      return part;
    });

    return { ...content, parts: processedParts };
  });

  // 第二遍：为 functionResponse 匹配 ID (FIFO 顺序)
  return firstPassContents.map((content) => {
    if (!content.parts) return content;

    const processedParts = content.parts.map((part) => {
      if (part.functionResponse) {
        const resp = { ...part.functionResponse };
        if (!resp.id && resp.name) {
          const queue = pendingCallIdsByName.get(resp.name);
          if (queue && queue.length > 0) {
            // 消费队首 ID (FIFO)
            resp.id = queue.shift();
            pendingCallIdsByName.set(resp.name, queue);
          }
        }
        return { ...part, functionResponse: resp };
      }
      return part;
    });

    return { ...content, parts: processedParts };
  });
}

/**
 * 生成稳定的会话 ID
 * 相同的对话内容应获得相同的会话 ID，有助于减少 429 限制并维持会话连续性。
 */
export function generateStableSessionId(contents: GeminiContent[]): string {
  // 查找第一个用户消息以创建稳定指纹
  for (const content of contents) {
    if (content.role === "user" && content.parts?.length) {
      const firstPart = content.parts[0];
      if ("text" in firstPart && firstPart.text) {
        // 使用首个用户消息的前 200 个字符进行简单哈希
        let hash = 0;
        const text = firstPart.text.slice(0, 200);
        for (let i = 0; i < text.length; i++) {
          const char = text.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash = hash & hash; // 转换为 32 位整数
        }
        return "-" + Math.abs(hash).toString();
      }
    }
  }
  // 如果没有找到用户内容，回退到随机 ID（12 位数字字符串以避免精度问题）
  return "-" + Math.floor(Math.random() * 1000000000000).toString();
}

/**
 * 分析对话状态，检测是否需要 thinking recovery
 *
 * 当 Claude thinking 模型的对话出现问题时（如工具调用没有 thinking），
 * 可能需要关闭当前轮次并开始新的轮次
 */
export interface ConversationState {
  /** 最后一个 assistant 消息是否有 thinking */
  lastAssistantHasThinking: boolean;
  /** 最后一个 assistant 消息是否有工具调用 */
  lastAssistantHasToolCall: boolean;
  /** 是否有未完成的工具调用 */
  hasPendingToolResults: boolean;
}

export function analyzeConversationState(contents: GeminiContent[]): ConversationState {
  let lastAssistantHasThinking = false;
  let lastAssistantHasToolCall = false;
  const pendingToolCalls = new Set<string>();
  const respondedToolCalls = new Set<string>();

  for (const content of contents) {
    if (!content.parts) continue;

    if (content.role === "model") {
      // 重置 assistant 状态
      lastAssistantHasThinking = false;
      lastAssistantHasToolCall = false;

      for (const part of content.parts) {
        if (part.thought === true) {
          lastAssistantHasThinking = true;
        }
        if (part.functionCall) {
          lastAssistantHasToolCall = true;
          if (part.functionCall.id) {
            pendingToolCalls.add(part.functionCall.id);
          }
        }
      }
    } else if (content.role === "user") {
      for (const part of content.parts) {
        if (part.functionResponse?.id) {
          respondedToolCalls.add(part.functionResponse.id);
          pendingToolCalls.delete(part.functionResponse.id);
        }
      }
    }
  }

  return {
    lastAssistantHasThinking,
    lastAssistantHasToolCall,
    hasPendingToolResults: pendingToolCalls.size > 0,
  };
}

/**
 * 检查是否需要 thinking recovery
 *
 * 当 assistant 有工具调用但没有 thinking 时，
 * 可能表示对话状态损坏，需要恢复
 */
export function needsThinkingRecovery(state: ConversationState): boolean {
  // 如果最后一个 assistant 消息有工具调用但没有 thinking，
  // 且还有待处理的工具结果，则需要恢复
  return (
    state.lastAssistantHasToolCall &&
    !state.lastAssistantHasThinking &&
    state.hasPendingToolResults
  );
}
