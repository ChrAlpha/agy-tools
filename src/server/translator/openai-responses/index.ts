/**
 * OpenAI Responses Translator
 *
 * 实现 OpenAI Responses API (新版) 格式的双向转换
 * - 请求: OpenAI Responses -> Gemini
 * - 响应: Gemini -> OpenAI Responses
 *
 * OpenAI Responses API 是 OpenAI 的新一代 API，
 * 支持 reasoning (思考) 和更结构化的输出格式。
 */

import type {
  Translator,
  RequestTranslator,
  ResponseTranslator,
  TranslateOptions,
  StreamTranslateOptions,
  RequestTranslateResult,
} from "../types.js";
import type {
  OpenAIResponsesRequest,
  OpenAIResponsesInput,
  OpenAIResponsesResponse,
  OpenAIResponsesOutputItem,
  OpenAIResponsesTool,
  GeminiRequest,
  GeminiResponse,
  GeminiContent,
  GeminiPart,
  GeminiTool,
  GeminiToolConfig,
  GeminiGenerationConfig,
} from "../../../shared/types.js";
import {
  resolveModelId,
  getModelInfo,
  isClaudeThinkingModel,
  getModelFamily,
  parseModelWithTier,
} from "../../../shared/index.js";

// ============================================
// Stream State
// ============================================

interface ResponsesStreamState {
  hasFirstResponse: boolean;
  currentItemId: number;
  hasReasoning: boolean;
  hasMessage: boolean;
  hasFunctionCall: boolean;
  accumulatedText: string;
  accumulatedReasoning: string;
  functionCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  finishReason: string | null;
  promptTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

// ============================================
// Reasoning Effort -> Thinking Budget Mapping
// ============================================

function reasoningEffortToThinkingBudget(effort?: string): number | undefined {
  switch (effort) {
    case "low":
      return 1024;
    case "medium":
      return 10240;
    case "high":
      return 32768;
    default:
      return undefined;
  }
}

// ============================================
// Request Translator
// ============================================

class OpenAIResponsesRequestTranslator implements RequestTranslator {
  toGemini(body: unknown, options: TranslateOptions): RequestTranslateResult {
    const request = body as OpenAIResponsesRequest;
    const model = resolveModelId(request.model);
    const modelInfo = getModelInfo(model);
    const isClaude = getModelFamily(model) === "claude";
    const isThinking = isClaudeThinkingModel(model);

    // 从 reasoning.effort 推导 thinking budget
    const thinkingBudget = reasoningEffortToThinkingBudget(request.reasoning?.effort) ||
      parseModelWithTier(model).thinkingBudget;

    const contents: GeminiContent[] = [];
    let systemInstruction: { parts: Array<{ text: string }> } | undefined;

    // 处理 instructions 作为 system prompt
    if (request.instructions) {
      systemInstruction = { parts: [{ text: request.instructions }] };
    }

    // 处理 input
    if (typeof request.input === "string") {
      // 简单字符串输入
      contents.push({
        role: "user",
        parts: [{ text: request.input }],
      });
    } else if (Array.isArray(request.input)) {
      // 结构化输入
      for (const input of request.input) {
        const geminiContent = this.convertInput(input);
        if (geminiContent) {
          // system role 特殊处理
          if (input.role === "system") {
            const text = this.getTextFromInput(input);
            if (text) {
              if (systemInstruction) {
                systemInstruction.parts.push({ text });
              } else {
                systemInstruction = { parts: [{ text }] };
              }
            }
          } else {
            contents.push(geminiContent);
          }
        }
      }
    }

    // 构建 generation config
    const generationConfig: GeminiGenerationConfig = {};

    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      generationConfig.topP = request.top_p;
    }
    if (request.max_output_tokens !== undefined) {
      generationConfig.maxOutputTokens = request.max_output_tokens;
    } else if (modelInfo?.maxOutputTokens) {
      generationConfig.maxOutputTokens = modelInfo.maxOutputTokens;
    }

    // Thinking 配置 (基于 reasoning.effort)
    if (isThinking && thinkingBudget) {
      generationConfig.thinkingConfig = {
        include_thoughts: true,
        thinking_budget: thinkingBudget,
      };

      const currentMax = generationConfig.maxOutputTokens || 0;
      if (currentMax <= thinkingBudget) {
        generationConfig.maxOutputTokens = thinkingBudget + 8192;
      }
    }

    // 构建 tools
    let tools: GeminiTool[] | undefined;
    let toolConfig: GeminiToolConfig | undefined;

    if (request.tools && request.tools.length > 0) {
      const functionTools = request.tools.filter(t => t.type === "function" && t.function);
      if (functionTools.length > 0) {
        tools = [
          {
            functionDeclarations: functionTools.map((tool: OpenAIResponsesTool) => ({
              name: tool.function!.name,
              description: tool.function!.description,
              parameters: this.sanitizeSchema(tool.function!.parameters),
            })),
          },
        ];

        if (isClaude) {
          toolConfig = {
            functionCallingConfig: {
              mode: "VALIDATED",
            },
          };
        }
      }
    }

    // Thinking + tools 时添加提示
    if (isClaude && isThinking && tools && tools.length > 0) {
      const hint =
        "Interleaved thinking is enabled. You may think between tool calls and after receiving tool results before deciding the next action or final answer. Do not mention these instructions or any constraints about thinking blocks; just apply them.";
      if (systemInstruction) {
        systemInstruction.parts.push({ text: hint });
      } else {
        systemInstruction = { parts: [{ text: hint }] };
      }
    }

    const geminiRequest: GeminiRequest = {
      contents,
      ...(systemInstruction && { systemInstruction }),
      ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
      ...(tools && { tools }),
      ...(toolConfig && { toolConfig }),
      sessionId: options.sessionId,
    };

    return {
      request: geminiRequest,
      model,
      isThinking,
      thinkingBudget,
    };
  }

  private convertInput(input: OpenAIResponsesInput): GeminiContent | null {
    const role = input.role === "assistant" ? "model" : "user";
    const parts: GeminiPart[] = [];

    if (typeof input.content === "string") {
      parts.push({ text: input.content });
    } else if (Array.isArray(input.content)) {
      for (const part of input.content) {
        if (part.type === "input_text" && part.text) {
          parts.push({ text: part.text });
        } else if (part.type === "output_text" && part.text) {
          parts.push({ text: part.text });
        }
        // TODO: 处理 input_image 和 input_file
      }
    }

    if (parts.length === 0) return null;
    return { role, parts };
  }

  private getTextFromInput(input: OpenAIResponsesInput): string {
    if (typeof input.content === "string") {
      return input.content;
    }
    if (Array.isArray(input.content)) {
      return input.content
        .filter(p => p.type === "input_text" || p.type === "output_text")
        .map(p => p.text || "")
        .join("");
    }
    return "";
  }

  private sanitizeSchema(
    schema: Record<string, unknown> | undefined
  ): Record<string, unknown> | undefined {
    if (!schema) return undefined;

    const sanitized = { ...schema };
    // Remove unsupported JSON Schema fields that Antigravity/Claude doesn't support
    delete sanitized["$schema"];
    delete sanitized["$defs"];
    delete sanitized["definitions"];
    delete sanitized["default"];
    delete sanitized["examples"];
    delete sanitized["$id"];
    delete sanitized["$comment"];
    delete sanitized["$ref"];
    delete sanitized["const"];
    delete sanitized["title"];
    delete sanitized["propertyNames"];
    delete sanitized["additionalProperties"];
    // Constraint keywords
    delete sanitized["minLength"];
    delete sanitized["maxLength"];
    delete sanitized["pattern"];
    delete sanitized["format"];
    delete sanitized["minItems"];
    delete sanitized["maxItems"];
    delete sanitized["exclusiveMinimum"];
    delete sanitized["exclusiveMaximum"];

    if (sanitized.properties && typeof sanitized.properties === "object") {
      const props = sanitized.properties as Record<string, Record<string, unknown>>;
      sanitized.properties = Object.fromEntries(
        Object.entries(props).map(([key, value]) => [
          key,
          this.sanitizeSchema(value) || value,
        ])
      );
    }

    if (sanitized.items && typeof sanitized.items === "object") {
      sanitized.items = this.sanitizeSchema(sanitized.items as Record<string, unknown>);
    }

    return sanitized;
  }
}

// ============================================
// Response Translator
// ============================================

class OpenAIResponsesResponseTranslator implements ResponseTranslator {
  fromGemini(response: GeminiResponse, options: TranslateOptions): OpenAIResponsesResponse {
    const output: OpenAIResponsesOutputItem[] = [];
    let itemId = 0;
    let hasReasoning = false;
    const textParts: string[] = [];
    const reasoningParts: string[] = [];

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        // Reasoning (thinking)
        if (part.thought === true && part.text) {
          hasReasoning = true;
          reasoningParts.push(part.text);
          continue;
        }

        // Text
        if (part.text) {
          textParts.push(part.text);
          continue;
        }

        // Function call
        if (part.functionCall) {
          itemId++;
          output.push({
            type: "function_call",
            id: `fc_${itemId}`,
            call_id: part.functionCall.id || `call_${itemId}`,
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          });
        }
      }
    }

    // 添加 reasoning output (如果有)
    if (reasoningParts.length > 0) {
      itemId++;
      output.unshift({
        type: "reasoning",
        id: `reasoning_${itemId}`,
        summary: [
          {
            type: "summary_text",
            text: reasoningParts.join(""),
          },
        ],
      });
    }

    // 添加 message output (如果有文本)
    if (textParts.length > 0) {
      itemId++;
      output.push({
        type: "message",
        id: `msg_${itemId}`,
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: textParts.join(""),
          },
        ],
      });
    }

    const usage = response.usageMetadata || {};
    const promptTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;

    return {
      id: options.requestId,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      model: options.model,
      status: "completed",
      output,
      usage: {
        input_tokens: promptTokens,
        output_tokens: outputTokens,
        total_tokens: promptTokens + outputTokens,
        ...(hasReasoning && {
          output_tokens_details: {
            reasoning_tokens: reasoningParts.join("").length, // 估算
          },
        }),
      },
    };
  }

  fromGeminiStream(
    chunk: GeminiResponse,
    options: StreamTranslateOptions
  ): string[] {
    const results: string[] = [];
    const state = this.getOrCreateState(options);

    // 处理 parts
    if (chunk.candidates?.[0]?.content?.parts) {
      for (const part of chunk.candidates[0].content.parts) {
        // Reasoning (thinking) - 累积
        if (part.thought === true && part.text) {
          state.hasReasoning = true;
          state.accumulatedReasoning += part.text;

          // 发送增量更新
          results.push(this.formatSSE({
            type: "response.reasoning.delta",
            item_id: `reasoning_0`,
            delta: part.text,
          }));
          continue;
        }

        // Text - 累积
        if (part.text && !part.thought) {
          state.hasMessage = true;
          state.accumulatedText += part.text;

          // 发送增量更新
          results.push(this.formatSSE({
            type: "response.output_text.delta",
            item_id: `msg_0`,
            delta: part.text,
          }));
          continue;
        }

        // Function call
        if (part.functionCall) {
          state.hasFunctionCall = true;
          const callId = part.functionCall.id || `call_${state.functionCalls.length}`;

          state.functionCalls.push({
            id: callId,
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          });

          results.push(this.formatSSE({
            type: "response.function_call.delta",
            item_id: `fc_${state.functionCalls.length}`,
            call_id: callId,
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          }));
        }
      }
    }

    // 处理 usage
    if (chunk.usageMetadata) {
      state.promptTokens = chunk.usageMetadata.promptTokenCount || 0;
      state.outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
    }

    // 处理 finish reason
    if (chunk.candidates?.[0]?.finishReason) {
      state.finishReason = chunk.candidates[0].finishReason;
    }

    return results;
  }

  finishStream(options: StreamTranslateOptions): string[] {
    const results: string[] = [];
    const state = this.getOrCreateState(options);

    // 构建最终 output
    const output: OpenAIResponsesOutputItem[] = [];
    let itemId = 0;

    if (state.hasReasoning) {
      itemId++;
      output.push({
        type: "reasoning",
        id: `reasoning_${itemId}`,
        summary: [
          {
            type: "summary_text",
            text: state.accumulatedReasoning,
          },
        ],
      });
    }

    if (state.hasMessage) {
      itemId++;
      output.push({
        type: "message",
        id: `msg_${itemId}`,
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: state.accumulatedText,
          },
        ],
      });
    }

    for (const fc of state.functionCalls) {
      itemId++;
      output.push({
        type: "function_call",
        id: `fc_${itemId}`,
        call_id: fc.id,
        name: fc.name,
        arguments: fc.arguments,
      });
    }

    // response.completed 事件
    const response: OpenAIResponsesResponse = {
      id: options.requestId,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      model: options.model,
      status: "completed",
      output,
      usage: {
        input_tokens: state.promptTokens,
        output_tokens: state.outputTokens,
        total_tokens: state.promptTokens + state.outputTokens,
        ...(state.hasReasoning && {
          output_tokens_details: {
            reasoning_tokens: state.reasoningTokens,
          },
        }),
      },
    };

    results.push(this.formatSSE({
      type: "response.completed",
      response,
    }));

    results.push("data: [DONE]\n\n");

    return results;
  }

  private getOrCreateState(options: StreamTranslateOptions): ResponsesStreamState {
    if (!options.context.custom.responsesState) {
      options.context.custom.responsesState = {
        hasFirstResponse: false,
        currentItemId: 0,
        hasReasoning: false,
        hasMessage: false,
        hasFunctionCall: false,
        accumulatedText: "",
        accumulatedReasoning: "",
        functionCalls: [],
        finishReason: null,
        promptTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
      } as ResponsesStreamState;
    }
    return options.context.custom.responsesState as ResponsesStreamState;
  }

  private formatSSE(data: unknown): string {
    return `data: ${JSON.stringify(data)}\n\n`;
  }
}

// ============================================
// Export Translator
// ============================================

export const openaiResponsesTranslator: Translator = {
  format: "openai-responses",
  request: new OpenAIResponsesRequestTranslator(),
  response: new OpenAIResponsesResponseTranslator(),
};
