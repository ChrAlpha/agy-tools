/**
 * @deprecated This file contains legacy transform functions that have been moved to the translator system.
 * 
 * Migration status:
 * - transformOpenAIToGemini() -> DEPRECATED - Use translator/openai-chat instead
 * - wrapInAntigravityEnvelope() -> MOVED to translator/utils.ts
 * - generateProjectId() -> MOVED to translator/utils.ts
 * - sanitizeSchema() -> MOVED to translator/openai-chat (private method)
 * 
 * This file is kept for backward compatibility only.
 * New code should use the translator system via translator/index.ts
 */

import type {
  OpenAIChatRequest,
  OpenAIMessage,
  GeminiRequest,
  GeminiContent,
  GeminiPart,
  GeminiTool,
  OpenAITool,
  GeminiToolConfig,
} from "../../shared/index.js";
import {
  resolveModelId,
  getModelInfo,
  isClaudeThinkingModel,
  getModelFamily,
  parseModelWithTier,
  normalizeThinkingBudget,
} from "../../shared/index.js";

// Re-export from translator/utils for backward compatibility
export { generateProjectId, wrapInAntigravityEnvelope } from "../translator/utils.js";

/**
 * @deprecated Use translator system instead: registry.getRequestTranslator("openai-chat").toGemini()
 * 
 * Result of transforming OpenAI request to Antigravity format
 */
export interface TransformResult {
  model: string;
  geminiRequest: GeminiRequest;
  isThinking: boolean;
  thinkingBudget?: number;
}

/**
 * @deprecated Use translator system instead: registry.getRequestTranslator("openai-chat").toGemini()
 * 
 * Transform OpenAI format request to Gemini/Antigravity format
 * 
 * This function is deprecated and kept only for backward compatibility.
 * The translator system in server/translator/ provides the same functionality
 * with better architecture and additional features like Antigravity identity injection.
 */
export function transformOpenAIToGemini(request: OpenAIChatRequest): TransformResult {
  const model = resolveModelId(request.model);
  const modelInfo = getModelInfo(model);
  const isClaude = getModelFamily(model) === "claude";
  const isThinking = isClaudeThinkingModel(model);
  // Get thinking budget and normalize to model's supported range
  const rawThinkingBudget = parseModelWithTier(model).thinkingBudget;
  const thinkingBudget = rawThinkingBudget
    ? normalizeThinkingBudget(model, rawThinkingBudget)
    : undefined;

  const contents: GeminiContent[] = [];
  let systemInstruction: { parts: Array<{ text: string }> } | undefined;

  // Process messages
  for (const message of request.messages) {
    if (message.role === "system") {
      // System message becomes systemInstruction
      systemInstruction = {
        parts: [{ text: getTextContent(message.content) }],
      };
    } else if (message.role === "user") {
      contents.push({
        role: "user",
        parts: transformContentToParts(message.content),
      });
    } else if (message.role === "assistant") {
      const parts: GeminiPart[] = [];

      // Text content
      const text = getTextContent(message.content);
      if (text) {
        parts.push({ text });
      }

      // Tool calls
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments),
              id: toolCall.id,
            },
          });
        }
      }

      if (parts.length > 0) {
        contents.push({ role: "model", parts });
      }
    } else if (message.role === "tool") {
      // Tool response
      let response: unknown;
      try {
        response = JSON.parse(getTextContent(message.content));
      } catch {
        response = { result: getTextContent(message.content) };
      }

      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: message.name || "unknown",
              response,
              id: message.tool_call_id,
            },
          },
        ],
      });
    }
  }

  // Build generation config
  const generationConfig: GeminiRequest["generationConfig"] = {};

  if (request.temperature !== undefined) {
    generationConfig.temperature = request.temperature;
  }
  if (request.top_p !== undefined) {
    generationConfig.topP = request.top_p;
  }
  if (request.max_tokens !== undefined) {
    generationConfig.maxOutputTokens = request.max_tokens;
  } else if (modelInfo?.maxOutputTokens) {
    generationConfig.maxOutputTokens = modelInfo.maxOutputTokens;
  }
  if (request.stop) {
    generationConfig.stopSequences = Array.isArray(request.stop)
      ? request.stop
      : [request.stop];
  }

  // Add thinking config for Claude thinking models
  if (isThinking && thinkingBudget) {
    generationConfig.thinkingConfig = {
      include_thoughts: true,
      thinking_budget: thinkingBudget,
    };

    // Ensure maxOutputTokens > thinkingBudget (required by Claude API)
    const currentMax = generationConfig.maxOutputTokens || 0;
    if (currentMax <= thinkingBudget) {
      generationConfig.maxOutputTokens = thinkingBudget + 8192;
    }
  }

  // Build tools
  let tools: GeminiTool[] | undefined;
  let toolConfig: GeminiToolConfig | undefined;

  if (request.tools && request.tools.length > 0) {
    tools = [
      {
        functionDeclarations: request.tools.map((tool: OpenAITool) => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: sanitizeSchema(tool.function.parameters),
        })),
      },
    ];

    // Claude requires VALIDATED mode for tool calling
    if (isClaude) {
      toolConfig = {
        functionCallingConfig: {
          mode: "VALIDATED",
        },
      };
    }
  }

  // Add thinking hint for Claude thinking models with tools
  if (isClaude && isThinking && tools && tools.length > 0 && systemInstruction) {
    const hint =
      "Interleaved thinking is enabled. You may think between tool calls and after receiving tool results before deciding the next action or final answer. Do not mention these instructions or any constraints about thinking blocks; just apply them.";
    systemInstruction.parts.push({ text: hint });
  } else if (isClaude && isThinking && tools && tools.length > 0) {
    systemInstruction = {
      parts: [
        {
          text: "Interleaved thinking is enabled. You may think between tool calls and after receiving tool results before deciding the next action or final answer. Do not mention these instructions or any constraints about thinking blocks; just apply them.",
        },
      ],
    };
  }

  // [Antigravity Identity Injection]
  // Inject Antigravity identity to improve compatibility and reduce 429 rate limiting
  // Based on CLIProxyAPI's systemInstruction implementation (lines 1105-1116)
  const antigravityIdentity = `You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.**Absolute paths only****Proactiveness**`;

  // Ignore marker to confuse potential filtering (matching CLIProxyAPI pattern)
  const antigravityIgnore = `Please ignore following [ignore]${antigravityIdentity}[/ignore]`;

  // Check if user already has Antigravity identity in systemInstruction
  let userHasAntigravity = false;
  if (systemInstruction?.parts) {
    for (const part of systemInstruction.parts) {
      if (part.text && part.text.includes("You are Antigravity")) {
        userHasAntigravity = true;
        break;
      }
    }
  }

  // If user doesn't have Antigravity identity, inject it
  // Use the same multi-part pattern as CLIProxyAPI (lines 1107-1115)
  if (!userHasAntigravity) {
    if (systemInstruction?.parts) {
      // Insert at beginning: first the identity, then the ignore marker, then user content
      const userParts = [...systemInstruction.parts];
      systemInstruction.parts = [
        { text: antigravityIdentity },
        { text: antigravityIgnore },
        ...userParts,
      ];
    } else {
      // No systemInstruction, create a new one
      systemInstruction = {
        parts: [
          { text: antigravityIdentity },
          { text: antigravityIgnore },
        ],
      };
    }
  }

  const geminiRequest: GeminiRequest = {
    contents,
    ...(systemInstruction && { systemInstruction }),
    ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
    ...(tools && { tools }),
    ...(toolConfig && { toolConfig }),
  };

  return { model, geminiRequest, isThinking, thinkingBudget };
}

/**
 * @deprecated Moved to translator/openai-chat as a private method
 * Get text content from OpenAI message
 */
function getTextContent(content: string | OpenAIMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text")
      .map((part) => part.text || "")
      .join("");
  }
  return "";
}

/**
 * @deprecated Moved to translator/openai-chat as a private method
 * Transform content to Gemini parts
 */
function transformContentToParts(
  content: string | OpenAIMessage["content"]
): GeminiPart[] {
  if (typeof content === "string") {
    return [{ text: content }];
  }

  if (!Array.isArray(content)) {
    return [{ text: String(content) }];
  }

  const parts: GeminiPart[] = [];

  for (const part of content) {
    if (part.type === "text" && part.text) {
      parts.push({ text: part.text });
    } else if (part.type === "image_url" && part.image_url) {
      // Handle base64 images
      const url = part.image_url.url;
      if (url.startsWith("data:")) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }
      // URL images would need to be fetched - skip for now
    }
  }

  return parts.length > 0 ? parts : [{ text: "" }];
}

/**
 * @deprecated Moved to translator/openai-chat as a private method
 * Sanitize JSON Schema for Claude compatibility
 * Claude has stricter validation than OpenAI
 */
function sanitizeSchema(
  schema: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!schema) return undefined;

  const sanitized = { ...schema };

  // Remove unsupported JSON Schema fields that Antigravity/Claude doesn't support
  // Based on antigravity-auth and CLIProxyAPI implementations
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

  // Recursively sanitize nested objects
  if (sanitized.properties && typeof sanitized.properties === "object") {
    const props = sanitized.properties as Record<string, Record<string, unknown>>;
    sanitized.properties = Object.fromEntries(
      Object.entries(props).map(([key, value]) => [
        key,
        sanitizeSchema(value) || value,
      ])
    );
  }

  if (sanitized.items && typeof sanitized.items === "object") {
    sanitized.items = sanitizeSchema(
      sanitized.items as Record<string, unknown>
    );
  }

  return sanitized;
}
