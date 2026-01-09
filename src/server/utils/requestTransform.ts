import type {
  OpenAIChatRequest,
  OpenAIMessage,
  GeminiRequest,
  GeminiContent,
  GeminiPart,
  GeminiTool,
  OpenAITool,
  AntigravityRequestBody,
  GeminiToolConfig,
} from "../../shared/index.js";
import {
  resolveModelId,
  getModelInfo,
  isClaudeThinkingModel,
  getModelFamily,
  parseModelWithTier,
} from "../../shared/index.js";

/**
 * Result of transforming OpenAI request to Antigravity format
 */
export interface TransformResult {
  model: string;
  geminiRequest: GeminiRequest;
  isThinking: boolean;
  thinkingBudget?: number;
}

/**
 * Transform OpenAI format request to Gemini/Antigravity format
 */
export function transformOpenAIToGemini(request: OpenAIChatRequest): TransformResult {
  const model = resolveModelId(request.model);
  const modelInfo = getModelInfo(model);
  const isClaude = getModelFamily(model) === "claude";
  const isThinking = isClaudeThinkingModel(model);
  const { thinkingBudget } = parseModelWithTier(model);

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
  const antigravityIdentity = `You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.
You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.
**Absolute paths only**
**Proactiveness**`;

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
  if (!userHasAntigravity) {
    if (systemInstruction?.parts) {
      // Insert Antigravity identity at the beginning
      systemInstruction.parts.unshift({ text: antigravityIdentity });
    } else {
      // No systemInstruction, create a new one
      systemInstruction = {
        parts: [{ text: antigravityIdentity }],
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
 * Generate a stable session ID based on conversation contents.
 * This helps reduce rate limiting by maintaining session continuity.
 *
 * Based on CLIProxyAPI's generateStableSessionID and antigravity-auth's
 * extractSessionFingerprint - same conversation should get same session ID.
 */
function generateStableSessionId(contents: GeminiContent[]): string {
  // Find first user message to create stable fingerprint
  for (const content of contents) {
    if (content.role === "user" && content.parts?.length) {
      const firstPart = content.parts[0];
      if ("text" in firstPart && firstPart.text) {
        // Use simple hash of first user message
        let hash = 0;
        const text = firstPart.text.slice(0, 200); // Use first 200 chars
        for (let i = 0; i < text.length; i++) {
          const char = text.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32bit integer
        }
        // Return as numeric string like CLIProxyAPI does
        return "-" + Math.abs(hash).toString();
      }
    }
  }
  // Fallback to random if no user content found
  return "-" + Math.floor(Math.random() * 9_000_000_000_000_000_000).toString();
}

/**
 * Wrap Gemini request in Antigravity envelope
 */
export function wrapInAntigravityEnvelope(
  model: string,
  geminiRequest: GeminiRequest,
  projectId: string
): AntigravityRequestBody {
  // Ensure systemInstruction has role set (required by Antigravity API)
  if (geminiRequest.systemInstruction) {
    geminiRequest.systemInstruction.role = "user";
  }

  // Generate stable session ID based on conversation contents
  // This helps reduce rate limiting by maintaining session continuity
  const sessionId = geminiRequest.contents
    ? generateStableSessionId(geminiRequest.contents)
    : "-" + Math.floor(Math.random() * 9_000_000_000_000_000_000).toString();

  return {
    project: projectId,
    model,
    request: {
      ...geminiRequest,
      sessionId,
    },
    userAgent: "antigravity",
    // Use 'agent-' prefix like CLIProxyAPI for better compatibility
    requestId: `agent-${crypto.randomUUID()}`,
    // requestType: 'agent' helps reduce 429 rate limiting
    requestType: "agent",
  };
}

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
