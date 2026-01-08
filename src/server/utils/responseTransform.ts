import type {
  GeminiResponse,
  GeminiCandidate,
  OpenAIChatResponse,
  OpenAIChatChoice,
  OpenAIMessage,
  OpenAIStreamChunk,
  OpenAIToolCall,
} from "../../shared/index.js";

/**
 * Unwrap Antigravity response envelope
 */
export function unwrapAntigravityResponse(data: unknown): GeminiResponse {
  if (typeof data === "object" && data !== null && "response" in data) {
    return (data as { response: GeminiResponse }).response;
  }
  return data as GeminiResponse;
}

/**
 * Transform Gemini response to OpenAI format
 */
export function transformGeminiToOpenAI(
  geminiResponse: GeminiResponse,
  model: string,
  requestId: string
): OpenAIChatResponse {
  const choices: OpenAIChatChoice[] = [];

  if (geminiResponse.candidates) {
    for (let i = 0; i < geminiResponse.candidates.length; i++) {
      const candidate = geminiResponse.candidates[i];
      choices.push(transformCandidate(candidate, i));
    }
  }

  return {
    id: requestId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices,
    usage: geminiResponse.usageMetadata
      ? {
        prompt_tokens: geminiResponse.usageMetadata.promptTokenCount || 0,
        completion_tokens: geminiResponse.usageMetadata.candidatesTokenCount || 0,
        total_tokens: geminiResponse.usageMetadata.totalTokenCount || 0,
      }
      : undefined,
  };
}

function transformCandidate(
  candidate: GeminiCandidate,
  index: number
): OpenAIChatChoice {
  const message: OpenAIMessage = {
    role: "assistant",
    content: "",
  };

  const toolCalls: OpenAIToolCall[] = [];
  const textParts: string[] = [];

  if (candidate.content?.parts) {
    for (const part of candidate.content.parts) {
      // Skip thinking parts (thought: true) - they should not be exposed to OpenAI clients
      if (part.thought === true) {
        continue;
      }

      if (part.text) {
        textParts.push(part.text);
      }
      if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.id || `call_${Date.now()}_${toolCalls.length}`,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          },
        });
      }
    }
  }

  message.content = textParts.join("");

  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  return {
    index,
    message,
    finish_reason: mapFinishReason(candidate.finishReason),
  };
}

export function mapFinishReason(
  reason?: string
): "stop" | "length" | "tool_calls" | "content_filter" | null {
  switch (reason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
      return "content_filter";
    default:
      return null;
  }
}

/**
 * Create an OpenAI-compatible streaming chunk
 */
export function createStreamChunk(
  model: string,
  requestId: string,
  delta: { content?: string; role?: "assistant"; tool_calls?: Partial<OpenAIToolCall>[] },
  finishReason: "stop" | "length" | "tool_calls" | "content_filter" | null = null
): OpenAIStreamChunk {
  return {
    id: requestId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  };
}

/**
 * Format data for SSE
 */
export function formatSSE(data: unknown): string {
  return "data: " + JSON.stringify(data) + "\n\n";
}

/**
 * Format SSE done signal
 */
export function formatSSEDone(): string {
  return formatSSE("[DONE]").replace(/\"/g, "");
}
