import { describe, it, expect } from "vitest";

// 测试 OpenAI Chat Translator 的请求转换逻辑
describe("OpenAI Chat Request Translation", () => {
  // 简化的转换逻辑测试
  interface OpenAIChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string | Array<{ type: string; text?: string }>;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }

  interface GeminiPart {
    text?: string;
    thought?: boolean;
    thoughtSignature?: string;
    functionCall?: { name: string; args: unknown; id?: string };
    functionResponse?: { name: string; response: unknown; id?: string };
    inlineData?: { mimeType: string; data: string };
  }

  interface GeminiContent {
    role: "user" | "model";
    parts: GeminiPart[];
  }

  function convertMessages(messages: OpenAIChatMessage[]): {
    contents: GeminiContent[];
    systemInstruction?: { parts: Array<{ text: string }> };
  } {
    const contents: GeminiContent[] = [];
    let systemInstruction: { parts: Array<{ text: string }> } | undefined;

    for (const message of messages) {
      if (message.role === "system") {
        const text = typeof message.content === "string"
          ? message.content
          : message.content.map(p => p.text || "").join("");

        if (systemInstruction) {
          systemInstruction.parts.push({ text });
        } else {
          systemInstruction = { parts: [{ text }] };
        }
        continue;
      }

      const role = message.role === "assistant" ? "model" : "user";
      const parts: GeminiPart[] = [];

      // Skip text content for tool messages (they contain JSON result)
      if (message.role !== "tool") {
        if (typeof message.content === "string") {
          if (message.content) {
            parts.push({ text: message.content });
          }
        } else if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === "text" && part.text) {
              parts.push({ text: part.text });
            }
          }
        }
      }

      // Handle tool calls
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          let args: unknown;
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch {
            args = {};
          }
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args,
              id: toolCall.id,
            },
          });
        }
      }

      // Handle tool results
      if (message.role === "tool" && message.tool_call_id) {
        let response: unknown;
        const content = typeof message.content === "string" ? message.content : "";
        try {
          response = JSON.parse(content);
        } catch {
          response = { result: content };
        }
        parts.push({
          functionResponse: {
            name: "tool",
            response,
            id: message.tool_call_id,
          },
        });
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return { contents, systemInstruction };
  }

  describe("convertMessages", () => {
    it("should convert simple user message", () => {
      const messages: OpenAIChatMessage[] = [
        { role: "user", content: "Hello, world!" },
      ];

      const result = convertMessages(messages);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].role).toBe("user");
      expect(result.contents[0].parts[0].text).toBe("Hello, world!");
    });

    it("should extract system message as systemInstruction", () => {
      const messages: OpenAIChatMessage[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hi!" },
      ];

      const result = convertMessages(messages);

      expect(result.systemInstruction).toBeDefined();
      expect(result.systemInstruction?.parts[0].text).toBe("You are a helpful assistant.");
      expect(result.contents).toHaveLength(1);
    });

    it("should merge multiple system messages", () => {
      const messages: OpenAIChatMessage[] = [
        { role: "system", content: "Rule 1" },
        { role: "system", content: "Rule 2" },
        { role: "user", content: "Hi!" },
      ];

      const result = convertMessages(messages);

      expect(result.systemInstruction?.parts).toHaveLength(2);
      expect(result.systemInstruction?.parts[0].text).toBe("Rule 1");
      expect(result.systemInstruction?.parts[1].text).toBe("Rule 2");
    });

    it("should convert assistant messages to model role", () => {
      const messages: OpenAIChatMessage[] = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
      ];

      const result = convertMessages(messages);

      expect(result.contents[1].role).toBe("model");
      expect(result.contents[1].parts[0].text).toBe("Hello!");
    });

    it("should handle array content", () => {
      const messages: OpenAIChatMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "Part 1" },
            { type: "text", text: "Part 2" },
          ],
        },
      ];

      const result = convertMessages(messages);

      expect(result.contents[0].parts).toHaveLength(2);
      expect(result.contents[0].parts[0].text).toBe("Part 1");
      expect(result.contents[0].parts[1].text).toBe("Part 2");
    });

    it("should convert tool calls", () => {
      const messages: OpenAIChatMessage[] = [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_123",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"location": "Tokyo"}',
              },
            },
          ],
        },
      ];

      const result = convertMessages(messages);

      expect(result.contents[0].parts[0].functionCall).toBeDefined();
      expect(result.contents[0].parts[0].functionCall?.name).toBe("get_weather");
      expect(result.contents[0].parts[0].functionCall?.args).toEqual({ location: "Tokyo" });
      expect(result.contents[0].parts[0].functionCall?.id).toBe("call_123");
    });

    it("should convert tool results", () => {
      const messages: OpenAIChatMessage[] = [
        {
          role: "tool",
          content: '{"temperature": 25}',
          tool_call_id: "call_123",
        },
      ];

      const result = convertMessages(messages);

      expect(result.contents[0].role).toBe("user");
      expect(result.contents[0].parts[0].functionResponse).toBeDefined();
      expect(result.contents[0].parts[0].functionResponse?.response).toEqual({ temperature: 25 });
      expect(result.contents[0].parts[0].functionResponse?.id).toBe("call_123");
    });

    it("should skip empty content", () => {
      const messages: OpenAIChatMessage[] = [
        { role: "user", content: "" },
        { role: "user", content: "Real message" },
      ];

      const result = convertMessages(messages);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].parts[0].text).toBe("Real message");
    });
  });
});

describe("OpenAI Chat Response Translation", () => {
  interface GeminiResponse {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          thought?: boolean;
          thoughtSignature?: string;
          functionCall?: { name: string; args: unknown; id?: string };
        }>;
      };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  }

  interface OpenAIChatChoice {
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }

  function convertResponse(response: GeminiResponse, requestId: string, model: string): {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: OpenAIChatChoice[];
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  } {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const textParts: string[] = [];
    const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
    let toolIdCounter = 0;

    for (const part of parts) {
      if (part.text && !part.thought) {
        textParts.push(part.text);
      }
      if (part.functionCall) {
        toolIdCounter++;
        toolCalls.push({
          id: part.functionCall.id || `call_${toolIdCounter}`,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          },
        });
      }
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    let mappedReason = "stop";
    if (toolCalls.length > 0) {
      mappedReason = "tool_calls";
    } else if (finishReason === "MAX_TOKENS") {
      mappedReason = "length";
    }

    const usage = response.usageMetadata || {};

    return {
      id: requestId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: textParts.length > 0 ? textParts.join("") : null,
            ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
          },
          finish_reason: mappedReason,
        },
      ],
      usage: {
        prompt_tokens: usage.promptTokenCount || 0,
        completion_tokens: usage.candidatesTokenCount || 0,
        total_tokens: (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0),
      },
    };
  }

  describe("convertResponse", () => {
    it("should convert simple text response", () => {
      const geminiResponse: GeminiResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "Hello, how can I help?" }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
        },
      };

      const result = convertResponse(geminiResponse, "req-123", "test-model");

      expect(result.object).toBe("chat.completion");
      expect(result.choices[0].message.content).toBe("Hello, how can I help?");
      expect(result.choices[0].finish_reason).toBe("stop");
      expect(result.usage.prompt_tokens).toBe(10);
      expect(result.usage.completion_tokens).toBe(5);
    });

    it("should filter out thinking blocks", () => {
      const geminiResponse: GeminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                { text: "Thinking...", thought: true },
                { text: "Final answer" },
              ],
            },
          },
        ],
      };

      const result = convertResponse(geminiResponse, "req-123", "test-model");

      expect(result.choices[0].message.content).toBe("Final answer");
    });

    it("should convert function calls", () => {
      const geminiResponse: GeminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "search",
                    args: { query: "weather" },
                    id: "fc_1",
                  },
                },
              ],
            },
          },
        ],
      };

      const result = convertResponse(geminiResponse, "req-123", "test-model");

      expect(result.choices[0].message.tool_calls).toHaveLength(1);
      expect(result.choices[0].message.tool_calls?.[0].id).toBe("fc_1");
      expect(result.choices[0].message.tool_calls?.[0].function.name).toBe("search");
      expect(result.choices[0].finish_reason).toBe("tool_calls");
    });

    it("should handle MAX_TOKENS finish reason", () => {
      const geminiResponse: GeminiResponse = {
        candidates: [
          {
            content: { parts: [{ text: "Truncated..." }] },
            finishReason: "MAX_TOKENS",
          },
        ],
      };

      const result = convertResponse(geminiResponse, "req-123", "test-model");

      expect(result.choices[0].finish_reason).toBe("length");
    });

    it("should handle empty response", () => {
      const geminiResponse: GeminiResponse = {
        candidates: [{ content: { parts: [] } }],
      };

      const result = convertResponse(geminiResponse, "req-123", "test-model");

      expect(result.choices[0].message.content).toBeNull();
    });
  });
});
